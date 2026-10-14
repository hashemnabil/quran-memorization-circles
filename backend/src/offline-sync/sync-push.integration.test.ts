import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Role, AttendanceStatus } from '@prisma/client';
import { OfflineSyncService } from './offline-sync.service';
import { AccessControlService } from '../common/services/access-control.service';

// Run only against the disposable test database created by CI. Never production.
test('sync push commits domain writes and durable outcomes atomically', { timeout: 60000 }, async (t) => {
  const target = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/quran_test', 'Integration tests require the disposable local quran_test database');
  const db = new PrismaClient();
  const suffix = randomUUID();
  const circleId = randomUUID();
  const otherCircleId = randomUUID();
  const studentId = randomUUID();
  const actorId = randomUUID();
  const parentId = randomUUID();
  const teacherId = randomUUID();
  const date = '2026-01-01';
  const actor = { id: actorId, role: Role.TEACHER, teacherId } as any;
  const svc = new OfflineSyncService(db as any, new AccessControlService(db as any));
  const operation = (opId: string, status: AttendanceStatus = AttendanceStatus.ABSENT) => ({
    opId, entity: 'attendance', kind: 'record', data: { circleId, date, entries: [{ studentId, status }] },
  });
  const push = (op: any, user = actor) => svc.pushOperations(user, { operations: [op] });
  try {
    await db.user.createMany({ data: [
      { id: actorId, username: `sync-staff-${suffix}`, fullName: 'Test teacher', passwordHash: 'test-only', role: Role.TEACHER },
      { id: parentId, username: `sync-parent-${suffix}`, fullName: 'Test parent', passwordHash: 'test-only', role: Role.PARENT },
    ] });
    await db.teacherProfile.create({ data: { id: teacherId, userId: actorId } });
    const parent = await db.parentProfile.create({ data: { userId: parentId } });
    await db.circle.createMany({ data: [
      { id: circleId, name: 'Sync test', code: `SYNC-${suffix}` },
      { id: otherCircleId, name: 'Private', code: `PRIVATE-${suffix}` },
    ] });
    await db.circleTeacher.create({ data: { circleId, teacherId, role: 'PRIMARY' } });
    await db.student.create({ data: { id: studentId, code: `S-${suffix}`, fullName: 'Test student', circleId, parentId: parent.id } });

    await t.test('network loss after commit: replay returns saved result without duplicate notifications', async () => {
      const op = operation(`replay-${suffix}`);
      const first = await push(op);
      const replay = await push(op);
      assert.equal(first.results[0].status, 'applied');
      assert.equal(replay.results[0].replayed, true);
      assert.deepEqual({ ...replay.results[0], replayed: undefined }, { ...first.results[0], replayed: undefined });
      assert.equal(await db.attendance.count({ where: { studentId } }), 1);
      assert.equal(await db.notification.count({ where: { userId: parentId } }), 1);
      assert.equal(await db.activityLog.count({ where: { userId: actorId } }), 1);
    });
    await t.test('same opId with changed data is rejected and cannot overwrite attendance', async () => {
      const result = await push(operation(`replay-${suffix}`, AttendanceStatus.PRESENT));
      assert.equal(result.results[0].code, 'OP_ID_REUSED');
      assert.equal((await db.attendance.findFirst({ where: { studentId } }))?.status, AttendanceStatus.ABSENT);
    });
    await t.test('concurrent duplicate requests only apply once', async () => {
      const op = operation(`parallel-${suffix}`, AttendanceStatus.PRESENT);
      const outcomes = await Promise.all([push(op), push(op)]);
      assert.equal(outcomes.every((outcome) => outcome.results[0].status === 'applied'), true);
      assert.equal(outcomes.filter((outcome) => outcome.results[0].replayed).length, 1);
      assert.equal(await db.activityLog.count({ where: { userId: actorId } }), 2);
    });
    await t.test('two devices resolve a later absence in favor of PRESENT and report the resolution', async () => {
      const result = await push(operation(`conflict-${suffix}`));
      assert.equal(result.results[0].status, 'applied');
      assert.equal((result.results[0].data?.conflicts as any[])[0].saved, 'PRESENT');
      assert.equal((await db.attendance.findFirst({ where: { studentId } }))?.status, AttendanceStatus.PRESENT);
    });
    await t.test('parent, student, support and exam committee cannot write even if payload claims staff access', async () => {
      for (const role of [Role.PARENT, Role.STUDENT, Role.SUPPORT, Role.EXAM_COMMITTEE]) {
        const result = await push(operation(`role-${role}-${suffix}`), { id: parentId, role, teacherId } as any);
        assert.equal(result.results[0].code, 'FORBIDDEN');
      }
    });
    await t.test('a teacher cannot write another circle or a mismatched student roster', async () => {
      const op = operation(`scope-${suffix}`); op.data.circleId = otherCircleId;
      assert.equal((await push(op)).results[0].code, 'FORBIDDEN');
      const invalid = operation(`student-${suffix}`); invalid.data.entries[0].studentId = randomUUID();
      assert.equal((await push(invalid)).results[0].code, 'INVALID_DATA');
      assert.equal(await db.processedOperation.count({ where: { accountId: actorId, opId: invalid.opId } }), 0);
    });
    await t.test('unsupported kinds, unknown fields and invalid dates fail closed', async () => {
      const op = operation(`invalid-${suffix}`);
      assert.equal((await push({ ...op, kind: 'delete' })).results[0].code, 'UNSUPPORTED_OPERATION');
      assert.equal((await push({ ...op, data: { ...op.data, recordedById: parentId } })).results[0].code, 'INVALID_DATA');
      assert.equal((await push({ ...op, data: { ...op.data, date: '2026-02-30' } })).results[0].code, 'INVALID_DATA');
    });
    await t.test('corrections use optimistic concurrency and stale devices cannot overwrite newer values', async () => {
      const row = await db.attendance.findFirstOrThrow({ where: { studentId } });
      const make = (id: string) => ({ opId: id, entity: 'attendance', kind: 'correct', baseUpdatedAt: row.updatedAt.toISOString(), data: { id: row.id, status: 'EXCUSED', note: 'reviewed' } });
      assert.equal((await push(make(`correct-${suffix}`))).results[0].status, 'applied');
      assert.equal((await push(make(`stale-${suffix}`))).results[0].status, 'conflict');
    });
    await t.test('failure to persist the receipt rolls back attendance, notifications and audit', async () => {
      const failedOp = operation(`rollback-${suffix}`);
      failedOp.data.date = '2026-01-02';
      const failingDb = { $transaction: (callback: any, options: any) => db.$transaction((tx) => callback(new Proxy(tx, {
        get(target, key) { return key === 'processedOperation' ? { findUnique: target.processedOperation.findUnique.bind(target.processedOperation), create: async () => { throw new Error('simulated receipt failure'); } } : Reflect.get(target, key); },
      })), options) };
      const failingSvc = new OfflineSyncService(failingDb as any, new AccessControlService(db as any));
      await assert.rejects(failingSvc.pushOperations(actor, { operations: [failedOp] }), /simulated receipt failure/);
      assert.equal(await db.attendance.count({ where: { studentId, date: new Date('2026-01-02') } }), 0);
      assert.equal(await db.processedOperation.count({ where: { accountId: actorId, opId: failedOp.opId } }), 0);
      const recovered = await push(failedOp);
      assert.equal(recovered.results[0].status, 'applied');
      assert.equal(await db.notification.count({ where: { userId: parentId } }), 2);
    });
    await t.test('revoked teacher assignments prevent new offline writes', async () => {
      await db.circleTeacher.updateMany({ where: { teacherId }, data: { endedAt: new Date() } });
      assert.equal((await push(operation(`revoked-${suffix}`))).results[0].code, 'FORBIDDEN');
    });
  } finally {
    await db.processedOperation.deleteMany({ where: { accountId: { in: [actorId, parentId] } } });
    await db.circle.deleteMany({ where: { id: { in: [circleId, otherCircleId] } } });
    await db.student.deleteMany({ where: { id: studentId } });
    await db.user.deleteMany({ where: { id: { in: [actorId, parentId] } } });
    await db.syncChange.deleteMany({ where: { entityId: { in: [circleId, otherCircleId, studentId] } } });
    await db.$disconnect();
  }
});
