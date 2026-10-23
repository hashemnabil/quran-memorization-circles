import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function install({ existing = false, broken = false, mismatch = false } = {}) {
  const entries = new Map(); const deleted = []; const messages = [];
  if (existing) entries.set('quran-circles-shell-test', new Map([['/', 'working-shell']]));
  entries.set('quran-circles-shell-old', new Map([['/', 'old-shell']]));
  const handlers = {};
  const caches = {
    has: async (key) => entries.has(key),
    open: async (key) => {
      if (!entries.has(key)) entries.set(key, new Map());
      return { put: async (path, value) => entries.get(key).set(path, value), match: async (path) => entries.get(key).get(path) };
    },
    delete: async (key) => { deleted.push(key); return entries.delete(key); },
  };
  const source = readFileSync(new URL('../service-worker.template.js', import.meta.url), 'utf8')
    .replace('__SHELL_CACHE_NAME__', 'quran-circles-shell-test').replace('__PRECACHE_ASSETS__', JSON.stringify(['/assets/app.js', '/assets/shared.js', '/assets/arabic.woff2']));
  vm.runInNewContext(source, {
    URL, Response, caches,
    self: { location: { origin: 'https://school.example' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => {}, clients: { matchAll: async () => [{ postMessage: (message) => messages.push(message) }] } },
    fetch: async (path) => path === '/' ? new Response(`<script src="/assets/${mismatch ? 'old' : 'app'}.js"></script>`) : broken ? new Response('unavailable', { status: 503 }) : new Response('asset'),
  });
  let promise;
  handlers.install({ waitUntil: (pending) => { promise = pending; } });
  return { promise, entries, deleted, handlers, messages };
}
test('failed worker installation preserves an existing same-version working cache', async () => {
  const result = install({ existing: true, broken: true });
  await assert.rejects(result.promise);
  assert.equal(result.entries.get('quran-circles-shell-test').get('/'), 'working-shell');
  assert.deepEqual(result.deleted, []);
});
test('failed new installation deletes only its incomplete cache, not the active old shell', async () => {
  const result = install({ broken: true }); await assert.rejects(result.promise);
  assert.equal(result.entries.get('quran-circles-shell-old').get('/'), 'old-shell');
  assert.deepEqual(result.deleted, ['quran-circles-shell-test']);
});
test('worker refuses mismatched HTML and precaches every emitted chunk before activation', async () => {
  const wrong = install({ mismatch: true }); await assert.rejects(wrong.promise);
  const good = install(); await good.promise;
  assert.equal(good.entries.get('quran-circles-shell-test').has('https://school.example/assets/shared.js'), true);
  assert.equal(good.entries.get('quran-circles-shell-test').has('https://school.example/assets/arabic.woff2'), true);
});
test('background sync wakes the application window to process its protected outbox', async () => {
  const result = install(); await result.promise;
  let task;
  result.handlers.sync({ tag: 'halaqat-pending-sync', waitUntil: (promise) => { task = promise; } });
  await task;
  assert.deepEqual(result.messages.map((message) => message.type), ['HALAQAT_SYNC_REQUEST']);
});
