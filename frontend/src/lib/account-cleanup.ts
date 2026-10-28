import { db, entityTables } from './db';
import { listOfflineOperations } from './offline/outbox';
import { studentPhotoCount } from './pending-student-photos';
export async function assertNoPendingWrites(account: string) {
  if (!account) return;
  if (await db.queue.where('accountId').equals(account).count() || (await db.meta.get(`${account}:pendingAvatar`)) || await studentPhotoCount(account) || (await listOfflineOperations(account)).length)
    throw Object.assign(new Error('لديك تعديلات معلّقة. زامنها قبل حذف بيانات الحساب من الجهاز أو تغيير كلمة المرور. يمكنك تسجيل الخروج أو قفل التطبيق دون فقدها.'), { localWriteRejected: true });
}
export async function clearAccountData(account: string) {
  await assertNoPendingWrites(account);
  await db.transaction('rw', db.tables, async () => {
    if (await db.queue.where('accountId').equals(account).count()) throw new Error('وصل تعديل جديد؛ لم تُمسح بياناتك');
    if (await db.meta.get(`${account}:pendingAvatar`)) throw new Error('لديك صورة معلّقة؛ لم تُمسح بياناتك');
    if (await studentPhotoCount(account)) throw new Error('لديك صور طلاب معلّقة؛ لم تُمسح بياناتك');
    for (const table of entityTables) await db.table(table).where('accountId').equals(account).delete();
    await db.responses.where('accountId').equals(account).delete();
    await db.meta.filter(row => row.key.startsWith(`${account}:`)).delete();
    await db.table('credentialKeys').delete(account);
  });
}
