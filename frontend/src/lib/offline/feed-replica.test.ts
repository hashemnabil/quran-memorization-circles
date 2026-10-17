import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pullReplica, readReplica, clearReplica } from './feed-replica';
const account = 'account-1', hash = 'a'.repeat(64), later = 'b'.repeat(64);
const scope = (h = hash) => ({ version: 1, accountId: account, scopeVersion: h });
const snapshot = (students: any[], extras: any = {}) => ({ ...scope(), students, circles: [], asOfSeq: '9007199254740993', complete: true, nextCursor: null, ...extras });
const delta = (changes: any[] = [], extras: any = {}) => ({ version: 1, accountId: account, changes, nextSeq: '9007199254740994', hasMore: false, ...extras });
let current = account;
beforeEach(async () => { current = account; await clearReplica(account); });
const active = () => current;
test('initial snapshot fence and sequence advances are precise beyond Number.MAX_SAFE_INTEGER', async () => {
  const calls: any[] = [];
  const get = async (path: string, params: any) => {
    calls.push([path, params]);
    if (path === '/sync/scope') return scope();
    if (path === '/sync/snapshot') return snapshot([{ id: 's1', fullName: 'Before' }]);
    return delta([{ entity: 'student', id: 's1', seq: '9007199254740994', operation: 'UPSERT', data: { id: 's1', fullName: 'After' } }]);
  };
  await pullReplica(account, get, active, async () => {});
  assert.equal(calls.find(([path]) => path === '/sync/changes')[1].since, '9007199254740993');
  assert.equal((await readReplica(account, 'student'))[0].fullName, 'After');
});
test('interrupted paginated download resumes from durable staging without exposing partial data', async () => {
  let fail = true; const cursors: any[] = [];
  const get = async (path: string, params: any) => {
    if (path === '/sync/scope') return scope();
    if (path === '/sync/snapshot') {
      cursors.push(params.cursor);
      if (!params.cursor) return snapshot([{ id: 's1' }], { complete: false, nextCursor: 's1' });
      if (fail) throw new Error('connection lost');
      return snapshot([{ id: 's2' }]);
    }
    return delta();
  };
  await assert.rejects(pullReplica(account, get, active, async () => {}));
  assert.deepEqual(await readReplica(account, 'student'), []);
  fail = false; await pullReplica(account, get, active, async () => {});
  assert.deepEqual(cursors, [undefined, 's1', 's1']);
  assert.deepEqual((await readReplica(account, 'student')).map(r => r.id).sort(), ['s1', 's2']);
});
test('page budget resumes staged downloads and never publishes an incomplete snapshot', async () => {
  const get = async (path: string, params: any) => path === '/sync/scope' ? scope() : path === '/sync/changes' ? delta() : !params.cursor ? snapshot([{ id: 's1' }], { complete: false, nextCursor: 's1' }) : snapshot([{ id: 's2' }]);
  assert.equal((await pullReplica(account, get, active, async () => {}, 1)).complete, false);
  assert.deepEqual(await readReplica(account, 'student'), []);
  await pullReplica(account, get, active, async () => {}, 2);
  assert.equal((await readReplica(account, 'student')).length, 2);
});
test('new scope purges inaccessible old rows and query data before the replacement download', async () => {
  await pullReplica(account, async path => path === '/sync/scope' ? scope() : path === '/sync/snapshot' ? snapshot([{ id: 'private' }]) : delta(), active, async () => {});
  let purges = 0;
  await assert.rejects(pullReplica(account, async path => path === '/sync/scope' ? scope(later) : Promise.reject(new Error('offline')), active, async () => { purges++; }));
  assert.equal(purges, 1); assert.deepEqual(await readReplica(account, 'student'), []);
});
test('account switch during response cannot repopulate the logged-out account', async () => {
  await assert.rejects(pullReplica(account, async path => { if (path === '/sync/scope') return scope(); current = 'different-account'; return snapshot([{ id: 'private' }]); }, active, async () => {}));
  assert.deepEqual(await readReplica(account, 'student'), []);
});
test('scope change during download prevents publication', async () => {
  let checks = 0;
  await assert.rejects(pullReplica(account, async path => path === '/sync/scope' ? scope(checks++ ? later : hash) : snapshot([{ id: 'private' }]), active, async () => {}));
  assert.deepEqual(await readReplica(account, 'student'), []);
});
test('hard deletion removes the row and malformed page never advances the committed cursor', async () => {
  await pullReplica(account, async path => path === '/sync/scope' ? scope() : path === '/sync/snapshot' ? snapshot([{ id: 's1' }]) : delta(), active, async () => {});
  await assert.rejects(pullReplica(account, async path => path === '/sync/scope' ? scope() : delta([], { nextSeq: '1' }), active, async () => {}));
  let since: string | undefined;
  await pullReplica(account, async (path, params) => { if (path === '/sync/scope') return scope(); since = params?.since as string; return delta([{ entity: 'student', id: 's1', seq: '9007199254740995', operation: 'DELETE', data: null }], { nextSeq: '9007199254740995' }); }, active, async () => {});
  assert.equal(since, '9007199254740994'); assert.deepEqual(await readReplica(account, 'student'), []);
});
