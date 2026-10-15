import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import { db } from './db';
import { configureOffline, save, get, update, remove, mergeRows, syncAll, exportLocal, importLocal, clearLocal } from './offline-engine';

let account = 'account-a'; let online = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(async () => {
  online = false; account = 'account-a';
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('network unavailable'); }, () => account);
});
after(() => db.close());
test('writes are durable before network and account-scoped', async () => {
  await save('students', { id: 's1', fullName: 'طالب' });
  assert.equal((await get('students'))[0].synced, 0);
  assert.equal(await db.queue.count(), 1);
  account = 'account-b'; assert.deepEqual(await get('students'), []);
});
test('pull cannot overwrite pending edits or resurrect pending deletes', async () => {
  await save('students', { id: 's1', fullName: 'محلي' });
  await mergeRows('students', [{ id: 's1', fullName: 'خادم' }]);
  assert.equal((await get('students'))[0].fullName, 'محلي');
  await remove('students', 's1');
  await mergeRows('students', [{ id: 's1', fullName: 'خادم' }]);
  assert.deepEqual(await get('students'), []);
  assert.equal(await db.queue.count(), 2);
});
test('lost network response preserves operation id for retry', async () => {
  await save('recitations', { studentId: 's1' });
  const original = (await db.queue.toArray())[0]; online = true;
  await assert.rejects(syncAll(), /network unavailable/);
  assert.equal((await db.queue.toArray())[0].opId, original.opId);
});
test('server acknowledgement does not erase a newer concurrent edit', async () => {
  await save('students', { id: 's1', fullName: 'first' });
  let release!: (value: any) => void;
  configureOffline(async (_method, _path, body) => new Promise((resolve) => { release = () => resolve({ outcomes: [{ opId: body.operations[0].opId, status: 'applied', data: { id: 's1', fullName: 'first' } }] }); }), () => account);
  online = true; const run = syncAll();
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await update('students', 's1', { fullName: 'second' });
  release(undefined); await run;
  assert.equal((await get('students'))[0].fullName, 'second');
  assert.equal((await get('students'))[0].synced, 0);
  assert.equal(await db.queue.count(), 1);
});
test('backup round-trip preserves queue and rejects another account', async () => {
  await save('students', { id: 's1', fullName: 'طالب' });
  const backup = await exportLocal();
  await assert.rejects(clearLocal(), /المعلقة/);
  await importLocal(backup); assert.equal(await db.queue.count(), 1);
  account = 'account-b'; await assert.rejects(importLocal(backup), /حساب/);
});
test('attendance sheet immediately contributes individual local records', async () => {
  await save('attendance', { circleId: 'c1', date: '2026-10-15', entries: [{ studentId: 's1', status: 'PRESENT' }, { studentId: 's2', status: 'ABSENT' }] });
  assert.equal((await get('attendance')).length, 2);
  assert.equal(await db.queue.count(), 1);
});
test('acknowledged create remaps foreign keys while preserving queued request fingerprints', async () => {
  await save('students', { id: 'local-student', fullName: 'طالب' });
  await save('recitations', { id: 'local-recitation', studentId: 'local-student' });
  const before = await db.queue.toArray();
  configureOffline(async (_method, _path, body) => ({ outcomes: body.operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: { id: op.table === 'students' ? 'server-student' : 'server-recitation', ...(op.table === 'recitations' ? { studentId: 'server-student' } : {}) } })) }), () => account);
  online = true; await syncAll();
  assert.equal((await get('students'))[0].id, 'server-student');
  assert.equal((await get('recitations'))[0].studentId, 'server-student');
  assert.equal(before[1].data.studentId, 'local-student');
  assert.equal(await db.queue.count(), 0);
});
test('malformed acknowledgement never clears pending work', async () => {
  await save('students', { id: 's1', fullName: 'طالب' });
  configureOffline(async () => ({ outcomes: [] }), () => account);
  online = true; await assert.rejects(syncAll(), /لم يؤكد/);
  assert.equal(await db.queue.count(), 1);
});
test('JSON backup restores cached photo blobs and reference metadata', async () => {
  await db.responses.put({ key: 'account-a:image:/photo.png', accountId: account, data: new Blob(['image-data'], { type: 'image/png' }) });
  await db.meta.put({ key: 'account-a:reference:/exams/sections', value: [{ id: 'section1' }] });
  const backup = JSON.parse(JSON.stringify(await exportLocal()));
  await db.responses.clear(); await db.meta.clear();
  await importLocal(backup);
  const cached = await db.responses.get('account-a:image:/photo.png');
  assert.equal(await cached!.data.text(), 'image-data');
  assert.equal((await db.meta.get('account-a:reference:/exams/sections'))?.value[0].id, 'section1');
});
