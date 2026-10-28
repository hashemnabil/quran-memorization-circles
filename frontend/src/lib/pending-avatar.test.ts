import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from './db';
import { activateDataKey, lockDataKeys } from './local-encryption';
import { queueAvatar, readPendingAvatar, syncPendingAvatar } from './pending-avatar';
import { assertNoPendingWrites, clearAccountData } from './account-cleanup';

Object.assign(globalThis, { window: new EventTarget() });
const image = () => new Blob(['private-image'], { type: 'image/jpeg' });

test('avatar is encrypted, survives reopening, and blocks account cleanup until acknowledged', async () => {
  activateDataKey('avatar-owner', new Uint8Array(32).fill(9));
  await queueAvatar('avatar-owner', image());
  db.close(); await db.open();
  const pending = await readPendingAvatar('avatar-owner');
  assert.equal(await pending?.blob.text(), 'private-image');
  assert.equal(await readPendingAvatar('another-account'), undefined);
  const raw = await new Promise<any>((resolve, reject) => {
    const transaction = db.backendDB().transaction('meta');
    const request = transaction.objectStore('meta').get('avatar-owner:pendingAvatar');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  assert.ok(raw.__sealedLocal);
  assert.ok(!JSON.stringify(raw).includes('private-image'));
  await assert.rejects(assertNoPendingWrites('avatar-owner'));
  await assert.rejects(clearAccountData('avatar-owner'));
  await assert.rejects(queueAvatar('avatar-owner', image()));

  let uploads = 0, updates = 0;
  const transport = {
    currentAccount: () => 'avatar-owner',
    upload: async () => { uploads++; return '/uploads/avatars/saved.jpg'; },
    update: async () => { updates++; if (updates === 1) throw new Error('response lost'); },
  };
  await assert.rejects(syncPendingAvatar('avatar-owner', transport));
  assert.equal((await readPendingAvatar('avatar-owner'))?.uploadedUrl, '/uploads/avatars/saved.jpg');
  db.close(); await db.open();
  await Promise.all([syncPendingAvatar('avatar-owner', transport), syncPendingAvatar('avatar-owner', transport)]);
  assert.equal(uploads, 1);
  assert.equal(updates, 2);
  assert.equal(await readPendingAvatar('avatar-owner'), undefined);
  await assertNoPendingWrites('avatar-owner');
});

test('switching accounts during upload never updates the next account and keeps the draft', async () => {
  activateDataKey('avatar-switch', new Uint8Array(32).fill(8));
  await queueAvatar('avatar-switch', image());
  let account = 'avatar-switch'; let updates = 0;
  await assert.rejects(syncPendingAvatar('avatar-switch', {
    currentAccount: () => account,
    upload: async () => { account = 'next-account'; return '/uploads/avatars/file.jpg'; },
    update: async () => { updates++; },
  }));
  assert.equal(updates, 0);
  assert.ok(await readPendingAvatar('avatar-switch'));
  await db.meta.delete('avatar-switch:pendingAvatar');
  lockDataKeys();
  await assert.rejects(queueAvatar('no-key', image()));
});

test('oversized and unsupported files are rejected before any local write', async () => {
  activateDataKey('avatar-validation', new Uint8Array(32).fill(7));
  await assert.rejects(queueAvatar('avatar-validation', new Blob(['x'], { type: 'text/html' })));
  await assert.rejects(queueAvatar('avatar-validation', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })));
  assert.equal(await readPendingAvatar('avatar-validation'), undefined);
});
