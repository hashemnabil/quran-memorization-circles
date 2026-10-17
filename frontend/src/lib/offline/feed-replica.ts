/** Account-bound, commit-ordered replica. Transport and identity are injected. */
import { openValue, sealValue } from '../local-encryption';
export type ReplicaRow = { id: string; updatedAt?: string; deletedAt?: string | null; [key: string]: unknown };
type Resource = 'student' | 'circle';
type Meta = { accountId: string; seq?: string; scopeVersion?: string; lastPulledAt: number; cursor?: string };
const DB = 'quran-circles-change-feed';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('rows')) {
        const rows = db.createObjectStore('rows', { keyPath: 'key' });
        rows.createIndex('accountId', 'accountId');
        rows.createIndex('accountResource', ['accountId', 'resource']);
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'accountId' });
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function metadata(accountId: string): Promise<Meta | undefined> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const r = db.transaction('meta').objectStore('meta').get(accountId);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  }); } finally { db.close(); }
}
function eraseRows(store: IDBObjectStore, accountId: string) {
  const r = store.index('accountId').openCursor(IDBKeyRange.only(accountId));
  r.onsuccess = () => { const cursor = r.result; if (cursor) { cursor.delete(); cursor.continue(); } };
}
export async function clearReplica(accountId: string) {
  if (!accountId || typeof indexedDB === 'undefined') return;
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['rows', 'meta'], 'readwrite');
    eraseRows(tx.objectStore('rows'), accountId); tx.objectStore('meta').delete(accountId);
    eraseRows(tx.objectStore('rows'), `${accountId}:snapshot`); tx.objectStore('meta').delete(`${accountId}:snapshot`);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
type Edit = { entity: Resource; id: string; operation: 'UPSERT' | 'DELETE'; data: ReplicaRow | null };
async function write(meta: Meta, edits: Edit[], replace: boolean, active: () => boolean) {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    if (!active()) { reject(new Error('تغيّر الحساب أثناء المزامنة')); return; }
    const tx = db.transaction(['rows', 'meta'], 'readwrite'); const store = tx.objectStore('rows');
    const apply = () => {
      if (!active()) { tx.abort(); return; }
      for (const edit of edits) {
        const key = `${meta.accountId}:${edit.entity}:${edit.id}`;
        if (edit.operation === 'DELETE') store.delete(key);
        else store.put({ key, accountId: meta.accountId, resource: edit.entity, id: edit.id,
          updatedAt: edit.data?.updatedAt || '', deletedAt: edit.data?.deletedAt || null, data: sealValue(meta.accountId, key, edit.data) });
      }
      tx.objectStore('meta').put(meta);
    };
    if (replace) {
      const r = store.index('accountId').openCursor(IDBKeyRange.only(meta.accountId));
      r.onsuccess = () => { const cursor = r.result; if (cursor) { cursor.delete(); cursor.continue(); } else apply(); };
    } else apply();
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || new Error('أُلغيت معاملة المزامنة'));
  }); } finally { db.close(); }
}
export async function readReplica(accountId: string, resource: Resource, includeDeleted = false): Promise<ReplicaRow[]> {
  if (!accountId) return [];
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const r = db.transaction('rows').objectStore('rows').index('accountResource').getAll([accountId, resource]);
    r.onsuccess = () => { try { resolve(r.result.filter(row => includeDeleted || !row.deletedAt).map(row => openValue(row.accountId, row.key, row.data))); } catch (error) { reject(error); } };
    r.onerror = () => reject(r.error);
  }); } finally { db.close(); }
}
export async function protectLegacyReplica(accountId: string) {
  const database = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('rows', 'readwrite'); const store = tx.objectStore('rows');
    const request = store.index('accountId').openCursor(IDBKeyRange.only(accountId));
    request.onsuccess = () => {
      const cursor = request.result; if (!cursor) return;
      try { const row = cursor.value; cursor.update({ ...row, data: sealValue(accountId, row.key, openValue(accountId, row.key, row.data)) }); cursor.continue(); }
      catch (error) { reject(error); tx.abort(); }
    };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || new Error('تعذر تشفير النسخة القديمة؛ لم تُمسح'));
  }); } finally { database.close(); }
}
function sequence(value: unknown): value is string { return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n; }
type Transport = (path: string, params?: Record<string, string | number>) => Promise<any>;
const running = new Map<string, Promise<{ pages: number; rows: number; complete: boolean }>>();
export function pullReplica(accountId: string, get: Transport, currentAccount: () => string, purgeQueries: () => Promise<void>, maxPages = 25) {
  const existing = running.get(accountId); if (existing) return existing;
  const run = pull(accountId, get, currentAccount, purgeQueries, maxPages).finally(() => running.delete(accountId));
  running.set(accountId, run); return run;
}
async function pull(accountId: string, get: Transport, currentAccount: () => string, purgeQueries: () => Promise<void>, maxPages: number) {
  const active = () => currentAccount() === accountId;
  if (!accountId || !active()) throw new Error('يلزم الحساب الحالي للمزامنة');
  const checked = async (path: string, params?: Record<string, string | number>) => {
    if (!active()) throw new Error('تغيّر الحساب أثناء المزامنة');
    const data = await get(path, params);
    if (!active() || data?.version !== 1 || data?.accountId !== accountId) throw new Error('الحزمة لا تخص الحساب الحالي');
    return data;
  };
  const scope = await checked('/sync/scope');
  if (typeof scope.scopeVersion !== 'string' || !/^[a-f0-9]{64}$/.test(scope.scopeVersion)) throw new Error('إصدار صلاحيات غير صالح');
  let meta = await metadata(accountId); const bound = Math.max(1, Math.min(100, Math.floor(maxPages) || 1));
  let pages = 0, rows = 0;
  if (!meta?.scopeVersion || meta.scopeVersion !== scope.scopeVersion || !sequence(meta.seq)) {
    // Purge reads after scope changes; pending writes are never deleted here.
    const stagingId = `${accountId}:snapshot`;
    const stage = await metadata(stagingId);
    const resumable = stage?.scopeVersion === scope.scopeVersion && sequence(stage?.seq);
    if (!resumable) { await clearReplica(accountId); if (!active()) throw new Error('تغيّر الحساب'); await purgeQueries(); }
    let cursor = resumable ? stage?.cursor : undefined;
    let fence = resumable ? stage?.seq : undefined;
    const cursors = new Set<string>(); let complete = false;
    while (pages < bound) {
      const page = await checked('/sync/snapshot', { limit: 200, ...(cursor ? { cursor } : {}) });
      if (page.scopeVersion !== scope.scopeVersion || !sequence(page.asOfSeq) || !Array.isArray(page.students) || !Array.isArray(page.circles)) throw new Error('تغيّرت الصلاحيات أثناء التنزيل');
      fence ??= page.asOfSeq;
      const edits: Edit[] = [];
      for (const [entity, records] of [['student', page.students], ['circle', page.circles]] as const) for (const data of records) {
        if (typeof data?.id !== 'string' || !data.id) throw new Error('سجل محلي غير صالح');
        edits.push({ entity, id: data.id, operation: 'UPSERT', data });
      }
      await write({ accountId: stagingId, seq: fence, scopeVersion: scope.scopeVersion, cursor: page.nextCursor || undefined, lastPulledAt: Date.now() }, edits, false, active);
      pages++; rows += page.students.length + page.circles.length;
      if (page.complete === true) { complete = true; break; }
      if (typeof page.nextCursor !== 'string' || !page.nextCursor || cursors.has(page.nextCursor)) throw new Error('مؤشر تنزيل مكرر');
      cursor = page.nextCursor; cursors.add(page.nextCursor);
    }
    if (!complete) return { pages, rows, complete: false };
    const finalScope = await checked('/sync/scope');
    if (finalScope.scopeVersion !== scope.scopeVersion) throw new Error('تغيّرت صلاحيات التنزيل');
    meta = { accountId, seq: fence!, scopeVersion: scope.scopeVersion, lastPulledAt: Date.now() };
    const students = await readReplica(stagingId, 'student');
    const circles = await readReplica(stagingId, 'circle');
    const edits: Edit[] = [...students.map(data => ({ entity: 'student' as const, id: data.id, operation: 'UPSERT' as const, data })), ...circles.map(data => ({ entity: 'circle' as const, id: data.id, operation: 'UPSERT' as const, data }))];
    await write(meta, edits, true, active);
    await clearReplica(stagingId);
  }
  // Snapshot's first fence is retained; replay everything committed after it.
  let complete = false;
  while (pages < bound) {
    const page = await checked('/sync/changes', { since: meta.seq!, limit: 200 });
    if (!sequence(page.nextSeq) || BigInt(page.nextSeq) < BigInt(meta.seq!) || !Array.isArray(page.changes) || page.changes.length > 200 || typeof page.hasMore !== 'boolean' || (page.hasMore && page.nextSeq === meta.seq)) throw new Error('مؤشر تغييرات غير صالح');
    const edits: Edit[] = []; let previous = BigInt(meta.seq!);
    for (const change of page.changes) {
      if (!sequence(change.seq) || BigInt(change.seq) <= previous || BigInt(change.seq) > BigInt(page.nextSeq) || !['student', 'circle'].includes(change.entity) || !['UPSERT', 'DELETE'].includes(change.operation) || typeof change.id !== 'string' || (change.operation === 'UPSERT' && change.data?.id !== change.id)) throw new Error('حزمة تغييرات غير صالحة');
      previous = BigInt(change.seq); edits.push(change);
    }
    const finalScope = await checked('/sync/scope');
    if (finalScope.scopeVersion !== scope.scopeVersion) { await clearReplica(accountId); if (active()) await purgeQueries(); throw new Error('تغيّرت الصلاحيات؛ يلزم إعادة التنزيل'); }
    meta = { ...meta, seq: page.nextSeq, lastPulledAt: Date.now() };
    await write(meta, edits, false, active); pages++; rows += edits.length;
    complete = page.hasMore === false; if (complete) break;
  }
  return { pages, rows, complete };
}
