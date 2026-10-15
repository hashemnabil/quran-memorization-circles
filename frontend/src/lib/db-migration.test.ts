import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, entityTables } from './db';

test('v1 database upgrades to schedules without losing records or pending writes', async () => {
  const legacy = new Dexie('halaqatFull');
  const schema: Record<string, string> = {};
  for (const table of entityTables.filter((name) => !['mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts'].includes(name))) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
  legacy.version(1).stores({ ...schema, queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  await legacy.open();
  await legacy.table('students').put({ accountId: 'account', id: 'student', synced: 0, fullName: 'طالب محفوظ' });
  await legacy.table('queue').add({ accountId: 'account', opId: 'pending', table: 'students', action: 'create', entityId: 'student', data: { fullName: 'طالب محفوظ' } });
  legacy.close();
  await db.open();
  assert.equal(db.verno, 3);
  assert.equal((await db.students.get(['account', 'student']))?.fullName, 'طالب محفوظ');
  assert.equal(await db.queue.count(), 1);
  for (const table of ['mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts', 'credentialKeys']) assert.equal(await db.table(table).count(), 0);
  db.close();
});
