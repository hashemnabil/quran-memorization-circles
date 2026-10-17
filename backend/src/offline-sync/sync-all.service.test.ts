import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { FullSyncService } from './sync-all.service';
import { UpdateStudentDto, StudentQuestionnaireDto } from '../students/dto/student.dto';
import { StudentsService } from '../students/students.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

test('broadcast replay validates role and reuses the transaction receipt after a lost acknowledgement', async () => {
  const { service } = fixture(); let broadcasts = 0;
  const dispatch = FullSyncService.prototype as any;
  (service as any).apply = dispatch.apply.bind(service);
  (service as any).services = () => ({ notifications: { broadcast: async (actor: any) => { if (actor.role !== Role.ADMIN) throw new ForbiddenException(); broadcasts++; return { recipientCount: 2 }; } } });
  const op = { ...operation(), table: 'notifications', action: 'broadcast', data: { title: 'Hello', body: 'Message', audience: 'STUDENT', selection: 'ALL', userIds: [] } };
  assert.equal((await service.push(user, { operations: [op] })).outcomes[0].status, 'applied');
  assert.equal((await service.push(user, { operations: [op] })).outcomes[0].status, 'applied');
  assert.equal(broadcasts, 1);
  assert.equal((await service.push({ ...user, role: Role.STUDENT }, { operations: [{ ...op, opId: randomUUID() }] })).outcomes[0].status, 'rejected');
  assert.equal((await service.push(user, { operations: [{ ...op, opId: randomUUID(), data: { ...op.data, audience: 'INVALID' } }] })).outcomes[0].status, 'rejected');
});

const user = { id: randomUUID(), role: Role.ADMIN, fullName: 'Admin', username: 'admin', email: null };
function fixture() {
  const receipts = new Map<string, any>(); let calls = 0;
  const tx = {
    $queryRaw: async () => [],
    processedOperation: {
      findUnique: async ({ where }: any) => receipts.get(where.opId_accountId.opId),
      findMany: async () => [],
      create: async ({ data }: any) => { receipts.set(data.opId, data); return data; },
    },
  };
  const service = new FullSyncService({ $transaction: async (run: any) => run(tx) } as any, { get: () => 'test-only-credential-fingerprint-key' } as any);
  (service as any).services = () => ({});
  (service as any).apply = async () => { calls++; return { id: randomUUID(), fullName: 'Saved' }; };
  return { service, calls: () => calls, receipts };
}
const operation = () => ({ opId: randomUUID(), entityId: randomUUID(), table: 'students', action: 'create', data: { fullName: 'طالب' } });

test('credential replay is idempotent and receipts never contain passwords', async () => {
  const { service, receipts } = fixture(); let calls = 0;
  (service as any).apply = async () => { calls++; return { id: 'saved', temporaryPassword: 'secret-password', passwordHash: 'private-hash' }; };
  const op = { ...operation(), table: 'users', data: { fullName: 'User', password: 'secret-password' } };
  await service.push(user, { operations: [op] });
  await service.push(user, { operations: [op] });
  assert.equal(calls, 1);
  assert(!JSON.stringify([...receipts.values()]).includes('secret-password'));
  assert(!JSON.stringify([...receipts.values()]).includes('private-hash'));
});

test('student account queue dispatch uses the chosen password and returns only account metadata', async () => {
  const service = new FullSyncService({} as any, {} as any);
  const calls: any[] = [];
  const services = { students: {
    createAccountForStudent: async (...args: any[]) => { calls.push(args); },
    resetStudentAccountPassword: async (...args: any[]) => { calls.push(args); },
    listAccounts: async () => [{ id: 'student', username: '120261234', mustChangePassword: true }],
  } };
  for (const action of ['create', 'reset-password']) {
    const op = { ...operation(), table: 'studentAccounts', action, entityId: 'student', data: { password: 'chosen-password' } };
    const result = await (service as any).apply(services, user, op);
    assert.equal(result.username, '120261234'); assert.equal(result.temporaryPassword, undefined);
    await assert.rejects((service as any).apply(services, { ...user, role: Role.TEACHER }, op));
  }
  assert.equal(calls.length, 2); assert.equal(calls[0][2], 'chosen-password');
});

test('student edits accept an unset optional birth date from the actual form', async () => {
  const { service } = fixture();
  const dto = await (service as any).dto(UpdateStudentDto, { fullName: 'طالب', birthDate: '', phone: '', guardianPhone: '', circleId: null });
  assert.equal(dto.birthDate, undefined);
  assert.equal(dto.fullName, 'طالب');
});

test('student questionnaire rejects academic and account fields in offline replay', async () => {
  const { service } = fixture();
  const valid = await (service as any).dto(StudentQuestionnaireDto, { nationalId: '123456789', fatherNationalId: '987654321', address: 'Home' });
  assert.equal(valid.address, 'Home');
  assert.equal(valid.nationalId, '123456789');
  assert.equal(valid.fatherNationalId, '987654321');
  for (const field of ['gender', 'code', 'phone', 'totalPoints', 'circleId', 'userId', 'status']) {
    await assert.rejects((service as any).dto(StudentQuestionnaireDto, { [field]: 'tampered' }));
  }
});

test('legacy questionnaire creates a pending review and preserves the canonical profile', async () => {
  const actor = { ...user, role: Role.STUDENT }, ownId = randomUUID();
  const requests: any[] = [];
  const findFirst = async () => ({ id: ownId, fullName: 'Student', address: 'Before' });
  const tx: any = { $queryRaw: async () => [], student: { findFirst },
    profileReview: { findFirst: async () => null, create: async ({ data }: any) => { requests.push(data); return { ...data, id: 'review', status: 'PENDING' }; } },
    user: { findMany: async () => [] }, syncChange: { create: async () => ({}) }, notification: { create: async ({ data }: any) => ({ ...data, id: 'notice' }) } };
  const prisma: any = { student: { findFirst }, $transaction: async (run: any) => run(tx) };
  const students = new StudentsService(prisma, {} as any, { log: async () => undefined } as any, {} as any);
  students.getMyProfile = async () => ({ id: ownId, address: 'Before' });
  await assert.rejects(students.updateMyQuestionnaire(actor, { address: 'Other' }, randomUUID()));
  const result = await students.updateMyQuestionnaire(actor, { address: 'After' }, ownId);
  assert.equal(result.address, 'Before'); assert.equal(result.verificationRequest.status, 'PENDING');
  assert.equal(requests[0].patch.address, 'After'); assert.equal(requests[0].base.address, 'Before');
  await assert.rejects(students.updateMyQuestionnaire(user, { address: 'No' }));
});

test('delta reads the durable journal and sends only affected authorized records', async () => {
  let args: any;
  const service = new FullSyncService({ syncChange: { findMany: async (query: any) => {
    args = query;
    return [{ seq: 11n, entity: 'students', entityId: 'changed', payload: {} }];
  } } } as any, {} as any);
  (service as any).pull = async (_user: any, table: string, _page: number, ids: Set<string>) => {
    if (table === 'studentAccounts') return { data: [], meta: { hasNextPage: false } };
    assert.equal(table, 'students'); assert.deepEqual([...ids], ['changed']);
    return { data: [{ id: 'changed', fullName: 'after' }], visibleIds: ['old', 'changed'], meta: { hasNextPage: false } };
  };
  const result = await service.delta(user, '10');
  assert.equal(args.where.seq.gt, 10n);
  assert.equal(result.cursor, '11');
  assert.deepEqual(result.tables.students.data, [{ id: 'changed', fullName: 'after' }]);
  assert.deepEqual(result.tables.students.visibleIds, ['old', 'changed']);
  await assert.rejects(service.delta(user, '-1'));
});
test('receipt replay after lost acknowledgement does not create twice', async () => {
  const { service, calls } = fixture(); const op = operation();
  const first = await service.push(user, { operations: [op] });
  const replay = await service.push(user, { operations: [op] });
  assert.deepEqual(first, replay); assert.equal(calls(), 1);
});
test('same operation id with a changed payload is rejected', async () => {
  const { service, calls } = fixture(); const op = operation();
  await service.push(user, { operations: [op] });
  const result = await service.push(user, { operations: [{ ...op, data: { fullName: 'Changed' } }] });
  assert.equal(result.outcomes[0].status, 'rejected'); assert.equal(calls(), 1);
});
test('a rejected operation stops dependent operations', async () => {
  const { service } = fixture(); let calls = 0;
  (service as any).apply = async () => { calls++; throw new BadRequestException('Conflict'); };
  const result = await service.push(user, { operations: [operation(), operation()] });
  assert.equal(calls, 1); assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].status, 'rejected');
});
test('malformed and oversized batches are rejected', async () => {
  const { service } = fixture();
  await assert.rejects(service.push(user, { operations: Array.from({ length: 51 }, operation) }));
  await assert.rejects(service.push(user, { operations: [{ ...operation(), opId: '../../bad' }] }));
  await assert.rejects(service.push(user, { operations: [] }));
  const duplicate = operation(); await assert.rejects(service.push(user, { operations: [duplicate, duplicate] }));
  await assert.rejects(service.push(user, { operations: [{ ...operation(), accountId: randomUUID() }] }));
});
test('domain dispatch rejects writes from a read-only student account', async () => {
  const service = new FullSyncService({} as any, {} as any);
  await assert.rejects((service as any).apply({}, { ...user, role: Role.STUDENT }, operation()), /غير مسموحة/);
});
