import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { FullSyncService } from './sync-all.service';
import { Role } from '@prisma/client';
const url = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
const available = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/quran_test';

test('full-sync delta sends changed circle only, scopes IDs, and preserves deletion hints', { skip: !available }, async () => {
  const db = new PrismaService();
  const a = randomUUID(), b = randomUUID(), suffix = randomUUID();
  const service = new FullSyncService(db, new ConfigService());
  const admin = { id: randomUUID(), role: Role.ADMIN } as any;
  try {
    await db.circle.createMany({ data: [{ id: a, name: 'before', code: `DELTA-A-${suffix}` }, { id: b, name: 'unchanged', code: `DELTA-B-${suffix}` }] });
    const cursor = (await service.watermark()).cursor;
    await db.circle.update({ where: { id: a }, data: { name: 'after' } });
    const changed = await service.delta(admin, cursor);
    assert.deepEqual(changed.tables.circles.data.map((row: any) => row.id), [a]);
    assert.equal(changed.tables.circles.data[0].name, 'after');
    assert.ok(changed.tables.circles.visibleIds.includes(b));
    const restricted = await service.delta({ id: randomUUID(), role: Role.TEACHER } as any, cursor);
    assert.deepEqual(restricted.tables.circles.data, []);
    assert.deepEqual(restricted.tables.circles.visibleIds, []);
    await db.circle.delete({ where: { id: a } });
    const deleted = await service.delta(admin, changed.cursor);
    assert.deepEqual(deleted.tables.circles.data, []);
    assert.ok(!deleted.tables.circles.visibleIds.includes(a));
  } finally {
    await db.circle.deleteMany({ where: { id: { in: [a, b] } } });
    await db.$disconnect();
  }
});
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
