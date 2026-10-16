import { db, entityTables } from './db';
import { listOfflineOperations } from './offline/outbox';
export async function assertNoPendingWrites(account: string) {
  if (!account) return;
  if (await db.queue.where('accountId').equals(account).count() || (await listOfflineOperations(account)).length)
    throw Object.assign(new Error('لديك تعديلات معلّقة. زامنها أو احتفظ بنسخة احتياطية، ثم أكمل تسجيل الخروج أو تغيير كلمة المرور. يمكنك قفل التطبيق محليًا دون فقدها.'), { localWriteRejected: true });
}
export async function clearAccountData(account: string) {
  await assertNoPendingWrites(account);
  await db.transaction('rw', db.tables, async () => {
    if (await db.queue.where('accountId').equals(account).count()) throw new Error('وصل تعديل جديد؛ لم تُمسح بياناتك');
    for (const table of entityTables) await db.table(table).where('accountId').equals(account).delete();
    await db.responses.where('accountId').equals(account).delete();
    await db.meta.filter(row => row.key.startsWith(`${account}:`)).delete();
    await db.table('credentialKeys').delete(account);
  });
}
