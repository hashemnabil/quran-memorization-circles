import { db } from './db';
import { dataKey } from './local-encryption';

export type PendingStudentPhoto = { id: string; studentId: string; blob: Blob | null; uploadedUrl?: string; createdAt: string; error?: string };
const prefix = (account: string) => `${account}:studentPhoto:`;
const key = (account: string, student: string) => prefix(account) + student;
const running = new Map<string, Promise<void>>();
const changed = () => window.dispatchEvent(new Event('halaqat:changed'));
export async function studentPhotoCount(account: string) {
  return db.meta.where('key').startsWith(prefix(account)).count();
}
export async function readStudentPhoto(account: string, student: string): Promise<PendingStudentPhoto | undefined> {
  return (await db.meta.get(key(account, student)))?.value;
}
export async function discardStudentPhoto(account: string, student: string, id: string) {
  if (!dataKey(account)) throw new Error('افتح الحماية المحلية أولًا');
  if (running.has(account)) throw new Error('انتظر انتهاء محاولة المزامنة قبل إلغاء الطلب');
  const discard = async () => {
    if (!dataKey(account)) throw new Error('تغيّر الحساب');
    await db.transaction('rw', db.meta, async () => {
      const pending = await readStudentPhoto(account, student);
      if (pending?.id === id) await db.meta.delete(key(account, student));
    });
  };
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(`halaqat-student-photos:${account}`, discard);
  else await discard();
  changed();
}
export async function queueStudentPhoto(account: string, studentId: string, blob: Blob | null) {
  if (!dataKey(account)) throw new Error('افتح الحماية المحلية قبل حفظ الصورة');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) throw new Error('معرّف الطالب غير صالح');
  if (blob && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) || !blob.size || blob.size > 5 * 1024 * 1024))
    throw new Error('اختر صورة صالحة بحجم لا يتجاوز 5 ميجابايت');
  await db.transaction('rw', db.meta, async () => {
    if (await db.meta.get(key(account, studentId))) throw new Error('صورة الطالب بانتظار المزامنة بالفعل');
    const rows = await db.meta.where('key').startsWith(prefix(account)).toArray();
    if (rows.length >= 20 || rows.reduce((sum, row) => sum + (row.value?.blob?.size || 0), 0) + (blob?.size || 0) > 20 * 1024 * 1024)
      throw new Error('بلغت الصور المعلقة حد التخزين؛ زامن الصور المحفوظة أولًا');
    await db.meta.put({ key: key(account, studentId), value: { id: crypto.randomUUID(), studentId, blob, createdAt: new Date().toISOString() } });
  });
  changed();
}

type Transport = { currentAccount: () => string; upload: (blob: Blob) => Promise<string>; update: (studentId: string, url: string) => Promise<void> };
export function syncStudentPhotos(account: string, transport: Transport): Promise<void> {
  const existing = running.get(account); if (existing) return existing;
  const sync = async () => {
    const current = () => { if (transport.currentAccount() !== account || !dataKey(account)) throw new Error('تغيّر الحساب؛ الصور محفوظة للمزامنة لاحقًا'); };
    current();
    const rows = await db.meta.where('key').startsWith(prefix(account)).toArray();
    let failure: unknown;
    for (const row of rows) {
      current();
      const pending = row.value as PendingStudentPhoto;
      try {
        if (pending.blob && !pending.uploadedUrl) {
          const url = await transport.upload(pending.blob);
          current();
          if (!url || typeof url !== 'string') throw new Error('لم يؤكد الخادم رفع الصورة');
          pending.uploadedUrl = url;
          await db.meta.put({ key: row.key, value: pending });
        }
        current();
        await transport.update(pending.studentId, pending.uploadedUrl || '');
        current();
        await db.transaction('rw', db.meta, db.students, async () => {
          await db.students.update([account, pending.studentId], { photoUrl: pending.uploadedUrl || null });
          await db.meta.delete(row.key);
        });
      } catch (error) {
        current();
        pending.error = error instanceof Error ? error.message : 'تعذرت مزامنة الصورة';
        await db.meta.put({ key: row.key, value: pending });
        failure ||= error;
      }
      changed();
    }
    if (failure) throw failure;
  };
  const promise = (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(`halaqat-student-photos:${account}`, sync) : sync()).then(() => undefined)
    .finally(() => running.delete(account));
  running.set(account, promise); return promise;
}
