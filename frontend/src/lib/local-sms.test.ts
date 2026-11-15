import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline } from './offline-engine';
import { localRead, localWrite, rememberRead } from './local-api';

const account = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
let role = 'ADMIN';
Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: () => JSON.stringify({ id: account, role }) } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });

beforeEach(async () => {
  role = 'ADMIN';
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => account);
  await rememberRead('/sms/recipients', {}, [{ id: student, fullName: 'أحمد', circleId: 'circle', guardianPhone: '0591234567', userId: '33333333-3333-4333-8333-333333333333' }]);
  await rememberRead('/sms/templates', {}, { SUMMONS: 'ولي أمر الطالب {اسم الطالب}، موعد الاستدعاء {التاريخ} {الوقت} بسبب {سبب الاستدعاء}.' });
});

test('cached recipients support an offline preview and durable SMS summons queue', async () => {
  const recipients = await localRead('/sms/recipients');
  assert.equal(recipients[0].fullName, 'أحمد');
  const body = { kind: 'SUMMONS', channel: 'SMS', studentIds: [student], all: false, reason: 'متابعة', date: '2026-11-15', time: '10:00' };
  const preview = await localWrite('post', '/sms/preview', body);
  assert.equal(preview[0].phone, '970591234567');
  assert.match(preview[0].text, /متابعة/);
  const queued = await localWrite('post', '/sms/communications', { ...body, preview, confirm: true, requestKey: 'offline-summons-12345' });
  assert.equal(queued.synced, 0);
  assert.equal((await db.queue.toArray())[0].table, 'smsCampaigns');
  assert.equal((await localRead('/sms/campaigns'))[0].id, queued.id);
  assert.equal((await localRead('/attendance/summons'))[0].studentId, student);
  db.close(); await db.open();
  assert.equal((await localRead('/sms/campaigns'))[0].synced, 0);
});

test('offline SMS cannot queue with changed preview or from a non-admin account', async () => {
  const body = { kind: 'SUMMONS', channel: 'SMS', studentIds: [student], reason: 'متابعة', date: '2026-11-15', time: '10:00' };
  const preview = await localWrite('post', '/sms/preview', body);
  await assert.rejects(localWrite('post', '/sms/communications', { ...body, preview: [], confirm: true, requestKey: 'offline-summons-12345' }), /أعد المعاينة/);
  role = 'TEACHER';
  await assert.rejects(localRead('/sms/recipients'), /الإدارة فقط/);
  assert.equal(await db.queue.count(), 0);
});
