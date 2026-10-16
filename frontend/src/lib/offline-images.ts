import { db } from './db';
import { accountId } from './offline-engine';
import { Capacitor } from '@capacitor/core';
// IndexedDB blobs also work in Capacitor, where the service worker is disabled.
export async function cachedImage(url: string, expectedAccount?: string): Promise<Blob | undefined> {
  if (!url || /^(data:|blob:)/.test(url)) return undefined;
  const account = accountId(); const key = `${account}:image:${url}`;
  if (expectedAccount && expectedAccount !== account) return undefined;
  const existing = await db.responses.get(key);
  if (existing?.data instanceof Blob) return existing.data;
  if (!navigator.onLine) return undefined;
  const base = (import.meta.env?.VITE_API_URL || 'https://quran-memorization-circles.onrender.com/api').replace(/\/api\/?$/, '');
  const source = Capacitor.isNativePlatform() && url.startsWith('/') ? `${base}${url}` : url;
  const response = await fetch(source, { credentials: 'same-origin', cache: 'force-cache' });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return undefined;
  const blob = await response.blob();
  // A request started by the previous account must not restore its private
  // image after logout/switch cleared that account's local replica.
  try { if (accountId() !== account) return undefined; } catch { return undefined; }
  await db.responses.put({ key, accountId: account, data: blob });
  return blob;
}
