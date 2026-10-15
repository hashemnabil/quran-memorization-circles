import { db, entityTables, type EntityTable, type LocalRow, type QueuedWrite } from './db';
import { startSyncProgress, reportSyncProgress, finishSyncProgress } from './sync-progress';

type Transport = (method: string, path: string, data?: any) => Promise<any>;
let transport: Transport;
let currentAccount: () => string = () => '';
let running: Promise<void> | undefined;
let pulling: { account: string; promise: Promise<void> } | undefined;
let preloadSections: ((account: string) => Promise<void>) | undefined;
export function configureOffline(send: Transport, account: () => string, preload?: (account: string) => Promise<void>) { transport = send; currentAccount = account; preloadSections = preload; }
export function accountId() { const id = currentAccount(); if (!id) throw new Error('يلزم تسجيل الدخول قبل استخدام البيانات المحلية'); return id; }
export async function get(table: EntityTable): Promise<LocalRow[]> {
  return db.table(table).where('accountId').equals(accountId()).filter((row: LocalRow) => !row.pendingDelete).toArray();
}
export async function save(table: EntityTable, data: Record<string, any>, action = 'create') {
  const account = accountId(); const id = data.id || crypto.randomUUID();
  if (table === 'attendance' && action === 'create' && Array.isArray(data.entries)) {
    const opId = crypto.randomUUID(); const updatedAt = new Date().toISOString();
    await db.transaction('rw', db.attendance, db.queue, async () => {
      for (const entry of data.entries) {
        const existing = await db.attendance.where('accountId').equals(account).filter((row) => row.studentId === entry.studentId && row.circleId === data.circleId && String(row.date).slice(0, 10) === data.date).first();
        await db.attendance.put({ ...existing, ...entry, id: existing?.id || crypto.randomUUID(), circleId: data.circleId, date: data.date, accountId: account, synced: 0, updatedAt, _opId: opId });
      }
      await db.queue.add({ accountId: account, opId, table, action, entityId: id, data, createdAt: updatedAt });
    });
    window.dispatchEvent(new Event('halaqat:changed'));
    void syncAll().catch(() => undefined);
    return { id, accountId: account, synced: 0, updatedAt, message: 'تم حفظ كشف الحضور محليًا' } as LocalRow;
  }
  const existing = await db.table(table).get([account, id]);
  const row: LocalRow = { createdAt: new Date().toISOString(), ...(table === 'behaviors' ? { author: { id: account, fullName: 'محفوظ محليًا' } } : {}), ...existing, ...data, id, accountId: account, synced: 0, updatedAt: new Date().toISOString() };
  if (table === 'teachers') {
    row.user = { ...existing?.user, ...(row.user || {}) };
    for (const field of ['fullName', 'username', 'email', 'phone', 'avatarUrl', 'jobTitle', 'specialization']) if (data[field] !== undefined) row.user[field] = data[field];
    row.circleRoles ||= []; row.isActive ??= true;
  }
  delete row.password;
  if (table === 'teacherDuties' && Array.isArray(data.teacherUserIds)) {
    const teachers = await get('dutyTeachers');
    row.assignments = data.teacherUserIds.map((teacherUserId: string) => ({ teacherUserId, teacherName: teachers.find((teacher) => teacher.id === teacherUserId)?.fullName || 'محفّظ' }));
  }
  if (table === 'students') {
    row.status ??= 'ACTIVE'; row.gender ??= 'MALE'; row.memorizedParts ??= 0; row.totalPoints ??= 0;
    row.code ||= `LOCAL-${id.slice(0, 8)}`; row.enrollmentDate ||= row.createdAt;
    if (data.circleId !== undefined) row.circle = data.circleId ? await db.circles.get([account, data.circleId]) || null : null;
  }
  if (table === 'circles') { row.teachers ||= []; row.students ||= []; row.studentsCount ??= 0; row.isActive ??= true; }
  if (table === 'courses') { row.students ||= []; row.studentsCount ??= 0; row.isActive ??= true; }
  if (table === 'recitations' && action !== 'delete') {
    const student = await db.students.get([account, row.studentId]);
    row.circleId ||= student?.circleId || student?.circle?.id;
    row.student = student ? { id: student.id, fullName: student.fullName, code: student.code } : row.student;
    const surahs = (await db.meta.get(`${account}:reference:/recitations/surahs`))?.value || [];
    const from = surahs.findIndex((surah: any) => surah.name === row.fromSurah);
    const to = surahs.findIndex((surah: any) => surah.name === row.toSurah);
    if (data.versesCount === undefined && from >= 0 && to >= from) row.versesCount = surahs.slice(from, to + 1).reduce((sum: number, surah: any, index: number) => sum + (index === to - from ? row.toAyah : surah.ayahs) - (index === 0 ? row.fromAyah - 1 : 0), 0);
    row.points = Math.round(Math.max(0, Number(row.versesCount || 0) - Number(row.mistakes || 0) - Number(row.warnings || 0) * 0.25) * 100) / 100;
  }
  await db.transaction('rw', db.table(table), db.queue, async () => {
    await db.table(table).put(row);
    await db.queue.add({ accountId: account, opId: crypto.randomUUID(), table, action, entityId: id, data, createdAt: row.updatedAt });
  });
  window.dispatchEvent(new Event('halaqat:changed'));
  void syncAll().catch(() => undefined);
  return row;
}
export function update(table: EntityTable, id: string, data: Record<string, any>) { return save(table, { ...data, id }, 'update'); }
export function remove(table: EntityTable, id: string) { return save(table, { id, pendingDelete: 1 }, 'delete'); }
export async function mergeRows(table: EntityTable, rows: Record<string, any>[], account = accountId()) {
  await db.transaction('rw', db.table(table), async () => {
    for (const row of rows) {
      if (typeof row.id !== 'string') continue;
      const existing = await db.table(table).get([account, row.id]);
      // A pull must never overwrite a local edit or resurrect a local deletion.
      if (existing?.synced === 0) continue;
      await db.table(table).put({ ...existing, ...row, accountId: account, synced: 1, updatedAt: row.updatedAt || new Date().toISOString() });
    }
  });
}
export function pullAll(): Promise<void> {
  const account = accountId();
  if (pulling?.account === account) return pulling.promise;
  const promise = downloadAll().finally(() => { if (pulling?.promise === promise) pulling = undefined; });
  pulling = { account, promise };
  return promise;
}
async function downloadAll() {
  const account = accountId();
  let failure: unknown;
  let completed = 0;
  for (const table of entityTables) {
    if (!navigator.onLine || currentAccount() !== account) return;
    try {
    let page = 1;
    const received = new Set<string>();
    for (;;) {
      const result = await transport('get', `/sync-all?table=${table}&page=${page}`);
      if (currentAccount() !== account) return;
      await mergeRows(table, result.data, account);
      for (const [path, data] of Object.entries(result.references || {})) await db.meta.put({ key: `${account}:reference:${path}`, value: data });
      for (const row of result.data) received.add(row.id);
      if (table === 'students' && result.data.some((row: any) => row.photoUrl)) {
        const { cachedImage } = await import('./offline-images');
        for (let offset = 0; offset < result.data.length; offset += 5) {
          await Promise.all(result.data.slice(offset, offset + 5).filter((row: any) => row.photoUrl).map((row: any) => cachedImage(row.photoUrl, account).catch(() => undefined)));
        }
      }
      if (!result.meta?.hasNextPage) break;
      page++;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    // Full snapshots reconcile deletions and scope changes; dirty edits remain queued.
    await db.table(table).where('accountId').equals(account).filter((row: LocalRow) => row.synced === 1 && !received.has(row.id)).delete();
    } catch (error) {
      // One unavailable table must not prevent the remaining tables downloading.
      failure ||= error;
    }
    reportSyncProgress(account, 10 + (++completed / entityTables.length) * 65);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (currentAccount() !== account) return;
  try { await preloadSections?.(account); } catch (error) { failure ||= error; }
  if (failure) throw failure;
  await db.meta.put({ key: `${account}:downloadedAt`, value: new Date().toISOString() });
  window.dispatchEvent(new Event('halaqat:changed'));
}
export function syncAll(): Promise<void> {
  if (running) return running;
  running = synchronize().finally(() => { running = undefined; window.dispatchEvent(new Event('halaqat:changed')); });
  return running;
}
async function synchronize() {
  if (!navigator.onLine || !currentAccount() || !transport) return;
  const account = accountId();
  const pending = await db.queue.where('accountId').equals(account).sortBy('id');
  // Ordered batches preserve dependent operations. Server receipts make retries safe.
  for (let offset = 0; offset < pending.length; offset += 50) {
    const batch = pending.slice(offset, offset + 50);
    const result = await transport('post', '/sync-all', { operations: batch });
    if (currentAccount() !== account) return;
    if (!Array.isArray(result?.outcomes) || new Set(result.outcomes.map((row: any) => row.opId)).size !== result.outcomes.length || result.outcomes.some((row: any) => !batch.some((item) => item.opId === row.opId))) throw new Error('استجابة مزامنة غير صالحة؛ بقيت العمليات محفوظة');
    for (const outcome of result.outcomes) {
      const operation = batch.find((item) => item.opId === outcome.opId);
      if (!operation) continue;
      if (outcome.status !== 'applied') {
        await db.queue.update(operation.id!, { error: outcome.message || 'تعذر تطبيق العملية' });
        throw new Error(outcome.message || 'تحتاج عملية المزامنة إلى مراجعة');
      }
      await acknowledge(operation, outcome.data);
    }
    if (result.outcomes.length !== batch.length) throw new Error('لم يؤكد الخادم جميع العمليات؛ بقيت البقية محفوظة');
  }
  await db.meta.put({ key: `${account}:lastSync`, value: new Date().toISOString() });
}
async function acknowledge(operation: QueuedWrite, server: any) {
  const table = db.table(operation.table);
  await db.transaction('rw', [...entityTables.map((name) => db.table(name)), db.queue, db.meta], async () => {
    await db.queue.delete(operation.id!);
    if (operation.table === 'attendance' && operation.action === 'create') {
      await db.attendance.where('accountId').equals(operation.accountId).filter((row) => row._opId === operation.opId).delete();
      for (const row of server?.rows || []) {
        const draft = await db.attendance.where('accountId').equals(operation.accountId).filter((item) => item.synced === 0 && item.studentId === row.studentId && item.circleId === row.circleId && String(item.date).slice(0, 10) === String(row.date).slice(0, 10)).first();
        if (!draft) await db.attendance.put({ ...row, accountId: operation.accountId, synced: 1 });
      }
      return;
    }
    const later = await db.queue.where('accountId').equals(operation.accountId).filter((item) => item.table === operation.table && item.entityId === operation.entityId).count();
    if (later) return;
    const mapped = (await db.meta.get(`${operation.accountId}:id:${operation.entityId}`))?.value || operation.entityId;
    const key = [operation.accountId, mapped];
    if (operation.action === 'delete') { await table.delete(key); return; }
    const local = await table.get(key);
    if (!local) return;
    const canonicalId = server?.id || operation.entityId;
    if (canonicalId !== operation.entityId) {
      await table.delete(key);
      await db.meta.put({ key: `${operation.accountId}:id:${operation.entityId}`, value: canonicalId });
      for (const name of entityTables) await db.table(name).where('accountId').equals(operation.accountId).modify((row: any) => {
        for (const field of ['studentId', 'circleId', 'teacherId']) if (row[field] === operation.entityId) row[field] = canonicalId;
      });
    }
    await table.put({ ...local, ...server, id: canonicalId, accountId: operation.accountId, synced: 1 });
  });
}
export async function initOffline() {
  await db.open();
  if (typeof navigator.storage?.persist === 'function') void navigator.storage.persist().catch(() => false);
  if (navigator.onLine && currentAccount()) await refreshOffline({ forceDownload: true });
}
export async function refreshOffline(options: { forceDownload?: boolean } = {}) {
  if (!navigator.onLine || !currentAccount()) return;
  const account = accountId();
  const downloadedAt = (await db.meta.get(`${account}:downloadedAt`))?.value;
  // Frequent ticks send edits; expensive full snapshots refresh at most every five minutes.
  const download = options.forceDownload || !downloadedAt || Date.now() - Date.parse(downloadedAt) >= 5 * 60 * 1000;
  const hasWrites = await db.queue.where('accountId').equals(account).count() > 0;
  if (!download && !hasWrites) return;
  startSyncProgress(account);
  let failure: unknown;
  try {
    try { await syncAll(); } catch (error) { failure = error; }
    reportSyncProgress(account, download ? 10 : 99);
    // Keep downloading even when a queued mutation needs review; dirty rows are protected.
    if (download && currentAccount() === account) await pullAll();
    if (failure) throw failure;
    finishSyncProgress(account, true);
  } catch (error) { finishSyncProgress(account, false); throw error; }
}
export async function exportLocal() {
  const account = accountId();
  const snapshot = await db.transaction('r', [...entityTables.map((table) => db.table(table)), db.queue, db.meta, db.responses], async () => {
    const tables: Record<string, any[]> = {};
    for (const table of entityTables) tables[table] = await db.table(table).where('accountId').equals(account).toArray();
    return { version: 1, accountId: account, exportedAt: new Date().toISOString(), tables,
      queue: await db.queue.where('accountId').equals(account).toArray(),
      meta: await db.meta.filter((row) => row.key.startsWith(`${account}:`)).toArray(),
      responses: await db.responses.where('accountId').equals(account).toArray() };
  });
  for (const response of snapshot.responses) if (response.data instanceof Blob) {
    const bytes = new Uint8Array(await response.data.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    response.data = { _backupBlob: true, type: response.data.type, base64: btoa(binary) };
  }
  return snapshot;
}
export async function importLocal(value: any) {
  const account = accountId();
  if (value?.version !== 1 || value.accountId !== account || !value.tables || !Array.isArray(value.queue)) throw new Error('ملف النسخة الاحتياطية غير صالح أو يخص حسابًا آخر');
  for (const table of ['mediaPlans', 'teacherDuties', 'dutyTeachers']) value.tables[table] ??= [];
  for (const table of entityTables) {
    if (!Array.isArray(value.tables[table]) || value.tables[table].some((row: any) => typeof row.id !== 'string' || row.accountId !== account)) throw new Error('سجلات غير صالحة');
  }
  if (value.queue.some((row: any) => row.accountId !== account || typeof row.opId !== 'string' || !entityTables.includes(row.table))) throw new Error('قائمة المزامنة غير صالحة');
  const meta = value.meta || []; const responses = value.responses || [];
  if (!Array.isArray(meta) || meta.some((row: any) => typeof row.key !== 'string' || !row.key.startsWith(`${account}:`)) || !Array.isArray(responses) || responses.some((row: any) => row.accountId !== account || typeof row.key !== 'string')) throw new Error('بيانات النسخة الاحتياطية غير صالحة');
  const decoded = responses.map((row: any) => ({ ...row, data: row.data?._backupBlob === true ? new Blob([Uint8Array.from(atob(row.data.base64), (char) => char.charCodeAt(0))], { type: row.data.type }) : row.data }));
  await db.transaction('rw', [...entityTables.map((table) => db.table(table)), db.queue, db.meta, db.responses], async () => {
    // Merge backups; never replace newer unsynced work.
    for (const table of entityTables) for (const row of value.tables[table]) {
      const current = await db.table(table).get([account, row.id]);
      if (!current || current.updatedAt < row.updatedAt) await db.table(table).put(row);
    }
    for (const operation of value.queue) if (!(await db.queue.where('opId').equals(operation.opId).count())) {
      const { id: _id, ...rest } = operation; await db.queue.add(rest);
    }
    for (const row of meta) if (!(await db.meta.get(row.key))) await db.meta.put(row);
    for (const row of decoded) if (!(await db.responses.get(row.key))) await db.responses.put(row);
  });
  window.dispatchEvent(new Event('halaqat:changed'));
}
export async function clearLocal() {
  const account = accountId();
  if (await db.queue.where('accountId').equals(account).count()) throw new Error('صدّر أو زامن العمليات المعلقة قبل مسح البيانات');
  await db.transaction('rw', [...entityTables.map((table) => db.table(table)), db.responses, db.meta], async () => {
    for (const table of entityTables) await db.table(table).where('accountId').equals(account).delete();
    await db.responses.where('accountId').equals(account).delete();
    await db.meta.filter((row) => row.key.startsWith(`${account}:`)).delete();
  });
}
