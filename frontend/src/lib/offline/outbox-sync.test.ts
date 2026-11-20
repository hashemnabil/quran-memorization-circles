import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueOfflineOperation, listOfflineOperations, clearOfflineOperations } from './outbox';
import { syncOfflineOperations } from './sync';
import { replayAttendanceOperation } from './replay-policy.js';

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const payload = {
  circleId: '11111111-1111-4111-8111-111111111111', date: '2026-01-01',
  entries: [{ studentId: '22222222-2222-4222-8222-222222222222', status: 'PRESENT' }],
};
const enqueue = (accountId: string) => enqueueOfflineOperation({ accountId, resource: 'attendance-sheet', method: 'POST', path: '/attendance', payload });

test('durable outbox survives transport loss and retries the same opId after reconnect', async () => {
  const account = 'outbox-reconnect';
  const item = await enqueue(account);
  const first = await syncOfflineOperations(account, async () => { throw new Error('network lost after server commit'); });
  assert.equal(first.retried, 1);
  const pending = await listOfflineOperations(account);
  assert.equal(pending[0].id, item.id);
  assert.deepEqual(pending[0].payload, payload);
  assert.equal(pending[0].attempts, 1);
  const second = await syncOfflineOperations(account, (operation) => replayAttendanceOperation(operation, account, async (path, body: any) => {
    assert.equal(path, '/sync/push');
    assert.equal(body.operations[0].opId, item.id);
    return { data: { accountId: account, results: [{ opId: item.id, status: 'applied', replayed: true }] } };
  }));
  assert.equal(second.applied, 1);
  assert.equal((await listOfflineOperations(account)).length, 0);
});

test('conflict blocks the operation, preserves payload and stops dependent writes', async () => {
  const account = 'outbox-conflict';
  await enqueue(account); await enqueue(account);
  let calls = 0;
  const report = await syncOfflineOperations(account, async () => { calls++; return { kind: 'conflict', reason: 'stale version' }; });
  assert.equal(calls, 1);
  assert.equal(report.blocked, 1);
  const pending = await listOfflineOperations(account);
  assert.equal(pending[0].state, 'blocked');
  assert.deepEqual(pending[0].payload, payload);
  assert.equal(pending[1].state, 'pending');
  await clearOfflineOperations(account);
});

test('concurrent drains share one run and never replay another account', async () => {
  const account = 'outbox-concurrent'; const other = 'outbox-other';
  await enqueue(account); await enqueue(other);
  let calls = 0;
  const handler = async (op: any) => { calls++; assert.equal(op.accountId, account); return { kind: 'applied' as const }; };
  const first = syncOfflineOperations(account, handler);
  const second = syncOfflineOperations(account, handler);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal((await listOfflineOperations(other)).length, 1);
  await clearOfflineOperations(other);
});

test('malformed, cross-account and wrong-op acknowledgements retain the queued write', async () => {
  const op = await enqueue('outbox-ack');
  for (const data of [null, {}, { accountId: 'wrong', results: [{ opId: op.id, status: 'applied' }] }, { accountId: op.accountId, results: [{ opId: 'wrong', status: 'applied' }] }, { accountId: op.accountId, results: [{ opId: op.id, status: 'unknown' }] }]) {
    assert.equal((await replayAttendanceOperation(op, op.accountId, async () => ({ data }))).kind, 'retry');
  }
  let sent = false;
  assert.equal((await replayAttendanceOperation(op, 'new-account', async () => { sent = true; return { data: {} }; })).kind, 'retry');
  assert.equal(sent, false);
  await clearOfflineOperations(op.accountId);
});

test('server conflicts and access rejection are blocked; transient failures remain retryable', async () => {
  const op = await enqueue('outbox-errors');
  for (const [status, kind] of [[401, 'rejected'], [403, 'rejected'], [409, 'conflict'], [429, 'retry'], [500, 'retry']]) {
    assert.equal((await replayAttendanceOperation(op, op.accountId, async () => { throw { response: { status } }; })).kind, kind);
  }
  for (const status of ['conflict', 'rejected']) {
    assert.equal((await replayAttendanceOperation(op, op.accountId, async () => ({ data: { accountId: op.accountId, results: [{ opId: op.id, status }] } }))).kind, status);
  }
  await clearOfflineOperations(op.accountId);
});
