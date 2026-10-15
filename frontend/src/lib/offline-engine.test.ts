import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import { db } from './db';
import { configureOffline, save, get, update, remove, mergeRows, syncAll, initOffline, pullAll, refreshOffline, noteRemoteRevision, exportLocal, importLocal, clearLocal } from './offline-engine';
import { entityTables } from './db';
import { getSyncProgress } from './sync-progress';

let account = 'account-a'; let online = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(async () => {
  online = false; account = 'account-a';
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('network unavailable'); }, () => account);
});
after(() => db.close());

test('opening online downloads every table without a manual action and coalesces concurrent pulls', async () => {
  const requested: string[] = [];
  configureOffline(async (_method, path) => {
    if (path === '/sync-all/watermark') return { cursor: '0' };
    const table = new URL(path, 'https://test.local').searchParams.get('table')!;
    requested.push(table);
    return { data: [{ id: `${table}-1` }], meta: { hasNextPage: false } };
  }, () => account);
  online = true;
  await initOffline();
  assert.deepEqual(requested, [...entityTables]);
  assert.ok(await db.meta.get(`${account}:downloadedAt`));
  requested.length = 0;
  await Promise.all([pullAll(true), pullAll(true)]);
  assert.deepEqual(requested, [...entityTables]);
});

test('frequent automatic ticks do not redownload fresh snapshots; queued writes still sync immediately', async () => {
  await save('students', { id: 's1', fullName: 'local' });
  await db.meta.put({ key: `${account}:downloadedAt`, value: new Date().toISOString() });
  const methods: string[] = [];
  configureOffline(async (method, _path, body) => {
    if (_path === '/sync-all/watermark') return { cursor: '0' };
    methods.push(method);
    return method === 'post'
      ? { outcomes: body.operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: { id: op.entityId } })) }
      : { data: [], meta: { hasNextPage: false } };
  }, () => account);
  online = true;
  await refreshOffline();
  await refreshOffline();
  assert.deepEqual(methods, ['post']);
  assert.equal(await db.queue.count(), 0);
  await db.meta.put({ key: `${account}:downloadedAt`, value: new Date(Date.now() - 6 * 60 * 1000).toISOString() });
  await refreshOffline();
  assert.equal(methods.filter(method => method === 'get').length, 0);
  await noteRemoteRevision('server-change-1');
  await refreshOffline();
  assert.equal(methods.filter(method => method === 'get').length, entityTables.length);
  await noteRemoteRevision('server-change-1');
  await refreshOffline();
  assert.equal(methods.filter(method => method === 'get').length, entityTables.length);
  assert.equal((await db.meta.get(`${account}:downloadedRevision`))?.value, 'server-change-1');
});

test('progress advances monotonically and reaches 100 only after a successful complete download', async () => {
  const values: number[] = [];
  const listener = () => values.push(getSyncProgress().percent);
  window.addEventListener('halaqat:sync-progress', listener);
  try {
    configureOffline(async () => ({ data: [], meta: { hasNextPage: false } }), () => account);
    online = true;
    await initOffline();
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 100);
    assert.ok(values.some(value => value > 10 && value < 100));
    assert.deepEqual(values, [...values].sort((a, b) => a - b));
    configureOffline(async () => { throw new Error('interrupted'); }, () => account);
    await assert.rejects(refreshOffline({ forceDownload: true }), /interrupted/);
    assert.equal(getSyncProgress().active, false);
    assert.ok(getSyncProgress().percent < 100);
  } finally { window.removeEventListener('halaqat:sync-progress', listener); }
});

test('a change received during download remains dirty and is downloaded on the next refresh', async () => {
  online = true;
  await noteRemoteRevision('revision-1');
  let calls = 0;
  configureOffline(async (_method, path) => {
    if (path === '/sync-all/watermark') return { cursor: calls ? '2' : '0' };
    if (path.startsWith('/sync-all/delta')) { calls++; return { tables: {}, changedEntities: [], cursor: '2', hasMore: false }; }
    if (++calls === 1) await noteRemoteRevision('revision-2');
    return { data: [], meta: { hasNextPage: false } };
  }, () => account);
  await refreshOffline();
  assert.equal((await db.meta.get(`${account}:downloadedRevision`))?.value, 'revision-1');
  await refreshOffline();
  assert.equal(calls, entityTables.length + 1);
  assert.equal((await db.meta.get(`${account}:downloadedRevision`))?.value, 'revision-2');
  await refreshOffline();
  assert.equal(calls, entityTables.length + 1);
});

test('automatic refresh downloads other data despite a rejected write or unavailable table and retries later', async () => {
  await save('students', { id: 's1', fullName: 'local edit' });
  let unavailable = true;
  configureOffline(async (method, path, body) => {
    if (method === 'post') return { outcomes: body.operations.map((op: any) => ({ opId: op.opId, status: 'rejected', message: 'review needed' })) };
    const table = new URL(path, 'https://test.local').searchParams.get('table');
    if (table === 'teachers' && unavailable) throw new Error('temporary outage');
    return { data: [{ id: table === 'students' ? 's1' : `${table}-1`, fullName: 'server' }], meta: { hasNextPage: false } };
  }, () => account);
  online = true;
  await assert.rejects(refreshOffline(), /temporary outage/);
  assert.equal((await get('students'))[0].fullName, 'local edit');
  assert.equal((await get('teacherDuties')).length, 1);
  assert.equal(await db.queue.count(), 1);
  assert.equal(await db.meta.get(`${account}:downloadedAt`), undefined);
  unavailable = false;
  await assert.rejects(refreshOffline(), /review needed/);
  assert.equal((await get('teachers')).length, 1);
  assert.ok(await db.meta.get(`${account}:downloadedAt`));
});
test('writes are durable before network and account-scoped', async () => {
  await save('students', { id: 's1', fullName: 'طالب' });
  assert.equal((await get('students'))[0].synced, 0);
  assert.equal(await db.queue.count(), 1);
  account = 'account-b'; assert.deepEqual(await get('students'), []);
});

test('reopening, reconnecting and duplicate events share a silent check without resetting progress when nothing changed', async () => {
  await db.meta.put({ key: `${account}:downloadedAt`, value: new Date().toISOString() });
  await db.meta.put({ key: `${account}:deltaCursor`, value: '10' });
  await noteRemoteRevision('10');
  const paths: string[] = [], progress: number[] = [];
  configureOffline(async (_method, path) => { paths.push(path); return { cursor: '10' }; }, () => account);
  const listener = () => progress.push(getSyncProgress().percent);
  window.addEventListener('halaqat:sync-progress', listener);
  online = true;
  try {
    await Promise.all([initOffline(), refreshOffline({ checkDelta: true }), refreshOffline({ checkDelta: true })]);
    assert.deepEqual(paths, ['/sync-all/watermark']);
    await refreshOffline();
    assert.deepEqual(paths, ['/sync-all/watermark']);
    assert.deepEqual(progress, []);
    assert.equal((await db.meta.get(`${account}:downloadedRevision`))?.value, '10');
    await noteRemoteRevision('9');
    assert.equal((await db.meta.get(`${account}:remoteRevision`))?.value, '10');
  } finally { window.removeEventListener('halaqat:sync-progress', listener); }
});

test('delta updates only changed rows, removes synced tombstones and preserves dirty work', async () => {
  await mergeRows('students', [{ id: 'old', fullName: 'unchanged' }, { id: 'changed', fullName: 'before' }, { id: 'deleted' }]);
  await save('students', { id: 'draft', fullName: 'unsent' });
  await db.meta.put({ key: `${account}:deltaCursor`, value: '10' });
  const paths: string[] = [];
  configureOffline(async (_method, path) => {
    paths.push(path);
    return { cursor: '11', hasMore: false, changedEntities: ['students'], tables: { students: { data: [{ id: 'changed', fullName: 'after' }], visibleIds: ['old', 'changed'] } } };
  }, () => account);
  online = true; await pullAll();
  assert.deepEqual(paths, ['/sync-all/delta?since=10']);
  const rows = await get('students');
  assert.equal(rows.find(row => row.id === 'old')?.fullName, 'unchanged');
  assert.equal(rows.find(row => row.id === 'changed')?.fullName, 'after');
  assert.equal(rows.find(row => row.id === 'draft')?.fullName, 'unsent');
  assert.equal(rows.some(row => row.id === 'deleted'), false);
  assert.equal((await db.meta.get(`${account}:deltaCursor`))?.value, '11');
});

test('a failed section patch does not advance the delta cursor and the same changes replay safely', async () => {
  await db.meta.put({ key: `${account}:deltaCursor`, value: '10' });
  let fail = true;
  const paths: string[] = [];
  configureOffline(async (_method, path) => {
    paths.push(path);
    return { cursor: '11', hasMore: false, tables: {}, changedEntities: ['support_tickets'] };
  }, () => account, async (_account, entities) => { assert.deepEqual(entities, ['support_tickets']); if (fail) throw new Error('interrupted'); });
  online = true;
  await assert.rejects(pullAll(), /interrupted/);
  assert.equal((await db.meta.get(`${account}:deltaCursor`))?.value, '10');
  fail = false; await pullAll();
  assert.deepEqual(paths, ['/sync-all/delta?since=10', '/sync-all/delta?since=10']);
});
test('pull cannot overwrite pending edits or resurrect pending deletes', async () => {
  await save('students', { id: 's1', fullName: 'محلي' });
  await mergeRows('students', [{ id: 's1', fullName: 'خادم' }]);
  assert.equal((await get('students'))[0].fullName, 'محلي');
  await remove('students', 's1');
  await mergeRows('students', [{ id: 's1', fullName: 'خادم' }]);
  assert.deepEqual(await get('students'), []);
  assert.equal(await db.queue.count(), 2);
});
test('lost network response preserves operation id for retry', async () => {
  await save('recitations', { studentId: 's1' });
  const original = (await db.queue.toArray())[0]; online = true;
  await assert.rejects(syncAll(), /network unavailable/);
  assert.equal((await db.queue.toArray())[0].opId, original.opId);
});
test('server acknowledgement does not erase a newer concurrent edit', async () => {
  await save('students', { id: 's1', fullName: 'first' });
  let release!: (value: any) => void;
  configureOffline(async (_method, _path, body) => new Promise((resolve) => { release = () => resolve({ outcomes: [{ opId: body.operations[0].opId, status: 'applied', data: { id: 's1', fullName: 'first' } }] }); }), () => account);
  online = true; const run = syncAll();
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await update('students', 's1', { fullName: 'second' });
  release(undefined); await run;
  assert.equal((await get('students'))[0].fullName, 'second');
  assert.equal((await get('students'))[0].synced, 0);
  assert.equal(await db.queue.count(), 1);
});
test('backup round-trip preserves queue and rejects another account', async () => {
  await save('students', { id: 's1', fullName: 'طالب' });
  const backup = await exportLocal();
  await assert.rejects(clearLocal(), /المعلقة/);
  await importLocal(backup); assert.equal(await db.queue.count(), 1);
  account = 'account-b'; await assert.rejects(importLocal(backup), /حساب/);
});
test('attendance sheet immediately contributes individual local records', async () => {
  await save('attendance', { circleId: 'c1', date: '2026-10-15', entries: [{ studentId: 's1', status: 'PRESENT' }, { studentId: 's2', status: 'ABSENT' }] });
  assert.equal((await get('attendance')).length, 2);
  assert.equal(await db.queue.count(), 1);
});
test('acknowledged create remaps foreign keys while preserving queued request fingerprints', async () => {
  await save('students', { id: 'local-student', fullName: 'طالب' });
  await save('recitations', { id: 'local-recitation', studentId: 'local-student' });
  const before = await db.queue.toArray();
  configureOffline(async (_method, _path, body) => ({ outcomes: body.operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: { id: op.table === 'students' ? 'server-student' : 'server-recitation', ...(op.table === 'recitations' ? { studentId: 'server-student' } : {}) } })) }), () => account);
  online = true; await syncAll();
  assert.equal((await get('students'))[0].id, 'server-student');
  assert.equal((await get('recitations'))[0].studentId, 'server-student');
  assert.equal(before[1].data.studentId, 'local-student');
  assert.equal(await db.queue.count(), 0);
});
test('malformed acknowledgement never clears pending work', async () => {
  await save('students', { id: 's1', fullName: 'طالب' });
  configureOffline(async () => ({ outcomes: [] }), () => account);
  online = true; await assert.rejects(syncAll(), /لم يؤكد/);
  assert.equal(await db.queue.count(), 1);
});
test('JSON backup restores cached photo blobs and reference metadata', async () => {
  await db.responses.put({ key: 'account-a:image:/photo.png', accountId: account, data: new Blob(['image-data'], { type: 'image/png' }) });
  await db.meta.put({ key: 'account-a:reference:/exams/sections', value: [{ id: 'section1' }] });
  const backup = JSON.parse(JSON.stringify(await exportLocal()));
  await db.responses.clear(); await db.meta.clear();
  await importLocal(backup);
  const cached = await db.responses.get('account-a:image:/photo.png');
  assert.equal(await cached!.data.text(), 'image-data');
  assert.equal((await db.meta.get('account-a:reference:/exams/sections'))?.value[0].id, 'section1');
});
