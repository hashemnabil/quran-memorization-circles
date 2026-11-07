/** Durable offline outbox shared by the web app and Capacitor WebView.
 * This is infrastructure only: do not replay arbitrary API mutations. Queue
 * only endpoints with server-side idempotency and a domain-specific conflict policy.
 */
import { validateAttendancePayload } from './attendance-validation.js';
import { openValue, sealValue } from '../local-encryption';

const stored = (item: OutboxOperation) => ({ ...item, payload: sealValue(item.accountId, `legacy-outbox:${item.id}`, item.payload), lastError: item.lastError ? sealValue(item.accountId, `legacy-error:${item.id}`, item.lastError) : undefined });
const opened = (item: any): OutboxOperation => ({ ...item, payload: openValue(item.accountId, `legacy-outbox:${item.id}`, item.payload), lastError: item.lastError ? openValue(item.accountId, `legacy-error:${item.id}`, item.lastError) : undefined });

export type OutboxOperation = {
  id: string; accountId: string; resource: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; payload: unknown;
  createdAt: number; attempts: number; state: 'pending' | 'blocked'; lastError?: string;
};
const DB_NAME = 'quran-circles-offline';
const DB_VERSION = 1;
const STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('التخزين المحلي غير متاح على هذا الجهاز'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('accountId', 'accountId', { unique: false });
        store.createIndex('state', 'state', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذر فتح التخزين المحلي'));
  });
}
function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export async function enqueueOfflineOperation(
  operation: Omit<OutboxOperation, 'id' | 'createdAt' | 'attempts' | 'state'>,
): Promise<OutboxOperation> {
  if (!operation.accountId.trim()) throw new Error('يلزم تحديد الحساب قبل حفظ التعديل');
  // Fail closed: the replay handler currently supports exactly one domain operation.
  // Do not allow future callers to queue arbitrary writes that would later be rejected
  // or, worse, accidentally replayed without a conflict/idempotency policy.
  if (
    operation.resource !== 'attendance-sheet' ||
    operation.method !== 'POST' ||
    operation.path !== '/attendance'
  ) {
    throw new Error('هذا النوع من التعديلات غير مفعّل للمزامنة دون اتصال');
  }
  if (!operation.path.startsWith('/')) throw new Error('مسار الطلب يجب أن يبدأ بـ /');
  const validationError = validateAttendancePayload(operation.payload);
  if (validationError) throw new Error(validationError);
  const item: OutboxOperation = { ...operation, id: makeId(), createdAt: Date.now(), attempts: 0, state: 'pending' };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(stored(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر حفظ التعديل محلياً'));
      tx.onabort = () => reject(tx.error ?? new Error('أُلغي حفظ التعديل'));
    });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('quran-circles:outbox-changed'));
    return item;
  } finally { db.close(); }
}
export async function listOfflineOperations(accountId: string): Promise<OutboxOperation[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('accountId').getAll(accountId);
      req.onsuccess = () => { try { resolve(req.result.map(opened).sort((a: OutboxOperation, b: OutboxOperation) => a.createdAt - b.createdAt)); } catch (error) { reject(error); } };
      req.onerror = () => reject(req.error ?? new Error('تعذر قراءة التعديلات المحفوظة'));
    });
  } finally { db.close(); }
}
export async function removeOfflineOperation(id: string, accountId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => { const item = req.result as OutboxOperation | undefined; if (item?.accountId === accountId) store.delete(id); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر حذف التعديل'));
    });
  } finally { db.close(); }
}
export async function blockOfflineOperation(id: string, accountId: string, reason: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item?.accountId === accountId) { try { store.put(stored({ ...opened(item), state: 'blocked', attempts: item.attempts + 1, lastError: reason })); } catch (error) { reject(error); tx.abort(); } }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر تحديث حالة التعديل'));
    });
  } finally { db.close(); }
}


/** Record a transient replay failure without discarding the queued payload. */
export async function recordOfflineRetry(id: string, accountId: string, reason: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item?.accountId === accountId && item.state === 'pending') {
          try { store.put(stored({ ...opened(item), attempts: item.attempts + 1, lastError: reason })); } catch (error) { reject(error); tx.abort(); }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر تسجيل محاولة المزامنة'));
    });
  } finally { db.close(); }
}

export async function protectLegacyOutbox(accountId: string) {
  const items = await listOfflineOperations(accountId);
  const database = await openDb();
  try { await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    try { for (const item of items) tx.objectStore(STORE).put(stored(item)); } catch (error) { reject(error); tx.abort(); }
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error('تعذر تشفير العمليات القديمة؛ لم تُمسح'));
  }); } finally { database.close(); }
}


/** Remove only this account's queued writes on explicit logout. */
export async function clearOfflineOperations(accountId: string): Promise<void> {
  if (!accountId || typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).index('accountId').openCursor(IDBKeyRange.only(accountId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر مسح التعديلات المحلية'));
    });
  } finally {
    db.close();
  }
}
