/** Durable offline outbox shared by the web app and Capacitor WebView.
 * This is infrastructure only: do not replay arbitrary API mutations. Queue
 * only endpoints with server-side idempotency and a domain-specific conflict policy.
 */
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
  if (!operation.path.startsWith('/')) throw new Error('مسار الطلب يجب أن يبدأ بـ /');
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
