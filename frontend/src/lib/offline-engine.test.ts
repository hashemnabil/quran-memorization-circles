import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import { db } from './db';
import { configureOffline, save, get, update, remove, mergeRows, syncAll, initOffline, pullAll, refreshOffline, reconcileAfterNetworkWrite, noteRemoteRevision, settleLocalWrite, exportLocal, importLocal, clearLocal } from './offline-engine';
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

test('verification upgrade downloads just the new table without redownloading old application data', async () => {
  online = true; const paths: string[] = [];
  await db.meta.bulkPut([{ key: `${account}:downloadedAt`, value: 'ready' }, { key: `${account}:deltaCursor`, value: '50' }, { key: `${account}:needsProfileReviewsBootstrap`, value: true }]);
  await mergeRows('students', [{ id: 'existing', fullName: 'Kept' }]);
  configureOffline(async (_method, path) => { paths.push(path);
    if (path.includes('table=profileReviews')) return { data: [{ id: 'review', status: 'PENDING' }], meta: { hasNextPage: false } };
    if (path === '/sync-all/watermark') return { cursor: '50' };
    throw new Error(`Unexpected full download: ${path}`);
  }, () => account);
  await refreshOffline();
  assert(paths.some(path => path.includes('table=profileReviews')));
  assert(!paths.some(path => path.includes('table=students')));
  assert.equal((await get('students'))[0].fullName, 'Kept');
  assert.equal((await get('profileReviews'))[0].id, 'review');
  assert.equal(await db.meta.get(`${account}:needsProfileReviewsBootstrap`), undefined);
});

test('direct server writes refresh the local replica without a socket and recheck overlapping commits', async () => {
  await db.meta.bulkPut([
    { key: `${account}:downloadedAt`, value: 'ready' },
    { key: `${account}:deltaCursor`, value: '10' },
  ]);
  await mergeRows('students', [{ id: 's1', fullName: 'Before' }]);
  let release!: () => void; let started!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const began = new Promise<void>(resolve => { started = resolve; });
  let checks = 0; const paths: string[] = [];
  configureOffline(async (_method, path) => {
    paths.push(path);
    if (path === '/sync-all/watermark') {
      checks++;
      if (checks === 1) { started(); await blocked; }
      return { cursor: String(10 + checks) };
    }
    return { tables: { students: { data: [{ id: 's1', fullName: `Commit ${checks}` }], visibleIds: ['s1'] } }, changedEntities: ['students'], cursor: String(10 + checks), hasMore: false };
  }, () => account);
  online = true;
  const first = reconcileAfterNetworkWrite();
  await began;
  const second = reconcileAfterNetworkWrite();
  assert.equal(first, second);
  release(); await first;
  online = false;
  assert.equal((await get('students'))[0].fullName, 'Commit 2');
  assert.equal((await db.meta.get(`${account}:deltaCursor`))?.value, '12');
  assert.equal(checks, 2);
  assert.equal(paths.some(path => path.includes('?table=')), false);
  await reconcileAfterNetworkWrite();
  assert.equal(checks, 2);
});

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

test('online student create and update wait for their own acknowledgement and return canonical data', async () => {
  configureOffline(async (_method, _path, body) => ({ outcomes: body.operations.map((op: any) => ({ opId: op.opId, status: 'applied', data: { ...op.data, id: 'server-student', code: '123' } })) }), () => account);
  online = true;
  const created = await settleLocalWrite(await save('students', { fullName: 'new student', circleId: 'circle' }));
  assert.equal(created.id, 'server-student');
  assert.equal(created.synced, 1);
  assert.equal(created.code, '123');
  const edited = await settleLocalWrite(await update('students', created.id, { fullName: 'edited student' }));
  assert.equal(edited.fullName, 'edited student');
  assert.equal(edited.synced, 1);
  assert.equal(await db.queue.count(), 0);
});

test('online edits survive disconnect and offline edits survive reconnect and a second disconnect', async () => {
  let primary = { id: 'student-roundtrip', fullName: 'original', phone: '111' };
  let requests = 0;
  configureOffline(async (method, path, body) => {
    assert.equal(online, true);
    assert.equal(method, 'post');
    assert.equal(path, '/sync-all');
    requests++;
    return { outcomes: body.operations.map((op: any) => {
      primary = { ...primary, ...op.data, fullName: op.data.fullName.trim() };
      return { opId: op.opId, status: 'applied', data: primary };
    }) };
  }, () => account);
  await mergeRows('students', [primary]);

  online = true;
  await settleLocalWrite(await update('students', primary.id, { fullName: ' online edit ', phone: '222' }));
  assert.equal(primary.fullName, 'online edit');
  online = false;
  assert.equal((await get('students'))[0].fullName, 'online edit');
  assert.equal((await get('students'))[0].phone, '222');
  assert.equal((await get('students'))[0].synced, 1);

  const offlineEdit = await settleLocalWrite(await update('students', primary.id, { fullName: ' offline edit ', phone: '333' }));
  assert.equal(offlineEdit.synced, 0);
  assert.equal((await get('students'))[0].fullName, ' offline edit ');
  assert.equal(primary.fullName, 'online edit');
  assert.equal(requests, 1);
  // Reopening IndexedDB must retain an unsent edit, without any network access.
  db.close(); await db.open();
  assert.equal((await get('students'))[0].phone, '333');
  assert.equal(await db.queue.count(), 1);

  online = true;
  await syncAll();
  assert.equal(primary.fullName, 'offline edit');
  assert.equal(primary.phone, '333');
  assert.equal(await db.queue.count(), 0);
  online = false;
  db.close(); await db.open();
  const final = (await get('students'))[0];
  assert.equal(final.fullName, primary.fullName);
  assert.equal(final.phone, primary.phone);
  assert.equal(final.synced, 1);
  assert.equal(requests, 2);
});

test('a rejected old write preserves its dependents but does not block a new unrelated student', async () => {
  await save('students', { id: 'bad', fullName: 'invalid' });
  await save('recitations', { id: 'dependent', studentId: 'bad' });
  const good = await save('students', { id: 'good', fullName: 'valid' });
  const sent: string[] = [];
  configureOffline(async (_method, _path, body) => {
    const outcomes = [];
    for (const op of body.operations) {
      sent.push(op.entityId);
      outcomes.push({ opId: op.opId, status: op.entityId === 'bad' ? 'rejected' : 'applied', message: 'duplicate code', data: { id: op.entityId } });
      if (op.entityId === 'bad') break;
    }
    return { outcomes };
  }, () => account);
  online = true;
  const result = await settleLocalWrite(good);
  assert.equal(result.synced, 1);
  assert.deepEqual(sent, ['bad', 'good']);
  assert.deepEqual((await db.queue.toArray()).map(op => op.entityId), ['bad', 'dependent']);
});

test('an explicit server rejection reaches the form; offline writes still succeed locally', async () => {
  const local = await settleLocalWrite(await save('students', { id: 'bad', fullName: 'invalid' }));
  assert.equal(local.synced, 0);
  configureOffline(async (_method, _path, body) => ({ outcomes: [{ opId: body.operations[0].opId, status: 'rejected', message: 'رقم الطالب مستخدم مسبقاً' }] }), () => account);
  online = true;
  await assert.rejects(settleLocalWrite(local), /رقم الطالب مستخدم/);
  assert.equal(await db.queue.count(), 1);
});

test('correcting a rejected registration replaces it in order and unblocks its dependents', async () => {
  const draft = await save('students', { id: 'draft', fullName: 'Student', code: 'duplicate' });
  await save('recitations', { id: 'dependent', studentId: 'draft' });
  const old = await db.queue.where('opId').equals(draft._writeOpId).first();
  await db.queue.update(old!.id!, { error: 'Duplicate code' });
  const corrected = await update('students', 'draft', { code: '123' });
  const queue = await db.queue.toArray();
  assert.equal(queue.length, 2);
  assert.equal(queue[0].action, 'create');
  assert.equal(queue[0].data.fullName, 'Student');
  assert.equal(queue[0].data.code, '123');
  assert.notEqual(queue[0].opId, draft._writeOpId);
  assert.equal(queue[0].opId, corrected._writeOpId);
  assert.equal(queue[0].error, undefined);
  const actions: string[] = [];
  configureOffline(async (_method, _path, body) => ({ outcomes: body.operations.map((op: any) => {
    actions.push(op.action);
    return { opId: op.opId, status: 'applied', data: { ...op.data, id: op.entityId } };
  }) }), () => account);
  online = true;
  await settleLocalWrite(corrected);
  assert.deepEqual(actions, ['create', 'create']);
  assert.equal(await db.queue.count(), 0);
  assert.equal((await get('students'))[0].code, '123');
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

test('reopening and reconnecting send nothing until a new server revision or a local edit exists', async () => {
  await db.meta.put({ key: `${account}:downloadedAt`, value: new Date().toISOString() });
  await db.meta.put({ key: `${account}:deltaCursor`, value: '10' });
  await db.meta.put({ key: `${account}:remoteRevision`, value: '10' });
  await db.meta.put({ key: `${account}:downloadedRevision`, value: '10' });
  const paths: string[] = [];
  configureOffline(async (_method, path) => {
    paths.push(path);
    if (path === '/sync-all/watermark') return { cursor: '11' };
    return { tables: {}, changedEntities: [], cursor: '11', hasMore: false };
  }, () => account);
  online = true;
  await initOffline();
  online = false; await initOffline();
  online = true; await refreshOffline(); await initOffline();
  assert.deepEqual(paths, []);
  await noteRemoteRevision('10'); await refreshOffline();
  assert.deepEqual(paths, []);
  await noteRemoteRevision('11'); await refreshOffline();
  assert.deepEqual(paths, ['/sync-all/watermark', '/sync-all/delta?since=10']);
  paths.length = 0;
  await initOffline(); await refreshOffline();
  assert.deepEqual(paths, []);
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
