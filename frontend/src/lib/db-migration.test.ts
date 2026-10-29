import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, entityTables } from './db';
import { activateDataKey, installLocalEncryption, lockDataKeys } from './local-encryption';

test('v1 database upgrades to schedules without losing records or pending writes', async () => {
  const legacy = new Dexie('halaqatFull');
  const schema: Record<string, string> = {};
  for (const table of entityTables.filter((name) => !['mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts', 'profileReviews', 'staffAttendance', 'courseAttendance', 'schoolSettings', 'chatMessages', 'communityPosts', 'communityComments', 'accountPreferences'].includes(name))) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
  legacy.version(1).stores({ ...schema, queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  await legacy.open();
  await legacy.table('students').put({ accountId: 'account', id: 'student', synced: 0, fullName: 'طالب محفوظ' });
  await legacy.table('queue').add({ accountId: 'account', opId: 'pending', table: 'students', action: 'create', entityId: 'student', data: { fullName: 'طالب محفوظ' } });
  legacy.close();
  await db.open();
  assert.equal(db.verno, 14);
  assert.equal((await db.students.get(['account', 'student']))?.fullName, 'طالب محفوظ');
  assert.equal(await db.queue.count(), 1);
  for (const table of ['mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts', 'credentialKeys', 'profileReviews', 'preparations', 'surahCompletions', 'announcements', 'mediaActivities', 'certificateRequests', 'certificates', 'certificateTemplates', 'staffAttendance', 'courseAttendance', 'schoolSettings']) assert.equal(await db.table(table).count(), 0);
  db.close();
});

test('v3 verification upgrade preserves existing download cursors and seeds only the new review table', async () => {
  await Dexie.delete('halaqatFull');
  const legacy = new Dexie('halaqatFull');
  const schema: Record<string, string> = {};
  for (const table of entityTables.filter(name => !['profileReviews', 'staffAttendance', 'courseAttendance', 'schoolSettings', 'chatMessages', 'communityPosts', 'communityComments', 'accountPreferences'].includes(name))) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
  legacy.version(3).stores({ ...schema, credentialKeys: 'accountId', queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  await legacy.open();
  await legacy.table('meta').bulkPut([{ key: 'account:downloadedAt', value: 'ready' }, { key: 'account:deltaCursor', value: '50' }]);
  await legacy.table('students').put({ id: 'student', accountId: 'account', fullName: 'Kept', synced: 1 });
  legacy.close(); await db.open();
  assert.equal((await db.meta.get('account:downloadedAt'))?.value, 'ready');
  assert.equal((await db.meta.get('account:deltaCursor'))?.value, '50');
  assert.equal((await db.meta.get('account:needsProfileReviewsBootstrap'))?.value, true);
  assert.equal((await db.students.get(['account', 'student']))?.fullName, 'Kept');
  db.close();
});

test('version 12 adds support storage without losing encrypted tickets in caches or pending work', async () => {
  await Dexie.delete('halaqatFull');
  const legacy = new Dexie('halaqatFull');
  installLocalEncryption(legacy);
  const schema = Object.fromEntries(entityTables.filter(name => name !== 'supportTickets').map(name => [name, '[accountId+id], accountId, synced']));
  legacy.version(12).stores({ ...schema, credentialKeys: 'accountId', queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  const key = new Uint8Array(32).fill(4); activateDataKey('v12-account', key);
  await legacy.open();
  await legacy.table('meta').put({ key: 'v12-account:downloadedAt', value: 'ready' });
  await legacy.table('responses').put({ key: '["v12-account","/support",[]]', accountId: 'v12-account', data: { data: [{ id: 'ticket', subject: 'Private' }] } });
  await legacy.table('queue').add({ accountId: 'v12-account', opId: 'retained', table: 'students', data: {} });
  legacy.close(); await db.open();
  assert.equal(db.verno, 14); assert.equal(await db.table('supportTickets').count(), 0);
  assert.equal((await db.meta.get('v12-account:needsSupportBootstrap'))?.value, true);
  assert.equal((await db.responses.toArray())[0].data.data[0].subject, 'Private');
  assert.equal((await db.queue.toArray())[0].opId, 'retained');
  db.close(); lockDataKeys();
});

test('version 13 adds conversations while retaining support tickets and encrypted queued replies', async () => {
  await Dexie.delete('halaqatFull');
  const legacy = new Dexie('halaqatFull'); installLocalEncryption(legacy);
  const schema = Object.fromEntries(entityTables.filter(name => name !== 'chatConversations').map(name => [name, '[accountId+id], accountId, synced']));
  legacy.version(13).stores({ ...schema, credentialKeys: 'accountId', queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  const key = new Uint8Array(32).fill(6); activateDataKey('v13-account', key);
  await legacy.open();
  await legacy.table('supportTickets').put({ accountId: 'v13-account', id: 'ticket', subject: 'Kept ticket', synced: 0 });
  await legacy.table('queue').add({ accountId: 'v13-account', opId: 'kept-reply', table: 'supportTickets', action: 'reply', entityId: 'ticket', data: { replyBody: 'Private reply' } });
  legacy.close(); lockDataKeys(); await db.open(); activateDataKey('v13-account', key);
  assert.equal(db.verno, 14); assert.equal(await db.table('chatConversations').count(), 0);
  assert.equal((await db.table('supportTickets').get(['v13-account', 'ticket'])).subject, 'Kept ticket');
  assert.equal((await db.queue.toArray())[0].data.replyBody, 'Private reply');
  db.close(); lockDataKeys();
});

test('upgrading with a locked saved account preserves encrypted metadata and pending edits', async () => {
  await Dexie.delete('halaqatFull');
  const legacy = new Dexie('halaqatFull');
  installLocalEncryption(legacy);
  const schema = Object.fromEntries(entityTables.map(name => [name, '[accountId+id], accountId, synced']));
  legacy.version(3).stores({ ...schema, credentialKeys: 'accountId', queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  const key = new Uint8Array(32).fill(7);
  activateDataKey('saved-account', key);
  await legacy.open();
  await legacy.table('meta').put({ key: 'saved-account:downloadedAt', value: 'preserved' });
  await legacy.table('queue').add({ accountId: 'saved-account', opId: 'pending-upgrade', table: 'students', action: 'create', entityId: 'student', data: { fullName: 'Pending student' } });
  legacy.close(); lockDataKeys();
  await db.open();
  activateDataKey('saved-account', key);
  assert.equal((await db.meta.get('saved-account:downloadedAt'))?.value, 'preserved');
  assert.equal((await db.queue.toArray())[0].opId, 'pending-upgrade');
  db.close(); lockDataKeys();
});
