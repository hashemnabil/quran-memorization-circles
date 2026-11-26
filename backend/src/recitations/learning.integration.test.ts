import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Role } from '@prisma/client';
import { AccessControlService } from '../common/services/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecitationsService } from './recitations.service';
import { resolveRules } from '../common/learning-rules';
import { savePolicy } from './learning-policy';
import { OfflineSyncService } from '../offline-sync/offline-sync.service';
test('learning snapshots, attendance points, replay, corrections and permissions on PostgreSQL', { timeout: 60000 }, async (t) => {
    const target = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/quran_test', 'Disposable local quran_test only');
    const db = new PrismaClient();
    const suffix = randomUUID(), actorId = randomUUID(), teacherId = randomUUID(), circleId = randomUUID(), studentId = randomUUID(), accountId = randomUUID();
    const actor = { id: actorId, role: Role.ADMIN } as any;
    const prisma = db as PrismaService;
    const acl = new AccessControlService(prisma);
    const service = new RecitationsService(prisma, acl, { log: async () => { } } as any, { recalculatePoints: async () => { } } as any);
    const sync = new OfflineSyncService(prisma, acl);
    let recId = '';
    try {
        await db.user.createMany({ data: [{ id: actorId, username: 'learning-' + suffix, fullName: 'Test admin', passwordHash: 'test-only', role: 'ADMIN' }, { id: accountId, username: 'student-learning-' + suffix, fullName: 'Test student', passwordHash: 'test-only', role: 'STUDENT' }] });
        await db.teacherProfile.create({ data: { id: teacherId, userId: actorId } });
        await db.circle.create({ data: { id: circleId, name: 'Learning test', code: suffix } });
        await db.circleTeacher.create({ data: { circleId, teacherId, role: 'PRIMARY' } });
        await db.student.create({ data: { id: studentId, code: 'learning-' + suffix, fullName: 'Learning test', circleId, userId: accountId } });
        let rules = await savePolicy(prisma, actorId, circleId, resolveRules({ attendance: resolveRules().attendance.map(s => ({ ...s, points: s.id === 'PRESENT' ? 3 : s.id === 'LATE' ? 1 : s.id === 'ABSENT' ? -2 : 0 })) }));
        const total = async () => (await db.student.findUniqueOrThrow({ where: { id: studentId } })).totalPoints;
        await t.test('late is present for percentages and its configured points commit once', async () => { const op = { opId: randomUUID(), entity: 'attendance', kind: 'record', data: { circleId, date: '2026-01-02', entries: [{ studentId, status: 'LATE' }] } }; const first = await sync.pushOperations(actor, { operations: [op] }); assert.equal(first.results[0].status, 'applied'); const retry = await sync.pushOperations(actor, { operations: [op] }); assert.equal(retry.results[0].replayed, true); assert.equal(await total(), 1); assert.equal(await db.learningPointsAudit.count({ where: { studentId } }), 1); });
        await t.test('attendance correction replaces the contribution and stale replay cannot change it', async () => { const row = await db.attendance.findFirstOrThrow({ where: { studentId } }); const op = { opId: randomUUID(), entity: 'attendance', kind: 'correct', baseUpdatedAt: row.updatedAt.toISOString(), data: { id: row.id, status: 'ABSENT' } }; assert.equal((await sync.pushOperations(actor, { operations: [op] })).results[0].status, 'applied'); assert.equal(await total(), -2); assert.equal((await sync.pushOperations(actor, { operations: [op] })).results[0].replayed, true); assert.equal(await total(), -2); const stale = { ...op, opId: randomUUID(), data: { id: row.id, status: 'PRESENT' } }; assert.equal((await sync.pushOperations(actor, { operations: [stale] })).results[0].status, 'conflict'); });
        await t.test('word errors survive saving and are never charged again by the old SQL trigger', async () => { const r = await service.create(actor, { studentId, date: '2026-01-02', fromSurah: 'النبأ', fromAyah: 1, toSurah: 'النبأ', toAyah: 10, mistakes: 1, warnings: 0, tajweedErrors: 0, rulesRevision: rules.revision, wordErrors: [{ id: randomUUID(), wordId: '78:1:1', typeId: 'word' }] }); recId = r.id; assert.equal(r.points, 9); assert.equal((r.wordErrors as any[])[0].penalty, 1); assert.equal((r.gradingSnapshot as any).revision, rules.revision); assert.equal(await total(), 7); });
        await t.test('new settings cannot regrade saved sessions, even on a notes edit', async () => { rules = await savePolicy(prisma, actorId, circleId, { ...rules, mistakePenalty: 8, types: rules.types.map(t => ({ ...t, penalty: 8 })) }); const note = await service.update(actor, recId, { notes: 'reviewed' }); assert.equal(note.points, 9); const edited = await service.update(actor, recId, { mistakes: 2 }); assert.equal(edited.points, 8); assert.equal(await total(), 6); });
        await t.test('unknown word positions, other students and stale record updates fail closed', async () => { await assert.rejects(service.update(actor, recId, { wordErrors: [{ id: randomUUID(), wordId: '78:1:200', typeId: 'word' }] })); await assert.rejects(service.findOne({ id: randomUUID(), role: Role.STUDENT } as any, recId)); await assert.rejects(service.update(actor, recId, { notes: 'stale', baseUpdatedAt: '2000-01-01T00:00:00.000Z' })); const own = await service.findOne({ id: accountId, role: Role.STUDENT } as any, recId); assert.equal(own.id, recId); });
        await t.test('soft deletion removes only that source and audit deltas explain the balance', async () => { await service.remove(actor, recId); assert.equal(await total(), -2); const rows = await db.learningPointsAudit.findMany({ where: { studentId } }); assert.equal(rows.reduce((sum, r) => sum + r.afterPoints - r.beforePoints, 0), -2); });
    }
    finally {
        await db.processedOperation.deleteMany({ where: { accountId: actorId } });
        await db.activityLog.deleteMany({ where: { userId: actorId } });
        await db.notification.deleteMany({ where: { userId: accountId } });
        await db.student.deleteMany({ where: { id: studentId } });
        await db.learningPointsAudit.deleteMany({ where: { studentId } });
        await db.learningRuleSet.deleteMany({ where: { scopeId: circleId } });
        await db.circle.deleteMany({ where: { id: circleId } });
        await db.user.deleteMany({ where: { id: { in: [actorId, accountId] } } });
        await db.$disconnect();
    }
});
