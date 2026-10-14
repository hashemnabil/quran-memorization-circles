import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OfflineSyncService } from './offline-sync.service';

const user = { id: 'account-1', role: Role.TEACHER } as any;

function serviceWith(overrides: { journal?: any[]; visibleStudent?: any; circleIds?: string[] | null } = {}) {
  const prisma = {
    $queryRaw: async () => overrides.journal ?? [],
    student: { findFirst: async () => overrides.visibleStudent ?? null },
  };
  const acl = {
    accessibleCircleIds: async () => overrides.circleIds ?? ['circle-1'],
    studentScope: async () => ({ id: 'student-1' }),
  };
  return new OfflineSyncService(prisma as any, acl as any);
}

test('push rejects malformed envelopes', async () => {
  await assert.rejects(
    serviceWith().pushOperations(user, { operations: 'not-an-array' }),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test('push bounds batch size before rejecting unsupported mutations', async () => {
  await assert.rejects(
    serviceWith().pushOperations(user, { operations: Array.from({ length: 101 }, (_, i) => ({ opId: String(i) })) }),
    (error: unknown) => error instanceof BadRequestException && error.message.includes('100'),
  );
});

test('push fails closed for validly shaped but unsupported operations', async () => {
  const result = await serviceWith().pushOperations(user, { operations: [{ opId: 'op-1', entity: 'student', data: {} }] });
  assert.equal(result.results[0].status, 'rejected');
  assert.equal(result.results[0].code, 'UNSUPPORTED_OPERATION');
});

test('sequence feed projects circle fields from an allowlist and never returns raw journal payload', async () => {
  const svc = serviceWith({ journal: [{
    seq: 4n, entity: 'circles', entityId: 'circle-1', operation: 'UPSERT',
    changedAt: new Date('2026-01-01T00:00:00.000Z'),
    payload: { id: 'circle-1', name: 'Circle', code: 'C1', scheduleDays: [], startTime: '09:00',
      isActive: true, passwordHash: 'must-not-leak', secretNote: 'must-not-leak' },
  }] });
  const result = await svc.syncChanges(user, 0n, 10);
  assert.equal(result.nextSeq, '4');
  assert.equal(result.changes.length, 1);
  assert.equal((result.changes[0].data as any).name, 'Circle');
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
  assert.equal(JSON.stringify(result).includes('secretNote'), false);
});

test('sequence feed skips circles outside the authenticated user scope while advancing cursor', async () => {
  const svc = serviceWith({ circleIds: ['circle-allowed'], journal: [{
    seq: 8n, entity: 'circles', entityId: 'circle-other', operation: 'UPSERT',
    changedAt: new Date(), payload: { id: 'circle-other', name: 'Private' },
  }] });
  const result = await svc.syncChanges(user, 0n, 10);
  assert.equal(result.changes.length, 0);
  assert.equal(result.nextSeq, '8');
});

test('sequence feed never leaks student journal secrets and preserves safe fields', async () => {
  const svc = serviceWith({ visibleStudent: { id: 'student-1' }, journal: [{
    seq: 12n, entity: 'students', entityId: 'student-1', operation: 'UPSERT',
    changedAt: new Date(), payload: {
      circleId: 'circle-1', code: 'S1', fullName: 'Student', status: 'ACTIVE',
      evaluation: null, memorizedParts: 2, currentSurah: 'Al-Fatiha', currentPage: 1,
      updatedAt: '2026-01-01T00:00:00.000Z', passwordHash: 'secret', privateNotes: 'secret',
    },
  }] });
  const result = await svc.syncChanges(user, 0n, 10);
  assert.equal(result.changes.length, 1);
  assert.equal((result.changes[0].data as any).fullName, 'Student');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('sequence feed denies student events outside live ACL and still advances cursor', async () => {
  const svc = serviceWith({ visibleStudent: null, journal: [{
    seq: 13n, entity: 'students', entityId: 'student-1', operation: 'UPSERT',
    changedAt: new Date(), payload: { circleId: 'circle-1', fullName: 'Hidden' },
  }] });
  const result = await svc.syncChanges(user, 0n, 10);
  assert.equal(result.changes.length, 0);
  assert.equal(result.nextSeq, '13');
});

test('sequence feed rejects historical student events from an inaccessible circle', async () => {
  const svc = serviceWith({ visibleStudent: { id: 'student-1' }, circleIds: ['circle-1'], journal: [{
    seq: 14n, entity: 'students', entityId: 'student-1', operation: 'UPSERT',
    changedAt: new Date(), payload: { circleId: 'circle-private', fullName: 'Hidden' },
  }] });
  const result = await svc.syncChanges(user, 0n, 10);
  assert.equal(result.changes.length, 0);
  assert.equal(result.nextSeq, '14');
});

test('push rejects empty batches and duplicate operation identifiers', async () => {
  await assert.rejects(
    serviceWith().pushOperations(user, { operations: [] }),
    (error: unknown) => error instanceof BadRequestException && error.message.includes('واحدة'),
  );
  await assert.rejects(
    serviceWith().pushOperations(user, { operations: [
      { opId: 'same-id', entity: 'student' },
      { opId: 'same-id', entity: 'student' },
    ] }),
    (error: unknown) => error instanceof BadRequestException && error.message.includes('مكرر'),
  );
});

test('push rejects invalid operation identities and malformed records', async () => {
  for (const operation of [null, [], { opId: '', entity: 'student' },
    { opId: 'bad id', entity: 'student' }, { opId: 'x'.repeat(129), entity: 'student' },
    { opId: 'valid-id', entity: '' }]) {
    await assert.rejects(
      serviceWith().pushOperations(user, { operations: [operation] }),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
});

test('push refuses an envelope for a different authenticated account', async () => {
  await assert.rejects(serviceWith().pushOperations(user, { accountId: 'someone-else', operations: [{ opId: 'op-1', entity: 'student' }] }));
});
test('deleted student emits only a tombstone in a trustworthy historical circle scope', async () => {
  const journal = [{ seq: 15n, entity: 'students', entityId: 'student-1', operation: 'DELETE', payload: { circleId: 'circle-1', fullName: 'must-not-leak' } }];
  const result = await serviceWith({ journal }).syncChanges(user, 0n, 10);
  assert.equal(result.changes.length, 1); assert.equal(result.changes[0].data, null);
  const hidden = await serviceWith({ journal, circleIds: ['other-circle'] }).syncChanges(user, 0n, 10);
  assert.equal(hidden.changes.length, 0);
});
test('snapshot captures its sequence fence before reading the rows', async () => {
  const order: string[] = [];
  const service = new OfflineSyncService({ $queryRaw: async () => { order.push('fence'); return [{ seq: 9007199254740993n }]; } } as any, {} as any);
  service.bootstrap = async () => { order.push('rows'); return { version: 1, accountId: user.id } as any; };
  service.scope = async () => ({ version: 1, accountId: user.id, scopeVersion: 'a'.repeat(64) });
  assert.equal((await service.snapshot(user)).asOfSeq, '9007199254740993');
  assert.deepEqual(order, ['fence', 'rows']);
});

test('recitation validation reuses the online DTO and rejects unsupported scoring fields', async () => {
  const { validateRecitationOperation } = await import('./recitation-operation');
  const op = { opId: 'test-recitation', entity: 'recitation', kind: 'create', data: { studentId: '11111111-1111-4111-8111-111111111111', date: '2026-01-01', fromSurah: 'الفاتحة', fromAyah: 1, toSurah: 'الفاتحة', toAyah: 7, evaluation: 'VERY_GOOD' } };
  assert.equal(validateRecitationOperation(op).fromAyah, 1);
  assert.throws(() => validateRecitationOperation({ ...op, data: { ...op.data, points: 999 } }));
  assert.throws(() => validateRecitationOperation({ ...op, kind: 'delete', baseUpdatedAt: '2026-99-99T00:00:00.000Z', data: { id: op.data.studentId } }));
});
test('offline Quran references match the server reference exactly', async () => {
  const { readFileSync } = await import('node:fs');
  const { SURAHS } = await import('../common/quran');
  assert.deepEqual(JSON.parse(readFileSync('../frontend/src/data/surahs.json', 'utf8')), SURAHS);
});
