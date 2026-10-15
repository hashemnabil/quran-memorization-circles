import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, initOffline } from './offline-engine';
import { prefetchSections, readPrefetched } from './offline-prefetch';

let account = 'account-a';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(async () => { account = 'account-a'; for (const table of db.tables) await table.clear(); });
after(() => db.close());

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
