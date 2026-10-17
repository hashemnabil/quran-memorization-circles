import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, initOffline } from './offline-engine';
import { prefetchSections, readPrefetched } from './offline-prefetch';
import { applySnapshotPatch } from './snapshot-delta';

let account = 'account-a';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(async () => { account = 'account-a'; for (const table of db.tables) await table.clear(); });
after(() => db.close());

test('complete activity history and recipient groups are prefetched before visiting their screens and searchable offline', async () => {
  await prefetchSections(async (_method, path) => {
    if (path === '/notifications/recipients') return { users: [{ id: 'student', role: 'STUDENT', circleId: 'circle' }], circles: [{ id: 'circle', name: 'Circle' }], studentsWithoutAccounts: [] };
    if (path === '/dashboard/activity') return { data: [{ id: 'new', summary: 'Recent', createdAt: '2026-01-01' }], meta: { totalPages: 2, hasNextPage: true } };
    if (path === '/dashboard/activity?page=2') return { data: [{ id: 'old', summary: 'First ever record', createdAt: '2001-01-01' }], meta: { totalPages: 2, hasNextPage: false } };
    return [];
  }, account, () => account, 'ADMIN', ['broadcast_activity_v1']);
  const history = await readPrefetched(account, '/dashboard/activity', { page: 1, limit: 50, sortBy: 'createdAt', sortOrder: 'asc' });
  assert.equal(history.meta.total, 2); assert.equal(history.data[0].id, 'old');
  assert.equal((await readPrefetched(account, '/dashboard/activity', { search: 'First ever' })).data[0].id, 'old');
  assert.equal((await readPrefetched(account, '/notifications/recipients')).users[0].circleId, 'circle');
  assert.equal(await readPrefetched('other-account', '/notifications/recipients'), undefined);
});

test('section patches preserve unchanged rows, apply additions/deletions, and reject missing rows', () => {
  const before = { data: [{ id: 'old', name: 'keep' }, { id: 'deleted' }], meta: { total: 2 } };
  const after = applySnapshotPatch(before, { kind: 'object', fields: { data: { kind: 'rows', field: 'id', order: ['new', 'old'], changed: [{ id: 'new', name: 'added' }] } }, removed: [] });
  assert.deepEqual(after.data, [{ id: 'new', name: 'added' }, { id: 'old', name: 'keep' }]);
  assert.deepEqual(before.data, [{ id: 'old', name: 'keep' }, { id: 'deleted' }]);
  assert.throws(() => applySnapshotPatch([], { kind: 'rows', field: 'id', order: ['missing'], changed: [] }));
});

test('incremental section refresh only requests affected domains and reuses stored page tokens', async () => {
  const paths: string[] = [];
  let incremental = false;
  const send = async (_method: string, path: string, headers?: Record<string, string>) => {
    paths.push(path);
    if (path === '/support') {
      if (incremental) {
        assert.equal(headers?.['X-Offline-Base'], 'support-v1');
        return { offlineDelta: { baseToken: 'support-v1', token: 'support-v2', patch: { kind: 'object', removed: [], fields: { data: { kind: 'rows', field: 'id', order: ['ticket1', 'ticket2'], changed: [{ id: 'ticket2', subject: 'new' }] } } } } };
      }
      return { offlineSnapshot: { token: 'support-v1', data: { data: [{ id: 'ticket1', subject: 'keep' }], meta: { hasNextPage: false } } } };
    }
    return [];
  };
  await prefetchSections(send, account, () => account, 'ADMIN');
  paths.length = 0; incremental = true;
  await prefetchSections(send, account, () => account, 'ADMIN', ['support_tickets']);
  assert.ok(!paths.includes('/users'));
  assert.ok(!paths.includes('/chat/conversations'));
  const rows = (await readPrefetched(account, '/support', { limit: 100 })).data;
  assert.deepEqual(rows, [{ id: 'ticket1', subject: 'keep' }, { id: 'ticket2', subject: 'new' }]);
});

test('contact policy refresh replaces obsolete offline directory variants without downloading core tables', async () => {
  await db.responses.put({ key: JSON.stringify([account, '/users/directory', [['search', 'old']]]), accountId: account, data: [{ id: 'forbidden' }] });
  const paths: string[] = [];
  await prefetchSections(async (_method, path) => {
    paths.push(path); return path === '/users/directory' ? [{ id: 'allowed', role: 'TEACHER' }] : [];
  }, account, () => account, 'STUDENT', ['chat_contact_policy']);
  assert.equal(await db.responses.where('accountId').equals(account).count(), 0);
  assert.deepEqual(await readPrefetched(account, '/users/directory'), [{ id: 'allowed', role: 'TEACHER' }]);
  assert(!paths.some(path => path.startsWith('/sync-all') || path.startsWith('/students/')));
});

test('app startup downloads unvisited sections, all pages, details and conversation messages', async () => {
  const requests: string[] = [];
  const send = async (_method: string, path: string): Promise<any> => {
    requests.push(path);
    if (path.startsWith('/sync-all')) return { data: [], meta: { hasNextPage: false } };
    if (path === '/support') return { data: [{ id: 'ticket1', status: 'OPEN', title: 'first' }], meta: { hasNextPage: true, totalPages: 2 } };
    if (path === '/support?page=2') return { data: [{ id: 'ticket2', status: 'CLOSED', title: 'second' }], meta: { hasNextPage: false, totalPages: 2 } };
    if (path === '/chat/conversations') return [{ id: 'chat1' }];
    if (path.endsWith('/messages')) return { data: [{ id: 'message1', content: 'saved message' }], meta: { hasNextPage: false } };
    if (path === '/staff-attendance/history') return { data: [{ date: '2026-10-15' }], meta: { hasNextPage: false } };
    if (path === '/registry/admin/users') return { items: [{ id: 'registry1' }], pages: 2 };
    if (path === '/registry/admin/users?page=2') return { items: [{ id: 'registry2' }], pages: 2 };
    return { path };
  };
  configureOffline(send, () => account, id => prefetchSections(send, id, () => account, 'ADMIN'));
  await initOffline();
  assert.ok(requests.includes('/support/ticket2'));
  assert.ok(requests.includes('/staff-attendance/history/2026-10-15'));
  assert.ok(requests.includes('/chat/conversations/chat1/messages'));
  assert.ok(requests.includes('/registry/admin/users/registry2'));
  assert.equal((await readPrefetched(account, '/registry/admin/users', { page: 2, pageSize: 1 })).items[0].id, 'registry2');
  const date = new Date().toISOString().slice(0, 10);
  assert.equal((await readPrefetched(account, '/staff-attendance/sheet', { date })).path, `/staff-attendance/sheet?date=${date}`);
  assert.equal((await readPrefetched(account, '/support', { status: 'CLOSED', page: 1, limit: 10 })).data[0].id, 'ticket2');
  assert.equal((await readPrefetched(account, '/chat/conversations/chat1/messages', { limit: 100 })).data[0].content, 'saved message');
  assert.equal(await readPrefetched('other-account', '/support'), undefined);
  assert.equal(await readPrefetched(account, '/support', { unsupported: 'filter' }), undefined);
});

test('an interrupted later page preserves the prior complete snapshot and retries the entire section', async () => {
  let fail = false;
  const send = async (_method: string, path: string): Promise<any> => {
    if (path === '/support') return { data: [{ id: 'one' }], meta: { hasNextPage: true } };
    if (path === '/support?page=2') {
      if (fail) throw new Error('connection lost');
      return { data: [{ id: 'two' }], meta: { hasNextPage: false } };
    }
    return [];
  };
  await prefetchSections(send, account, () => account, 'TEACHER');
  fail = true;
  await assert.rejects(prefetchSections(send, account, () => account, 'TEACHER'), /connection lost/);
  assert.equal((await readPrefetched(account, '/support', { limit: 100 })).data.length, 2);
  fail = false;
  await prefetchSections(send, account, () => account, 'TEACHER');
  assert.ok(await db.meta.get(`${account}:sectionsDownloadedAt`));
});

test('switching accounts in flight cannot save the previous account response into either account', async () => {
  await prefetchSections(async () => { account = 'account-b'; return [{ id: 'private' }]; }, 'account-a', () => account, 'STUDENT');
  assert.equal(await readPrefetched('account-a', '/settings'), undefined);
  assert.equal(await readPrefetched('account-b', '/settings'), undefined);
});
