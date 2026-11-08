import { db } from './db';
import { dataKey } from './local-encryption';

type PendingCover = { id: string; blob: Blob; createdAt: string };
const key = (account: string) => `${account}:pendingCover`;
const running = new Map<string, Promise<void>>();
export async function readPendingCover(account: string): Promise<PendingCover | undefined> { return (await db.meta.get(key(account)))?.value; }
export async function queueCover(account: string, blob: Blob) {
  if (!dataKey(account)) throw new Error('افتح الحماية المحلية قبل حفظ الغلاف');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || !blob.size || blob.size > 5 * 1024 * 1024) throw new Error('اختر صورة بحجم لا يتجاوز 5 ميجابايت');
  await db.transaction('rw', db.meta, async () => {
    if (await db.meta.get(key(account))) throw new Error('لديك غلاف بانتظار المزامنة');
    await db.meta.put({ key: key(account), value: { id: crypto.randomUUID(), blob, createdAt: new Date().toISOString() } });
  });
  window.dispatchEvent(new Event('halaqat:changed'));
}
export function syncPendingCover(account: string, transport: { currentAccount: () => string; save: (blob: Blob, requestId: string) => Promise<void> }) {
  const previous = running.get(account); if (previous) return previous;
  const sync = async () => {
    const current = () => { if (transport.currentAccount() !== account || !dataKey(account)) throw new Error('تغير الحساب؛ الغلاف محفوظ للمزامنة لاحقًا'); };
    current(); const pending = await readPendingCover(account); if (!pending) return;
    current(); await transport.save(pending.blob, pending.id); current();
    await db.meta.delete(key(account)); window.dispatchEvent(new Event('halaqat:changed'));
  };
  const promise = (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`halaqat-cover:${account}`, sync) : sync()).then(() => undefined).finally(() => { running.delete(account); });
  running.set(account, promise); return promise;
}
