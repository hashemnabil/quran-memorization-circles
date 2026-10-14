import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { OfflineSyncService } from './offline-sync.service';
import { transactionalRecitations } from '../recitations/recitations.service';
const url = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
const available = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/quran_test';
test('offline recitations commit domain records, balances and receipts together', { skip: !available }, async t => {
  const db = new PrismaService(); const id = randomUUID(), teacherId = randomUUID(), circleId = randomUUID(), studentId = randomUUID(), otherStudentId = randomUUID();
  const suffix = randomUUID().slice(0, 8); const user = { id, role: Role.TEACHER, teacherId } as any;
  const svc = new OfflineSyncService(db, new AccessControlService(db));
  const data = { studentId, date: '2026-01-01', type: 'MEMORIZATION', fromSurah: 'الفاتحة', fromAyah: 1, toSurah: 'الفاتحة', toAyah: 7, mistakes: 1, warnings: 2, evaluation: 'VERY_GOOD' };
  const create = (opId = randomUUID(), payload = data) => ({ opId, entity: 'recitation', kind: 'create', data: payload });
  const push = (op: any, actor = user) => svc.pushOperations(actor, { accountId: actor.id, operations: [op] });
  try {
    await db.user.create({ data: { id, username: `recitation-offline-${suffix}`, fullName: 'Offline teacher', passwordHash: 'test-only', role: Role.TEACHER } });
    await db.teacherProfile.create({ data: { id: teacherId, userId: id } });
    await db.circle.create({ data: { id: circleId, name: 'Offline recitations', code: `RO-${suffix}` } });
    await db.circleTeacher.create({ data: { circleId, teacherId, role: 'PRIMARY' } });
    await db.student.createMany({ data: [{ id: studentId, code: `RO-S-${suffix}`, fullName: 'Offline student', circleId }, { id: otherStudentId, code: `RO-O-${suffix}`, fullName: 'Out of scope' }] });
    let recordId = '';
    await t.test('concurrent duplicate creates produce one record and one balance change', async () => {
      const op = create(); const [first, second] = await Promise.all([push(op), push(op)]);
      assert.equal(first.results[0].status, 'applied'); assert.equal(second.results[0].status, 'applied');
      assert.equal([first, second].filter(result => result.results[0].replayed).length, 1);
      assert.equal(await db.recitation.count({ where: { studentId } }), 1);
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints, 5.5);
      recordId = first.results[0].data!.id as string;
      assert.equal((await push({ ...op, data: { ...data, mistakes: 0 } })).results[0].code, 'OP_ID_REUSED');
    });
    await t.test('invalid fields, roles and student scopes fail closed', async () => {
      for (const payload of [{ ...data, teacherId }, { ...data, points: 100 }, { ...data, date: '2026-02-30' }, { ...data, toAyah: 9999 }]) assert.equal((await push(create(randomUUID(), payload as any))).results[0].status, 'rejected');
      assert.equal((await push(create(randomUUID(), { ...data, studentId: otherStudentId }))).results[0].status, 'rejected');
      assert.equal((await push(create(), { ...user, role: Role.STUDENT })).results[0].code, 'FORBIDDEN');
    });
    await t.test('stale correction changes neither record nor balance', async () => {
      const old = await db.recitation.findUniqueOrThrow({ where: { id: recordId } });
      await db.recitation.update({ where: { id: recordId }, data: { notes: 'another device', updatedAt: new Date(old.updatedAt.getTime() + 1000) } });
      const result = await push({ opId: randomUUID(), entity: 'recitation', kind: 'correct', baseUpdatedAt: old.updatedAt.toISOString(), data: { id: recordId, patch: { toAyah: 5 } } });
      assert.equal(result.results[0].status, 'conflict');
      assert.equal((await db.recitation.findUniqueOrThrow({ where: { id: recordId } })).toAyah, 7);
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints, 5.5);
    });
    await t.test('versioned correction and deletion recompute balances exactly once', async () => {
      const current = await db.recitation.findUniqueOrThrow({ where: { id: recordId } });
      const corrected = await push({ opId: randomUUID(), entity: 'recitation', kind: 'correct', baseUpdatedAt: current.updatedAt.toISOString(), data: { id: recordId, patch: { toAyah: 5 } } });
      assert.equal(corrected.results[0].status, 'applied');
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints, 3.5);
      const updated = await db.recitation.findUniqueOrThrow({ where: { id: recordId } });
      const op = { opId: randomUUID(), entity: 'recitation', kind: 'delete', baseUpdatedAt: updated.updatedAt.toISOString(), data: { id: recordId } };
      assert.equal((await push(op)).results[0].status, 'applied'); assert.equal((await push(op)).results[0].replayed, true);
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints, 0);
    });
    await t.test('receipt failure rolls back new recitation, points and audit writes', async () => {
      const before = await db.recitation.count({ where: { studentId } }); const beforeAudit = await db.activityLog.count({ where: { userId: id } });
      const failing = { $transaction: (callback: any, options: any) => db.$transaction(tx => callback(new Proxy(tx, { get(target, key) { return key === 'processedOperation' ? { findUnique: target.processedOperation.findUnique.bind(target.processedOperation), create: async () => { throw new Error('receipt failure'); } } : Reflect.get(target, key); } })), options) };
      const failingService = new OfflineSyncService(failing as any, new AccessControlService(db));
      await assert.rejects(failingService.pushOperations(user, { operations: [create()] }), /receipt failure/);
      assert.equal(await db.recitation.count({ where: { studentId } }), before);
      assert.equal(await db.activityLog.count({ where: { userId: id } }), beforeAudit);
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints, 0);
    });
    await t.test('different concurrent operations keep the total equal to the authoritative sum', async () => {
      const outcomes = await Promise.all([push(create()), push(create())]);
      assert(outcomes.every(outcome => outcome.results[0].status === 'applied'));
      const sum = await db.recitation.aggregate({ where: { studentId, deletedAt: null }, _sum: { points: true } });
      assert.equal(sum._sum.points, 11); assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints, 11);
    });
    await t.test('backdated offline memorization cannot overwrite a newer position', async () => {
      await push(create(randomUUID(), { ...data, date: '2026-01-02', fromSurah: 'البقرة', toSurah: 'البقرة', toAyah: 3, mistakes: 0, warnings: 0 }));
      await push(create());
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: studentId } })).currentSurah, 'البقرة');
    });
    await t.test('revoked circle assignment rejects later queued writes', async () => {
      await db.circleTeacher.updateMany({ where: { teacherId }, data: { endedAt: new Date() } });
      assert.equal((await push(create())).results[0].code, 'FORBIDDEN');
    });
  } finally {
    await db.processedOperation.deleteMany({ where: { accountId: id } });
    await db.student.deleteMany({ where: { id: { in: [studentId, otherStudentId] } } });
    await db.circle.deleteMany({ where: { id: circleId } }); await db.user.deleteMany({ where: { id } }); await db.$disconnect();
  }
});
