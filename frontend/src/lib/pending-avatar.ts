import { db } from './db';
import { dataKey } from './local-encryption';

export type PendingAvatar = { id: string; blob: Blob; uploadedUrl?: string; createdAt: string };
const key = (account: string) => `${account}:pendingAvatar`;
const running = new Map<string, Promise<void>>();

export async function readPendingAvatar(account: string): Promise<PendingAvatar | undefined> {
  return (await db.meta.get(key(account)))?.value;
}

export async function queueAvatar(account: string, blob: Blob) {
  // Never allow a sensitive attachment to fall back to plaintext storage.
  if (!dataKey(account)) throw new Error('افتح الحماية المحلية قبل حفظ الصورة');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || !blob.size || blob.size > 5 * 1024 * 1024)
    throw new Error('اختر صورة JPEG أو PNG أو WebP بحجم لا يتجاوز 5 ميجابايت');
  await db.transaction('rw', db.meta, async () => {
    if (await db.meta.get(key(account))) throw new Error('لديك صورة بانتظار المزامنة؛ انتظر رفعها قبل اختيار صورة أخرى');
    await db.meta.put({ key: key(account), value: { id: crypto.randomUUID(), blob, createdAt: new Date().toISOString() } });
  });
  window.dispatchEvent(new Event('halaqat:changed'));
}

type AvatarTransport = {
  currentAccount: () => string;
  upload: (blob: Blob) => Promise<string>;
  update: (url: string) => Promise<void>;
};

/** Keep the upload receipt until the profile update is acknowledged. */
export function syncPendingAvatar(account: string, transport: AvatarTransport): Promise<void> {
  const existing = running.get(account);
  if (existing) return existing;
  const sync = async () => {
    const current = () => {
      if (transport.currentAccount() !== account || !dataKey(account)) throw new Error('تغيّر الحساب؛ الصورة محفوظة للمزامنة لاحقًا');
    };
    current();
    const pending = await readPendingAvatar(account);
    if (!pending) return;
    if (!pending.uploadedUrl) {
      current();
      const url = await transport.upload(pending.blob);
      current();
      if (!url || typeof url !== 'string') throw new Error('لم يؤكد الخادم رفع الصورة');
      pending.uploadedUrl = url;
      await db.meta.put({ key: key(account), value: pending });
    }
    current();
    await transport.update(pending.uploadedUrl);
    current();
    await db.meta.delete(key(account));
    window.dispatchEvent(new Event('halaqat:changed'));
  };
  const promise = (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(`halaqat-avatar:${account}`, sync) : sync()).then(() => undefined)
    .finally(() => { running.delete(account); });
  running.set(account, promise);
  return promise;
}
