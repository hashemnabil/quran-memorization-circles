import { api } from '@/lib/api';

export type OfflineResource = 'student' | 'circle';
type ChangeRow = {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  [key: string]: unknown;
};
type ChangePage = {
  accountId: string;
  students: ChangeRow[];
  circles: ChangeRow[];
  nextStudentCursor: string | null;
  nextCircleCursor: string | null;
  hasMoreStudents: boolean;
  hasMoreCircles: boolean;
};
type StoredRow = {
  key: string;
  accountId: string;
  resource: OfflineResource;
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  data: ChangeRow;
};
type SyncMeta = {
  accountId: string;
  studentCursor: string | null;
  circleCursor: string | null;
  lastPulledAt: number;
};

const DB_NAME = 'quran-circles-change-feed';
const DB_VERSION = 1;
const ROWS = 'rows';
const META = 'meta';

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('التخزين المحلي غير متاح على هذا الجهاز'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ROWS)) {
        const rows = db.createObjectStore(ROWS, { keyPath: 'key' });
        rows.createIndex('accountId', 'accountId', { unique: false });
        rows.createIndex('accountResource', ['accountId', 'resource'], { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'accountId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذر فتح قاعدة بيانات المزامنة'));
  });
}

function rowKey(accountId: string, resource: OfflineResource, id: string) {
  return `${accountId}:${resource}:${id}`;
}

async function commitPage(accountId: string, page: ChangePage, previous: SyncMeta): Promise<SyncMeta> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([ROWS, META], 'readwrite');
      const rows = tx.objectStore(ROWS);
      for (const item of page.students) {
        const stored: StoredRow = {
          key: rowKey(accountId, 'student', item.id), accountId, resource: 'student',
          id: item.id, updatedAt: item.updatedAt, deletedAt: item.deletedAt, data: item,
        };
        rows.put(stored);
      }
      for (const item of page.circles) {
        const stored: StoredRow = {
          key: rowKey(accountId, 'circle', item.id), accountId, resource: 'circle',
          id: item.id, updatedAt: item.updatedAt, deletedAt: item.deletedAt, data: item,
        };
        rows.put(stored);
      }
      const next: SyncMeta = {
        accountId,
        studentCursor: page.nextStudentCursor ?? previous.studentCursor,
        circleCursor: page.nextCircleCursor ?? previous.circleCursor,
        lastPulledAt: Date.now(),
      };
      tx.objectStore(META).put(next);
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error ?? new Error('تعذر حفظ تغييرات المزامنة'));
      tx.onabort = () => reject(tx.error ?? new Error('أُلغيت معاملة حفظ تغييرات المزامنة'));
    });
  } finally {
    db.close();
  }
}

async function readMeta(accountId: string): Promise<SyncMeta> {
  const db = await openDb();
  try {
    const existing = await new Promise<SyncMeta | undefined>((resolve, reject) => {
      const request = db.transaction(META, 'readonly').objectStore(META).get(accountId);
      request.onsuccess = () => resolve(request.result as SyncMeta | undefined);
      request.onerror = () => reject(request.error ?? new Error('تعذر قراءة مؤشر المزامنة'));
    });
    return existing ?? { accountId, studentCursor: null, circleCursor: null, lastPulledAt: 0 };
  } finally {
    db.close();
  }
}

/**
 * Pulls a bounded number of pages and commits each page with its cursors in one
 * IndexedDB transaction. Repeated rows are safe upserts; cursors never advance
 * unless the corresponding rows have been durably written.
 */
export async function pullOfflineChanges(accountId: string, maxPages = 25): Promise<{ pages: number; rows: number; complete: boolean }> {
  if (!accountId.trim()) throw new Error('يلزم تسجيل الدخول قبل المزامنة');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { pages: 0, rows: 0, complete: false };
  }
  let meta = await readMeta(accountId);
  let pages = 0;
  let rows = 0;
  let complete = false;

  while (pages < Math.max(1, Math.min(100, Math.floor(maxPages)))) {
    const params: Record<string, string | number> = { limit: 200 };
    if (meta.studentCursor) params.studentCursor = meta.studentCursor;
    if (meta.circleCursor) params.circleCursor = meta.circleCursor;
    const { data } = await api.get<ChangePage>('/offline-sync/changes', { params });
    if (data.accountId !== accountId) throw new Error('الحزمة المستلمة لا تخص الحساب الحالي');
    meta = await commitPage(accountId, data, meta);
    pages += 1;
    rows += data.students.length + data.circles.length;
    complete = !data.hasMoreStudents && !data.hasMoreCircles;
    if (complete || (typeof navigator !== 'undefined' && !navigator.onLine)) break;
  }
  return { pages, rows, complete };
}

/** Read the latest local replica; deleted rows are hidden unless explicitly requested. */
export async function listOfflineSnapshot(
  accountId: string,
  resource: OfflineResource,
  includeDeleted = false,
): Promise<ChangeRow[]> {
  if (!accountId.trim()) return [];
  const db = await openDb();
  try {
    const result = await new Promise<StoredRow[]>((resolve, reject) => {
      const request = db.transaction(ROWS, 'readonly').objectStore(ROWS).index('accountResource').getAll([accountId, resource]);
      request.onsuccess = () => resolve(request.result as StoredRow[]);
      request.onerror = () => reject(request.error ?? new Error('تعذر قراءة النسخة المحلية'));
    });
    return result
      .filter((row) => includeDeleted || row.deletedAt === null)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
      .map((row) => row.data);
  } finally {
    db.close();
  }
}

export async function clearOfflineReplica(accountId: string): Promise<void> {
  if (!accountId || typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ROWS, META], 'readwrite');
      const index = tx.objectStore(ROWS).index('accountId');
      const request = index.openCursor(IDBKeyRange.only(accountId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      tx.objectStore(META).delete(accountId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('تعذر مسح النسخة المحلية'));
    });
  } finally {
    db.close();
  }
}
