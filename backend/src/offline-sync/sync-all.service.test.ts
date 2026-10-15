import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { FullSyncService } from './sync-all.service';
import { UpdateStudentDto, StudentQuestionnaireDto } from '../students/dto/student.dto';
import { StudentsService } from '../students/students.service';

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
  const service = new FullSyncService({ $transaction: async (run: any) => run(tx) } as any, {} as any);
  (service as any).services = () => ({});
  (service as any).apply = async () => { calls++; return { id: randomUUID(), fullName: 'Saved' }; };
  return { service, calls: () => calls, receipts };
}
const operation = () => ({ opId: randomUUID(), entityId: randomUUID(), table: 'students', action: 'create', data: { fullName: 'طالب' } });

test('student edits accept an unset optional birth date from the actual form', async () => {
  const { service } = fixture();
  const dto = await (service as any).dto(UpdateStudentDto, { fullName: 'طالب', birthDate: '', phone: '', guardianPhone: '', circleId: null });
  assert.equal(dto.birthDate, undefined);
  assert.equal(dto.fullName, 'طالب');
});

test('student questionnaire rejects academic and account fields in offline replay', async () => {
  const { service } = fixture();
  const valid = await (service as any).dto(StudentQuestionnaireDto, { phone: '0591234567', address: 'Home' });
  assert.equal(valid.address, 'Home');
  for (const field of ['gender', 'code', 'nationalId', 'totalPoints', 'circleId', 'userId', 'status']) {
    await assert.rejects((service as any).dto(StudentQuestionnaireDto, { [field]: 'tampered' }));
  }
});

test('questionnaire updates the authenticated student record and cannot target another student', async () => {
  const writes: any[] = [];
  const actor = { ...user, role: Role.STUDENT };
  const ownId = randomUUID();
  const tx = {
    student: { update: async (args: any) => { writes.push(args); } },
    user: { update: async () => undefined },
  };
  const prisma = { student: { findFirst: async (args: any) => {
    assert.deepEqual(args.where, { userId: actor.id, deletedAt: null });
    return { id: ownId };
  } }, $transaction: async (run: any) => run(tx) };
  const students = new StudentsService(prisma as any, {} as any, { log: async () => undefined } as any, {} as any);
  students.getMyProfile = async () => ({ id: ownId, address: 'Updated home' });
  await assert.rejects(students.updateMyQuestionnaire(actor, { address: 'Other home' }, randomUUID()));
  assert.equal(writes.length, 0);
  await students.updateMyQuestionnaire(actor, { address: 'Updated home' }, ownId);
  assert.deepEqual(writes, [{ where: { id: ownId }, data: { address: 'Updated home' } }]);
  await assert.rejects(students.updateMyQuestionnaire(user, { address: 'No' }));
});

test('delta reads the durable journal and sends only affected authorized records', async () => {
  let args: any;
  const service = new FullSyncService({ syncChange: { findMany: async (query: any) => {
    args = query;
    return [{ seq: 11n, entity: 'students', entityId: 'changed', payload: {} }];
  } } } as any, {} as any);
  (service as any).pull = async (_user: any, table: string, _page: number, ids: Set<string>) => {
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
  (service as any).apply = async () => { calls++; throw new Error('Conflict'); };
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
