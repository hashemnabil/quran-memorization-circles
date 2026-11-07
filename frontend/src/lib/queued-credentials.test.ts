import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, exportLocal, mergeRows, syncAll } from './offline-engine';
import { localRead, localWrite } from './local-api';
import { openCredentials } from './queued-credentials';

let online = false;
let role = 'ADMIN';
const studentId = '00000000-0000-4000-8000-000000000010';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'admin', role }) } });
beforeEach(async () => {
  online = false; role = 'ADMIN';
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => 'admin');
});
after(() => db.close());

test('new users are visible offline while password payloads are encrypted and device-bound', async () => {
  const password = 'Offline-password-2026';
  const user = await localWrite('post', '/users', { username: 'new-user', fullName: 'New User', role: 'TEACHER', password });
  assert.equal((await localRead('/users', { search: 'new-user' })).data[0].id, user.id);
  assert.equal(user.activationPending, true);
  const queued = (await db.queue.toArray())[0];
  assert(!JSON.stringify(queued).includes(password));
  assert(!JSON.stringify(await db.table('users').toArray()).includes(password));
  assert.equal((await openCredentials(queued)).password, password);
  assert.equal((await db.table('credentialKeys').get('admin')).key.extractable, false);
  await assert.rejects(exportLocal());
  db.close(); await db.open();
  assert.equal((await openCredentials(queued)).password, password);
  await assert.rejects(openCredentials({ ...queued, entityId: 'another-user' }));
  await assert.rejects(openCredentials({ ...queued, accountId: 'another-admin' }));
});

test('student account creation and password reset survive lost responses without changing credentials', async () => {
  await mergeRows('students', [{ id: studentId, fullName: 'Student', code: '120261234' }]);
  const created = await localWrite('post', `/students/${studentId}/account`, {});
  const reset = await localWrite('post', `/students/${studentId}/account/reset-password`, {});
  assert.notEqual(created.temporaryPassword, reset.temporaryPassword);
  assert.equal((await localRead('/students/accounts'))[0].credentialPending, true);
  const before = await db.queue.toArray();
  assert(!JSON.stringify(before).includes(created.temporaryPassword));
  assert(!JSON.stringify(before).includes(reset.temporaryPassword));
  const receipts = new Map<string, any>(); const seen: any[] = []; let lost = true;
  configureOffline(async (_method, _path, body) => {
    const outcomes = body.operations.map((op: any) => {
      seen.push(op);
      if (!receipts.has(op.opId)) receipts.set(op.opId, { opId: op.opId, status: 'applied', data: {
        id: studentId, studentId, fullName: 'Student', username: '120261234', isActive: true, mustChangePassword: true,
      } });
      return receipts.get(op.opId);
    });
    if (lost) { lost = false; throw new Error('response lost after commit'); }
    return { outcomes };
  }, () => 'admin');
  online = true;
  await assert.rejects(syncAll());
  assert.equal(await db.queue.count(), 2);
  await syncAll();
  assert.equal(receipts.size, 2); assert.equal(await db.queue.count(), 0);
  assert.equal(seen[0].data.password, created.temporaryPassword);
  assert.equal(seen[1].data.password, reset.temporaryPassword);
  assert.equal(seen[2].opId, seen[0].opId);
  const account = (await localRead('/students/accounts'))[0];
  assert.equal(account.synced, 1); assert.equal(account.credentialPending, false);
  assert(!JSON.stringify(account).includes(reset.temporaryPassword));
  assert(!JSON.stringify(await exportLocal()).includes(reset.temporaryPassword));
});

test('non-administrators cannot queue account provisioning or password resets', async () => {
  role = 'TEACHER';
  await assert.rejects(localWrite('post', '/users', { password: 'blocked-password' }));
  await assert.rejects(localWrite('post', `/students/${studentId}/account`, {}));
  assert.equal(await db.queue.count(), 0);
});

test('student registration with an account never persists temporary credentials in the student row', async () => {
  const student = await localWrite('post', '/students', { fullName: 'New student', registrationTrack: 'ACTIVITY', createAccount: true });
  const password = student.accountCredentials.temporaryPassword;
  const queue = (await db.queue.toArray())[0];
  assert.equal((await openCredentials(queue)).accountPassword, password);
  assert(!JSON.stringify(queue).includes(password));
  assert(!JSON.stringify(await db.students.toArray()).includes(password));
});

test('correcting a rejected encrypted registration retains its password with a fresh operation ID', async () => {
  const user = await localWrite('post', '/users', { username: 'taken', fullName: 'User', role: 'TEACHER', password: 'PreservedPassword123' });
  const before = (await db.queue.toArray())[0];
  await db.queue.update(before.id!, { error: 'username already used' });
  await localWrite('patch', `/users/${user.id}`, { username: 'available' });
  const after = (await db.queue.toArray())[0];
  assert.equal(await db.queue.count(), 1);
  assert.equal(after.action, 'create'); assert.notEqual(after.opId, before.opId);
  assert.equal((await openCredentials(after)).password, 'PreservedPassword123');
  assert.equal((await openCredentials(after)).username, 'available');
});
