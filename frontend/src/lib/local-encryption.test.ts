import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from './db';
import { activateDataKey, dataKey, forgetEncryptionMarker, lockDataKeys, openValue, sealValue } from './local-encryption';
import { rememberOfflineLogin, unlockOfflineLogin } from './offline-login';
import { protectLocalAccount } from './local-data-session';
import { configureOffline, syncAll } from './offline-engine';
import { enqueueOfflineOperation, listOfflineOperations, clearOfflineOperations } from './offline/outbox';
import { readReplica, clearReplica } from './offline/feed-replica';
import { cacheReconnectCredentials, restoreReconnectCredentials, clearReconnectCredentials } from './reconnect-credentials';
import { cacheActiveIdentity, readActiveIdentity, clearActiveIdentity } from './active-identity';
import { queryClient } from './queryClient';
import { persistQueryCache, restoreQueryCache } from './offline/queryCache';

const storage = new Map<string, string>();
const identity = { id: 'alpha', username: 'alpha', fullName: 'Private person', role: 'TEACHER' as const, isActive: true };
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
const tab = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => tab.get(key) || null, setItem: (key: string, value: string) => tab.set(key, value), removeItem: (key: string) => tab.delete(key) } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
let online = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
beforeEach(async () => { lockDataKeys(); for (const account of ['alpha', 'beta']) forgetEncryptionMarker(account); storage.clear(); tab.clear(); online = false; await db.open(); for (const table of db.tables) await table.clear(); await clearOfflineOperations('alpha'); await clearReplica('alpha'); });
after(() => db.close());
async function raw(table: string) {
  return new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open('halaqatFull');
    request.onsuccess = () => { const database = request.result; const read = database.transaction(table).objectStore(table).getAll(); read.onsuccess = () => { database.close(); resolve(read.result); }; read.onerror = () => reject(read.error); };
    request.onerror = () => reject(request.error);
  });
}

test('upgrade encrypts private records, queued edits and photo blobs without losing pending operation IDs', async () => {
  const row = { accountId: 'alpha', id: 'student', fullName: 'Hidden student', phone: 'private-phone', synced: 0, updatedAt: '2001-01-01' };
  await db.students.put(row);
  await db.queue.add({ accountId: 'alpha', table: 'students', action: 'create', entityId: row.id, opId: 'stable-operation', data: { fullName: row.fullName }, createdAt: row.updatedAt });
  await db.responses.put({ accountId: 'alpha', key: 'photo', data: new Blob(['private photo bytes'], { type: 'image/png' }) });
  const legacyOperation = await enqueueOfflineOperation({ accountId: 'alpha', resource: 'attendance-sheet', method: 'POST', path: '/attendance', payload: { circleId: '11111111-1111-4111-8111-111111111111', date: '2001-01-01', entries: [{ studentId: '22222222-2222-4222-8222-222222222222', status: 'EXCUSED', note: 'private legacy note' }] } });
  await readReplica('alpha', 'student');
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('quran-circles-change-feed');
    request.onsuccess = () => { const database = request.result; const tx = database.transaction('rows', 'readwrite'); tx.objectStore('rows').put({ key: 'alpha:student:legacy', accountId: 'alpha', resource: 'student', id: 'legacy', data: { id: 'legacy', fullName: 'private legacy name' } }); tx.oncomplete = () => { database.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('quran-circles-query-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'accountId' });
    request.onsuccess = () => { const database = request.result; const tx = database.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put({ accountId: 'alpha', savedAt: 0, state: { queries: [{ state: { data: 'private legacy query' } }], mutations: [] } }); tx.oncomplete = () => { database.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
  await rememberOfflineLogin('alpha', 'A long local passphrase', identity);
  await protectLocalAccount('alpha');
  for (const table of ['students', 'queue', 'responses']) {
    const stored = JSON.stringify(await raw(table));
    for (const text of ['Hidden student', 'private-phone', 'private photo bytes']) assert(!stored.includes(text));
    assert(stored.includes('__sealedLocal'));
  }
  assert.equal((await db.students.where('accountId').equals('alpha').filter(row => row.fullName === 'Hidden student').first())?.phone, 'private-phone');
  assert.equal(await (await db.responses.get('photo'))?.data.text(), 'private photo bytes');
  assert.equal((await db.queue.toArray())[0].opId, 'stable-operation');
  assert.equal((await listOfflineOperations('alpha'))[0].id, legacyOperation.id);
  assert.equal((await readReplica('alpha', 'student'))[0].fullName, 'private legacy name');
  assert.equal((await db.meta.get('alpha:querySnapshot'))?.value.state.queries[0].state.data, 'private legacy query');
});

test('password unlock after database closure has no age expiry, preserves offline edits and replays once on reconnect', async () => {
  await rememberOfflineLogin('alpha', 'A long local passphrase', identity);
  await protectLocalAccount('alpha');
  await db.students.put({ accountId: 'alpha', id: 'student', fullName: 'Saved offline', synced: 0, updatedAt: '2001-01-01' });
  await db.queue.add({ accountId: 'alpha', table: 'students', action: 'create', entityId: 'student', opId: 'same-after-restart', data: { fullName: 'Saved offline' }, createdAt: '2001-01-01' });
  lockDataKeys(); db.close();
  const now = Date.now; Date.now = () => Date.UTC(2099, 0, 1);
  try { await assert.rejects(unlockOfflineLogin('alpha', 'wrong')); await unlockOfflineLogin('alpha', 'A long local passphrase'); }
  finally { Date.now = now; }
  await db.open();
  assert.equal((await db.students.get(['alpha', 'student']))?.fullName, 'Saved offline');
  assert.equal((await db.queue.toArray())[0].opId, 'same-after-restart');
  let calls = 0; online = true;
  configureOffline(async (_method, _path, body) => { calls++; assert.equal(body.operations[0].opId, 'same-after-restart'); assert.equal(body.operations[0].data.fullName, 'Saved offline'); return { outcomes: [{ opId: 'same-after-restart', status: 'applied', data: { id: 'student', fullName: 'Saved offline' } }] }; }, () => 'alpha');
  await syncAll(); await syncAll();
  assert.equal(calls, 1); assert.equal(await db.queue.count(), 0);
});

test('account keys and encrypted contexts cannot be substituted, and locked accounts expose no private contents', async () => {
  activateDataKey('alpha', crypto.getRandomValues(new Uint8Array(32)));
  const packet = sealValue('alpha', 'student', { fullName: 'Account A private' });
  assert.throws(() => openValue('alpha', 'wrong-context', packet));
  await db.students.put({ accountId: 'alpha', id: 'student', fullName: 'Account A private', synced: 1, updatedAt: '2001-01-01' });
  activateDataKey('beta', crypto.getRandomValues(new Uint8Array(32)));
  assert.throws(() => openValue('beta', 'student', packet));
  assert.equal((await db.students.get(['alpha', 'student']))?.fullName, undefined);
  await assert.rejects(db.students.put({ accountId: 'alpha', id: 'student', fullName: 'Wrong account write', synced: 0, updatedAt: '2001-01-01' }));
});

test('updating a verified password wraps the same data key instead of replacing or erasing encrypted data', async () => {
  await rememberOfflineLogin('alpha', 'Old long passphrase', identity);
  const key = new Uint8Array(dataKey('alpha')!);
  await db.students.put({ accountId: 'alpha', id: 'student', fullName: 'Keep this record', synced: 1, updatedAt: '2001-01-01' });
  await rememberOfflineLogin('alpha', 'New long passphrase', identity);
  lockDataKeys();
  await assert.rejects(unlockOfflineLogin('alpha', 'Old long passphrase'));
  await unlockOfflineLogin('alpha', 'New long passphrase');
  assert.deepEqual(dataKey('alpha'), key);
  assert.equal((await db.students.get(['alpha', 'student']))?.fullName, 'Keep this record');
});

test('reload verification is encrypted, bound to the unlocked account and removed on logout', () => {
  const key = crypto.getRandomValues(new Uint8Array(32)); activateDataKey('alpha', key);
  const value = { account: 'alpha', username: 'alpha', password: 'Do not persist as plaintext' };
  cacheReconnectCredentials(value);
  assert(![...tab.values()].join('').includes(value.password));
  assert(![...storage.values()].join('').includes(value.password));
  assert.deepEqual(restoreReconnectCredentials('alpha'), value);
  lockDataKeys(); assert.equal(restoreReconnectCredentials('alpha'), undefined);
  activateDataKey('beta', crypto.getRandomValues(new Uint8Array(32)));
  assert.equal(restoreReconnectCredentials('beta'), undefined);
  activateDataKey('alpha', key); assert.deepEqual(restoreReconnectCredentials('alpha'), value);
  clearReconnectCredentials(); assert.equal(restoreReconnectCredentials('alpha'), undefined);
});

test('account routing remains tab scoped and clearing identity invalidates background writers', () => {
  cacheActiveIdentity(identity);
  assert(!storage.get('qc.offlineUser')?.includes(identity.fullName));
  // A second tab can publish a different persistent routing hint without
  // changing the first tab's active account or its data scope.
  localStorage.setItem('qc.offlineUser', JSON.stringify({ id: 'beta', role: 'STUDENT', isActive: true }));
  assert.equal(readActiveIdentity()?.id, 'alpha');
  clearActiveIdentity(); assert.equal(readActiveIdentity(), null);
});

test('a late query snapshot cannot hydrate the next account after logout or switching', async () => {
  activateDataKey('alpha', crypto.getRandomValues(new Uint8Array(32)));
  try {
    queryClient.setQueryData(['account-isolation'], 'Private alpha snapshot');
    await persistQueryCache('alpha'); queryClient.clear();
    let current = true;
    const restoring = restoreQueryCache('alpha', () => current);
    current = false;
    assert.equal(await restoring, false);
    assert.equal(queryClient.getQueryData(['account-isolation']), undefined);
    assert.equal(await restoreQueryCache('alpha', () => true), true);
    assert.equal(queryClient.getQueryData(['account-isolation']), 'Private alpha snapshot');
    assert.equal(queryClient.getQueryState(['account-isolation'])?.isInvalidated, true,
      'restored data must not suppress the next server read');
  } finally { queryClient.clear(); }
});
