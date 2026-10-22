import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, entityTables } from './db';
import { activateDataKey, installLocalEncryption, lockDataKeys } from './local-encryption';

test('v1 database upgrades to schedules without losing records or pending writes', async () => {
  const legacy = new Dexie('halaqatFull');
  const schema: Record<string, string> = {};
  for (const table of entityTables.filter((name) => !['mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts', 'profileReviews', 'staffAttendance', 'courseAttendance', 'schoolSettings'].includes(name))) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
  legacy.version(1).stores({ ...schema, queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  await legacy.open();
  await legacy.table('students').put({ accountId: 'account', id: 'student', synced: 0, fullName: 'طالب محفوظ' });
  await legacy.table('queue').add({ accountId: 'account', opId: 'pending', table: 'students', action: 'create', entityId: 'student', data: { fullName: 'طالب محفوظ' } });
  legacy.close();
  await db.open();
  assert.equal(db.verno, 11);
  assert.equal((await db.students.get(['account', 'student']))?.fullName, 'طالب محفوظ');
  assert.equal(await db.queue.count(), 1);
  for (const table of ['mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts', 'credentialKeys', 'profileReviews', 'preparations', 'surahCompletions', 'announcements', 'mediaActivities', 'certificateRequests', 'certificates', 'certificateTemplates', 'staffAttendance', 'courseAttendance', 'schoolSettings']) assert.equal(await db.table(table).count(), 0);
  db.close();
});

test('v3 verification upgrade preserves existing download cursors and seeds only the new review table', async () => {
  await Dexie.delete('halaqatFull');
  const legacy = new Dexie('halaqatFull');
  const schema: Record<string, string> = {};
  for (const table of entityTables.filter(name => !['profileReviews', 'staffAttendance', 'courseAttendance', 'schoolSettings'].includes(name))) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
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
