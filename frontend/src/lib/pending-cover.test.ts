import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from './db';
import { activateDataKey, lockDataKeys } from './local-encryption';
import { queueCover, readPendingCover, syncPendingCover } from './pending-cover';
import { assertNoPendingWrites } from './account-cleanup';
Object.assign(globalThis, { window: new EventTarget() });

test('cover survives offline storage and retries a lost acknowledgement with the same id', async () => {
  const account = 'cover-owner'; activateDataKey(account, new Uint8Array(32).fill(4));
  await queueCover(account, new Blob(['image'], { type: 'image/jpeg' }));
  await assert.rejects(assertNoPendingWrites(account));
  db.close(); await db.open();
  assert.equal(await (await readPendingCover(account))?.blob.text(), 'image');
  assert.equal(await readPendingCover('someone-else'), undefined);
  let calls = 0; const ids: string[] = [];
  const transport = { currentAccount: () => account, save: async (_blob: Blob, id: string) => { ids.push(id); if (++calls === 1) throw new Error('response lost'); } };
  await assert.rejects(syncPendingCover(account, transport));
  assert.ok(await readPendingCover(account));
  await Promise.all([syncPendingCover(account, transport), syncPendingCover(account, transport)]);
  assert.equal(calls, 2); assert.equal(new Set(ids).size, 1);
  assert.equal(await readPendingCover(account), undefined);
  await assertNoPendingWrites(account);
});
test('cover cannot be uploaded under another account and rejects unsupported files', async () => {
  const account = 'cover-isolation'; activateDataKey(account, new Uint8Array(32).fill(7));
  await assert.rejects(queueCover(account, new Blob(['html'], { type: 'text/html' })));
  await queueCover(account, new Blob(['image'], { type: 'image/png' }));
  let saves = 0;
  await assert.rejects(syncPendingCover(account, { currentAccount: () => 'other', save: async () => { saves++; } }));
  assert.equal(saves, 0); assert.ok(await readPendingCover(account));
  await db.meta.delete(account + ':pendingCover'); lockDataKeys();
  await assert.rejects(queueCover(account, new Blob(['image'], { type: 'image/png' })));
});
