import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueOfflineOperation, listOfflineOperations, blockOfflineOperation, replaceBlockedOfflineOperation } from './outbox';
import { replayOfflineWrite } from './replay-policy.js';
import { syncOfflineOperations } from './sync';
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const studentId = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const payload = { studentId, date: '2026-01-01', fromSurah: 'الفاتحة', fromAyah: 1, toSurah: 'الفاتحة', toAyah: 7, evaluation: 'VERY_GOOD', warnings: 2 };
test('recitation payload and operation ID survive a lost response and same-op replay', async () => {
  const accountId = 'recitation-replay'; const operation = await enqueueOfflineOperation({ accountId, resource: 'recitation-create', method: 'POST', path: '/recitations', payload });
  await syncOfflineOperations(accountId, op => replayOfflineWrite(op, accountId, async () => { throw new Error('response lost'); }));
  assert.deepEqual((await listOfflineOperations(accountId))[0].payload, payload);
  await syncOfflineOperations(accountId, op => replayOfflineWrite(op, accountId, async (_, body: any) => {
    assert.equal(body.accountId, accountId); assert.equal(body.operations[0].entity, 'recitation'); assert.equal(body.operations[0].opId, operation.id);
    return { data: { accountId, results: [{ opId: operation.id, status: 'applied', replayed: true }] } };
  }));
  assert.deepEqual(await listOfflineOperations(accountId), []);
});
test('invalid recitation fields and versions never enter the outbox', async () => {
  for (const invalid of [{ ...payload, points: 999 }, { ...payload, teacherId: id }, { ...payload, date: '2026-02-30' }, { ...payload, toAyah: 0 }, { ...payload, evaluation: 'UNKNOWN' }]) await assert.rejects(enqueueOfflineOperation({ accountId: 'invalid-recitation', resource: 'recitation-create', method: 'POST', path: '/recitations', payload: invalid }));
  await assert.rejects(enqueueOfflineOperation({ accountId: 'invalid-recitation', resource: 'recitation-delete', method: 'DELETE', path: `/recitations/${id}`, payload: {} }));
});
test('reviewed conflict replacement is atomic, account scoped and has a new operation ID', async () => {
  const accountId = 'recitation-review'; const old = await enqueueOfflineOperation({ accountId, resource: 'recitation-correct', method: 'PATCH', path: `/recitations/${id}`, payload: { notes: 'saved locally' }, baseUpdatedAt: '2026-01-01T00:00:00.000Z' });
  await blockOfflineOperation(old.id, accountId, 'stale version');
  await assert.rejects(replaceBlockedOfflineOperation(old.id, 'wrong-account', '2026-01-02T00:00:00.000Z'));
  await assert.rejects(replaceBlockedOfflineOperation(old.id, accountId, 'invalid'));
  assert.equal((await listOfflineOperations(accountId))[0].id, old.id);
  const next = await replaceBlockedOfflineOperation(old.id, accountId, '2026-01-02T00:00:00.000Z');
  assert.notEqual(next.id, old.id); assert.equal(next.createdAt, old.createdAt); assert.deepEqual(next.payload, old.payload);
  const pending = await listOfflineOperations(accountId); assert.equal(pending.length, 1); assert.equal(pending[0].state, 'pending');
});
