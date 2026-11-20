import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, syncAll } from './offline-engine';
import { localRead, localWrite, rememberRead } from './local-api';

const account = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
let actor = { id: account, fullName: 'محفظ', role: 'TEACHER' };
let online = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: () => JSON.stringify(actor) } });
beforeEach(async () => {
  online = false; actor = { id: account, fullName: 'محفظ', role: 'TEACHER' };
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => actor.id);
  await db.students.put({ id: studentId, accountId: account, synced: 1, updatedAt: '', fullName: 'طالب' });
});
const input = { title: 'خطة أسبوعية', unit: 'JUZ', period: 'WEEKLY', scope: { items: [1, 2] }, target: 2 };
test('offline plan creation and progress survive reopening and preserve dependent sync order', async () => {
  const plan = await localWrite('post', `/students/${studentId}/plans`, input);
  const requestId = crypto.randomUUID();
  await localWrite('post', `/students/${studentId}/plans/${plan.id}/progress`, { requestId, itemIds: [1], note: 'تم' });
  await localWrite('post', `/students/${studentId}/plans/${plan.id}/progress`, { requestId, itemIds: [1], note: 'تم' });
  assert.equal(await db.queue.count(), 2);
  db.close(); await db.open();
  const [saved] = await localRead(`/students/${studentId}/plans`);
  assert.equal(saved.completed, 1); assert.equal(saved.logs.length, 1);
  const canonical = '33333333-3333-4333-8333-333333333333';
  const seen: string[] = [];
  online = true;
  configureOffline(async (_method, _path, payload) => ({ outcomes: payload.operations.map((op: any) => { seen.push(op.action); return { opId: op.opId, status: 'applied', data: { ...saved, id: canonical } }; }) }), () => account);
  await syncAll();
  assert.deepEqual(seen, ['create', 'progress']); assert.equal(await db.queue.count(), 0);
  const [synced] = await localRead(`/students/${studentId}/plans`);
  assert.equal(synced.id, canonical); assert.equal(synced.completed, 1);
});
test('rejects duplicate scoped items, overflow, changed scopes, archived plans and student writes', async () => {
  const plan = await localWrite('post', `/students/${studentId}/plans`, input);
  const path = `/students/${studentId}/plans/${plan.id}`;
  await localWrite('post', `${path}/progress`, { requestId: crypto.randomUUID(), itemIds: [1] });
  await assert.rejects(localWrite('post', `${path}/progress`, { requestId: crypto.randomUUID(), itemIds: [1] }));
  await assert.rejects(localWrite('patch', path, { ...input, scope: { items: [2, 3] } }));
  await localWrite('patch', path, { ...input, archived: true });
  await assert.rejects(localWrite('post', `${path}/progress`, { requestId: crypto.randomUUID(), itemIds: [2] }));
  actor.role = 'STUDENT';
  await assert.rejects(localWrite('post', `/students/${studentId}/plans`, input));
});
test('plan reads never pollute student records, and each account has its own replica', async () => {
  const id = crypto.randomUUID();
  await rememberRead(`/students/${studentId}/plans`, {}, [{ id, ...input, completed: 0, logs: [] }]);
  assert.equal(await db.students.count(), 1);
  assert.equal((await localRead(`/students/${studentId}/plans`))[0].id, id);
  actor.id = 'another-account';
  assert.equal(await localRead(`/students/${studentId}/plans`), undefined);
});
