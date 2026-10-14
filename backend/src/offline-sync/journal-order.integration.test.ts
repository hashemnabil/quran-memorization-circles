import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
const url = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
const available = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/quran_test';
test('journal sequences cannot commit out of order across separate transactions', { skip: !available }, async () => {
  const first = new PrismaService(), second = new PrismaService();
  const a = randomUUID(), b = randomUUID(); const suffix = randomUUID().slice(0, 8);
  let release!: () => void, held!: () => void, started!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { held = resolve; });
  const active = new Promise<void>(resolve => { started = resolve; });
  let tx1: Promise<unknown> | undefined, tx2: Promise<unknown> | undefined;
  try {
    await first.circle.createMany({ data: [{ id: a, name: 'a', code: `ORDER-A-${suffix}` }, { id: b, name: 'b', code: `ORDER-B-${suffix}` }] });
    const watermark = (await first.$queryRaw<Array<{ seq: bigint }>>`SELECT MAX(seq)::bigint AS seq FROM sync_changes`)[0].seq;
    tx1 = first.$transaction(async tx => { await tx.circle.update({ where: { id: a }, data: { name: 'first' } }); held(); await hold; }, { timeout: 15000 });
    await locked;
    let pid = 0;
    tx2 = second.$transaction(async tx => {
      pid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid; started();
      await tx.circle.update({ where: { id: b }, data: { name: 'second' } });
    }, { timeout: 15000 });
    await active;
    const deadline = Date.now() + 5000; let waiting = false;
    while (Date.now() < deadline) {
      const rows = await first.$queryRaw<Array<{ wait_event: string | null }>>`SELECT wait_event FROM pg_stat_activity WHERE pid = ${pid}`;
      if (rows[0]?.wait_event === 'advisory') { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(waiting, true, 'second journal writer must wait before sequence allocation');
    assert.equal((await first.$queryRaw<Array<{ seq: bigint }>>`SELECT MAX(seq)::bigint AS seq FROM sync_changes`)[0].seq, watermark);
    release(); await Promise.all([tx1, tx2]);
    const changes = await first.$queryRaw<Array<{ entityId: string }>>`SELECT "entityId" FROM sync_changes WHERE seq > ${watermark} AND entity = 'circles' ORDER BY seq`;
    assert.deepEqual(changes.map(row => row.entityId), [a, b]);
  } finally {
    release(); await Promise.allSettled([tx1, tx2]);
    await first.circle.deleteMany({ where: { id: { in: [a, b] } } });
    await first.$disconnect(); await second.$disconnect();
  }
});
