/** Durable offline outbox shared by the web app and Capacitor WebView.
 * This is infrastructure only: do not replay arbitrary API mutations. Queue
 * only endpoints with server-side idempotency and a domain-specific conflict policy.
 */
import { offlineOperationSpec } from './write-contracts.js';

export type OutboxOperation = {
  id: string; accountId: string; resource: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; payload: unknown;
  baseUpdatedAt?: string; createdAt: number; attempts: number; state: 'pending' | 'blocked'; lastError?: string;
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
  offlineOperationSpec(operation);
  const item: OutboxOperation = { ...operation, id: makeId(), createdAt: Date.now(), attempts: 0, state: 'pending' };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر حفظ التعديل محلياً'));
      tx.onabort = () => reject(tx.error ?? new Error('أُلغي حفظ التعديل'));
    });
    return item;
  } finally { db.close(); }
}
export async function listOfflineOperations(accountId: string): Promise<OutboxOperation[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('accountId').getAll(accountId);
      req.onsuccess = () => resolve((req.result as OutboxOperation[]).sort((a, b) => a.createdAt - b.createdAt));
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
        const item = req.result as OutboxOperation | undefined;
        if (item?.accountId === accountId) store.put({ ...item, state: 'blocked', attempts: item.attempts + 1, lastError: reason });
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
        const item = req.result as OutboxOperation | undefined;
        if (item?.accountId === accountId && item.state === 'pending') {
          store.put({ ...item, attempts: item.attempts + 1, lastError: reason });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر تسجيل محاولة المزامنة'));
    });
  } finally { db.close(); }
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

/** Replace a reviewed blocked write atomically; never mutate/reuse a recorded opId. */
export async function replaceBlockedOfflineOperation(id: string, accountId: string, baseUpdatedAt: string): Promise<OutboxOperation> {
  const db = await openDb();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); const request = store.get(id);
    let replacement: OutboxOperation;
    request.onsuccess = () => {
      const old = request.result as OutboxOperation | undefined;
      if (!old || old.accountId !== accountId || old.state !== 'blocked' || !['recitation-correct', 'recitation-delete'].includes(old.resource)) { tx.abort(); return; }
      replacement = { ...old, id: makeId(), baseUpdatedAt, state: 'pending', attempts: 0, lastError: undefined };
      try { offlineOperationSpec(replacement); } catch { tx.abort(); return; }
      store.delete(id); store.add(replacement);
    };
    tx.oncomplete = () => resolve(replacement);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('تعذر استبدال التعديل؛ بقي محفوظًا كما هو'));
  }); } finally { db.close(); }
}
