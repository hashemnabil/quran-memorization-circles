import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { FullSyncService } from './sync-all.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const url = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
const available = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/quran_test';

test('offline account operations hash chosen passwords and replay without duplicating accounts', { skip: !available, timeout: 60000 }, async () => {
  const db = new PrismaService();
  const actorId = randomUUID(), studentId = randomUUID(), localUserId = randomUUID();
  const actor = { id: actorId, role: Role.ADMIN, fullName: 'Account sync admin', username: actorId, email: null } as any;
  const username = `offline_${randomUUID().slice(0, 8)}`;
  const config = new ConfigService({ JWT_ACCESS_SECRET: 'integration-only-credential-key-not-production', BCRYPT_ROUNDS: '4' });
  const service = new FullSyncService(db, config);
  let studentUserId: string | undefined; let staffId: string | undefined;
  try {
    await db.user.create({ data: { id: actorId, username: actorId, fullName: actor.fullName, role: Role.ADMIN, passwordHash: 'test-only' } });
    await db.student.create({ data: { id: studentId, code: `3${Date.now().toString().slice(-8)}`, fullName: 'Account student', status: 'ACTIVITY' } });
    const operations = [
      { opId: randomUUID(), entityId: studentId, table: 'studentAccounts', action: 'create', data: { password: 'StudentFirst123' } },
      { opId: randomUUID(), entityId: studentId, table: 'studentAccounts', action: 'reset-password', data: { password: 'StudentReset123' } },
      { opId: randomUUID(), entityId: localUserId, table: 'users', action: 'create', data: { username, fullName: 'Offline staff', role: 'TEACHER', password: 'StaffFirst123' } },
      { opId: randomUUID(), entityId: localUserId, table: 'users', action: 'reset-password', data: { newPassword: 'StaffReset123' } },
    ];
    const first = await service.push(actor, { operations });
    assert(first.outcomes.every(row => row.status === 'applied'), JSON.stringify(first));
    staffId = first.outcomes[2].data.id;
    studentUserId = (await db.student.findUniqueOrThrow({ where: { id: studentId } })).userId!;
    assert(await bcrypt.compare('StudentReset123', (await db.user.findUniqueOrThrow({ where: { id: studentUserId } })).passwordHash));
    assert(await bcrypt.compare('StaffReset123', (await db.user.findUniqueOrThrow({ where: { id: staffId } })).passwordHash));
    assert.deepEqual(await service.push(actor, { operations }), first);
    assert.equal(await db.user.count({ where: { username } }), 1);
    const receipts = await db.processedOperation.findMany({ where: { accountId: actorId } });
    assert.equal(receipts.length, 4);
    for (const secret of ['StudentFirst123', 'StudentReset123', 'StaffFirst123', 'StaffReset123']) assert(!JSON.stringify(receipts).includes(secret));
  } finally {
    await db.student.deleteMany({ where: { id: studentId } });
    await db.processedOperation.deleteMany({ where: { accountId: actorId } });
    await db.user.deleteMany({ where: { OR: [{ id: { in: [actorId, ...[studentUserId, staffId].filter((id): id is string => Boolean(id))] } }, { username }] } });
    await db.$disconnect();
  }
});

test('student create and edit succeed through full-sync including an empty optional birth date', { skip: !available }, async () => {
  const db = new PrismaService();
  const actorId = randomUUID(), circleId = randomUUID(), localId = randomUUID(), createId = randomUUID(), editId = randomUUID();
  const service = new FullSyncService(db, new ConfigService());
  const actor = { id: actorId, role: Role.ADMIN, fullName: 'Sync admin', username: actorId, email: null } as any;
  let studentId: string | undefined;
  try {
    await db.user.create({ data: { id: actorId, username: actorId, fullName: actor.fullName, passwordHash: 'test-only', role: Role.ADMIN } });
    await db.circle.create({ data: { id: circleId, name: 'Online CRUD test', code: `CRUD-${circleId}` } });
    const created = await service.push(actor, { operations: [{ opId: createId, entityId: localId, table: 'students', action: 'create', data: { fullName: 'new student', circleId, registrationTrack: 'CIRCLE', createAccount: false, guardianRelation: 'الأب', memorizedParts: 0 } }] });
    assert.equal(created.outcomes[0].status, 'applied', JSON.stringify(created));
    studentId = created.outcomes[0].data.id;
    assert.ok(studentId);
    const edited = await service.push(actor, { operations: [{ opId: editId, entityId: studentId, table: 'students', action: 'update', data: { id: studentId, fullName: 'edited student', birthDate: '', phone: '', guardianPhone: '', circleId } }] });
    assert.equal(edited.outcomes[0].status, 'applied', JSON.stringify(edited));
    assert.equal((await db.student.findUnique({ where: { id: studentId } }))?.fullName, 'edited student');
  } finally {
    if (studentId) await db.student.deleteMany({ where: { id: studentId } });
    await db.circle.deleteMany({ where: { id: circleId } });
    await db.activityLog.deleteMany({ where: { userId: actorId } });
    await db.processedOperation.deleteMany({ where: { accountId: actorId } });
    await db.user.deleteMany({ where: { id: actorId } });
    await db.$disconnect();
  }
});

test('legacy questionnaire sync waits for approval, then updates the same record and rejects another student', { skip: !available }, async () => {
  const db = new PrismaService();
  const userId = randomUUID(), studentId = randomUUID(), otherId = randomUUID(), adminId = randomUUID();
  const service = new FullSyncService(db, new ConfigService());
  const actor = { id: userId, role: Role.STUDENT, fullName: 'Student', username: userId, email: null } as any;
  try {
    await db.user.createMany({ data: [
      { id: userId, username: userId, fullName: 'Student', passwordHash: 'test-only', role: Role.STUDENT },
      { id: adminId, username: adminId, fullName: 'Administrator', passwordHash: 'test-only', role: Role.ADMIN },
    ] });
    await db.student.createMany({ data: [{ id: studentId, userId, code: `SELF-${studentId}`, fullName: 'Student' }, { id: otherId, code: `OTHER-${otherId}`, fullName: 'Other student' }] });
    const saved = await service.push(actor, { operations: [{ opId: randomUUID(), entityId: studentId, table: 'students', action: 'questionnaire', data: { address: 'My new address', guardianName: 'Guardian', guardianPhone: '0591234567' } }] });
    assert.equal(saved.outcomes[0].status, 'applied', JSON.stringify(saved));
    assert.equal(saved.outcomes[0].data.selfAccountId, userId);
    const request = saved.outcomes[0].data.verificationRequest;
    assert.equal(request.status, 'PENDING'); assert.equal(request.subjectId, studentId);
    const admin = { id: adminId, role: Role.ADMIN, fullName: 'Administrator' } as any;
    const before = await service.pull(admin, 'students', 1, new Set([studentId]));
    assert.equal(before.data.find((row: any) => row.id === studentId)?.address, null);
    const operation = { opId: randomUUID(), entityId: request.id, table: 'profileReviews', action: 'decision', data: { status: 'APPROVED' } };
    const approved = await service.push(admin, { operations: [operation] });
    assert.equal(approved.outcomes[0].status, 'applied', JSON.stringify(approved));
    const adminPull = await service.pull(admin, 'students', 1, new Set([studentId]));
    assert.equal(adminPull.data.find((row: any) => row.id === studentId)?.address, 'My new address');
    const count = await db.notification.count({ where: { userId } });
    assert.equal((await service.push(admin, { operations: [operation] })).outcomes[0].status, 'applied');
    assert.equal(await db.notification.count({ where: { userId } }), count);
    const denied = await service.push(actor, { operations: [{ opId: randomUUID(), entityId: otherId, table: 'students', action: 'questionnaire', data: { fullName: 'Tampered' } }] });
    assert.equal(denied.outcomes[0].status, 'rejected');
    assert.equal((await db.student.findUnique({ where: { id: otherId } }))?.fullName, 'Other student');
  } finally {
    await db.student.deleteMany({ where: { id: { in: [studentId, otherId] } } });
    await db.profileReview.deleteMany({ where: { requesterId: userId } });
    await db.activityLog.deleteMany({ where: { userId: { in: [userId, adminId] } } });
    await db.processedOperation.deleteMany({ where: { accountId: { in: [userId, adminId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
    await db.$disconnect();
  }
});

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
