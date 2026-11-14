import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { db } from './db';
import { activateDataKey, lockDataKeys } from './local-encryption';
import { discardStudentPhoto, queueStudentPhoto, readStudentPhoto, studentPhotoCount, syncStudentPhotos } from './pending-student-photos';
import { assertNoPendingWrites, clearAccountData } from './account-cleanup';

Object.assign(globalThis, { window: new EventTarget() });
const account = 'photo-account';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const image = () => new Blob(['student-private-image'], { type: 'image/png' });
beforeEach(async () => {
  activateDataKey(account, new Uint8Array(32).fill(19));
  await db.meta.where('key').startsWith(account + ':').delete();
  await db.students.where('accountId').equals(account).delete();
});

test('student images remain encrypted after reopening and prevent cleanup', async () => {
  await queueStudentPhoto(account, first, image());
  db.close(); await db.open();
  assert.equal(await (await readStudentPhoto(account, first))?.blob?.text(), 'student-private-image');
  assert.equal(await readStudentPhoto('other-account', first), undefined);
  const raw = await new Promise<any>((resolve, reject) => {
    const request = db.backendDB().transaction('meta').objectStore('meta').get(`${account}:studentPhoto:${first}`);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  assert.ok(raw.__sealedLocal);
  assert.ok(!JSON.stringify(raw).includes('student-private-image'));
  await assert.rejects(assertNoPendingWrites(account));
  await assert.rejects(clearAccountData(account));
  await assert.rejects(queueStudentPhoto(account, first, image()));
});

test('upload receipts survive update failure while unrelated students continue syncing', async () => {
  await db.students.put({ id: second, accountId: account, synced: 1, updatedAt: 'server-time', photoUrl: '/old.png' });
  await queueStudentPhoto(account, first, image());
  await queueStudentPhoto(account, second, image());
  let uploads = 0, reject = true;
  const transport = {
    currentAccount: () => account,
    upload: async () => `/uploads/${++uploads}.png`,
    update: async (student: string) => { if (student === first && reject) throw new Error('forbidden'); },
  };
  await assert.rejects(syncStudentPhotos(account, transport));
  assert.equal(uploads, 2);
  assert.equal(await studentPhotoCount(account), 1);
  assert.equal((await readStudentPhoto(account, first))?.uploadedUrl, '/uploads/1.png');
  assert.equal((await db.students.get([account, second]))?.photoUrl, '/uploads/2.png');
  assert.equal((await db.students.get([account, second]))?.updatedAt, 'server-time');
  reject = false;
  await Promise.all([syncStudentPhotos(account, transport), syncStudentPhotos(account, transport)]);
  assert.equal(uploads, 2); assert.equal(await studentPhotoCount(account), 0);
});

test('photo removal is queued without uploading and only changes the local record after acknowledgement', async () => {
  await db.students.put({ id: first, accountId: account, synced: 1, updatedAt: 'server-time', photoUrl: '/old.png' });
  await queueStudentPhoto(account, first, null);
  assert.equal((await db.students.get([account, first]))?.photoUrl, '/old.png');
  await syncStudentPhotos(account, {
    currentAccount: () => account,
    upload: async () => { throw new Error('must not upload removal'); },
    update: async (student, url) => { assert.equal(student, first); assert.equal(url, ''); },
  });
  assert.equal((await db.students.get([account, first]))?.photoUrl, null);
});

test('switching account during upload preserves the draft and cannot update another account', async () => {
  await queueStudentPhoto(account, first, image());
  let current = account, updates = 0;
  await assert.rejects(syncStudentPhotos(account, {
    currentAccount: () => current,
    upload: async () => { current = 'other'; return '/uploaded.png'; },
    update: async () => { updates++; },
  }));
  assert.equal(updates, 0); assert.equal(await studentPhotoCount(account), 1);
});

test('storage budget, file validation and locked storage reject writes without losing existing files', async () => {
  for (let index = 0; index < 4; index++) await queueStudentPhoto(account, `00000000-0000-4000-8000-00000000000${index}`, new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/jpeg' }));
  await assert.rejects(queueStudentPhoto(account, first, image()));
  assert.equal(await studentPhotoCount(account), 4);
  await assert.rejects(queueStudentPhoto(account, second, new Blob(['bad'], { type: 'text/html' })));
  lockDataKeys(); await assert.rejects(queueStudentPhoto(account, first, image()));
});

test('cancelling a draft requires its exact identifier and never deletes a replacement', async () => {
  await queueStudentPhoto(account, first, image());
  const draft = (await readStudentPhoto(account, first))!;
  await discardStudentPhoto(account, first, 'stale-id');
  assert.equal(await studentPhotoCount(account), 1);
  await discardStudentPhoto(account, first, draft.id);
  assert.equal(await studentPhotoCount(account), 0);
  await assertNoPendingWrites(account);
});
