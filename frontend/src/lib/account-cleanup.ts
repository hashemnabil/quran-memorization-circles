import { db, entityTables } from './db';
import { listOfflineOperations } from './offline/outbox';
import { studentPhotoCount } from './pending-student-photos';
export async function hasCommunityDraft(account:string){
  return !!await db.meta.filter(row=>row.key.startsWith(account+':community-draft:')&&(typeof row.value?.body==='string'&&!!row.value.body.trim()||row.value?.mediaIds?.length>0)).first();
}
export async function hasRecitationDraft(account:string){return !!await db.meta.filter(row=>row.key.startsWith(account+':recitationDraft:')&&!!row.value?.form?.studentId&&row.value?.dirty!==false).first();}
export async function assertNoPendingWrites(account: string) {
  if (!account) return;
  if (await hasRecitationDraft(account) || await hasCommunityDraft(account) || await db.queue.where('accountId').equals(account).count() || (await db.meta.get(`${account}:pendingAvatar`)) || (await db.meta.get(`${account}:pendingCover`)) || await studentPhotoCount(account) || (await listOfflineOperations(account)).length)
    throw Object.assign(new Error('لديك تعديلات معلّقة. زامنها قبل حذف بيانات الحساب من الجهاز أو تغيير كلمة المرور. يمكنك تسجيل الخروج أو قفل التطبيق دون فقدها.'), { localWriteRejected: true });
}
export async function clearAccountData(account: string) {
  await assertNoPendingWrites(account);
  await db.transaction('rw', db.tables, async () => {
    if(await hasRecitationDraft(account))throw new Error('لديك مسودة تسميع؛ احفظها أو احذف المسودة من نموذج التسميع قبل حذف بيانات الجهاز');
    if (await hasCommunityDraft(account)) throw new Error('لديك مسودة منشور أو قصة؛ انشرها أو امسح محتواها قبل حذف بيانات الجهاز');
    if (await db.queue.where('accountId').equals(account).count()) throw new Error('وصل تعديل جديد؛ لم تُمسح بياناتك');
    if (await db.meta.get(`${account}:pendingAvatar`)) throw new Error('لديك صورة معلّقة؛ لم تُمسح بياناتك');
    if (await db.meta.get(`${account}:pendingCover`)) throw new Error('لديك غلاف معلّق؛ لم تُمسح بياناتك');
    if (await studentPhotoCount(account)) throw new Error('لديك صور طلاب معلّقة؛ لم تُمسح بياناتك');
    for (const table of entityTables) await db.table(table).where('accountId').equals(account).delete();
    await db.responses.where('accountId').equals(account).delete();
    await db.meta.filter(row => row.key.startsWith(`${account}:`)).delete();
    await db.table('credentialKeys').delete(account);
  });
}
