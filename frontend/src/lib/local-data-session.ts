import { db, entityTables } from './db';
import { credentialStorage } from './credential-storage';
import { activateDataKey, dataKey, decodeBytes, encodeBytes, encryptedAccount, lockDataKeys } from './local-encryption';
import { protectLegacyOutbox } from './offline/outbox';
import { protectLegacyReplica } from './offline/feed-replica';
import { migrateLegacyQueryCache } from './offline/queryCache';

const keyName = (account: string) => `local-data-key-v1:${account}`;
export async function persistDataSession(account: string) {
  const key = dataKey(account); if (key) await credentialStorage.set(keyName(account), encodeBytes(key));
}
export async function restoreDataSession(account: string) {
  if (dataKey(account)) return;
  const saved = await credentialStorage.get(keyName(account));
  if (saved) {
    activateDataKey(account, decodeBytes(saved));
    try { await db.meta.get(`${account}:encryptionV1`); }
    catch (error) { lockDataKeys(); throw error; }
  }
  else if (encryptedAccount(account)) throw new Error('أدخل كلمة المرور لفتح النسخة المحلية المحفوظة');
}
export async function lockDataSession(account?: string) {
  lockDataKeys();
  if (account) await credentialStorage.remove(keyName(account));
}
export async function protectLocalAccount(account: string) {
  if (!dataKey(account)) throw new Error('مفتاح تشفير الحساب غير متاح');
  // Dexie disables automatic reopening after a version-change close or a
  // failed open. Explicit opening preserves the database and exposes the
  // original opening error instead of a later DatabaseClosedError.
  if (!db.isOpen()) await db.open();
  if ((await db.meta.get(`${account}:encryptionV1`))?.value) return;
  // Each rewrite is atomic. Interrupted upgrades resume; no clears, version
  // resets or replacement keys, and pending operation IDs are preserved.
  for (const name of [...entityTables, 'queue', 'responses']) {
    const table = db.table(name);
    await db.transaction('rw', table, async () => {
      const rows = await table.where('accountId').equals(account).toArray();
      if (rows.length) await table.bulkPut(rows);
    });
  }
  await db.transaction('rw', db.meta, async () => {
    const rows = await db.meta.filter(row => row.key.startsWith(`${account}:`)).toArray();
    if (rows.length) await db.meta.bulkPut(rows);
  });
  await protectLegacyOutbox(account);
  await protectLegacyReplica(account);
  await protectLegacyReplica(`${account}:snapshot`);
  await migrateLegacyQueryCache(account);
  await db.meta.put({ key: `${account}:encryptionV1`, value: true });
  if (typeof caches !== 'undefined') await caches.delete('quran-circles-images');
}
