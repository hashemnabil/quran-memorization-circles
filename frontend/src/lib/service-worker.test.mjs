import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function install({ existing = false, broken = false, mismatch = false, sound = false, ogg = false, soundMode = 'valid' } = {}) {
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
    .replace('__SHELL_CACHE_NAME__', 'quran-circles-shell-test').replace('__PRECACHE_ASSETS__', JSON.stringify(['/assets/app.js', '/assets/shared.js', '/assets/arabic.woff2', ...(sound ? [ogg ? '/sounds/adhan.ogg' : '/sounds/calm.wav'] : [])]));
  vm.runInNewContext(source, {
    URL, Response, caches,
    self: { location: { origin: 'https://school.example' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => {}, clients: { matchAll: async () => [{ postMessage: (message) => messages.push(message) }] } },
    fetch: async (path, options) => {
      if (String(path).includes('/sounds/')) {
        assert.equal(options.headers.Range, 'bytes=0-');
        if (soundMode === 'empty') return new Response(null, { status: 204 });
        const wave = Buffer.alloc(48); wave.write('RIFF', 0); wave.write('WAVE', 8);
        if (ogg) wave.write('OggS', 0);
        return new Response(wave, { status: 206, headers: { 'Content-Range': soundMode === 'partial' ? 'bytes 0-47/100' : 'bytes 0-47/48' } });
      }
      return path === '/' ? new Response(`<script src="/assets/${mismatch ? 'old' : 'app'}.js"></script>`) : broken ? new Response('unavailable', { status: 503 }) : new Response('asset');
    },
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
test('complete media ranges are normalized for offline cache storage', async () => {
  const result = install({ sound: true }); await result.promise;
  const response = result.entries.get('quran-circles-shell-test').get('https://school.example/sounds/calm.wav');
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 48);
});
test('the bundled Ogg adhan is cached intact and partial downloads are rejected', async () => {
  const result = install({ sound: true, ogg: true }); await result.promise;
  const response = result.entries.get('quran-circles-shell-test').get('https://school.example/sounds/adhan.ogg');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'audio/ogg');
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), 'OggS');
  await assert.rejects(install({ sound: true, ogg: true, soundMode: 'partial' }).promise);
});
test('empty intercepted audio and partial files cannot replace a working shell', async () => {
  for (const soundMode of ['empty', 'partial']) {
    const result = install({ existing: true, sound: true, soundMode });
    await assert.rejects(result.promise, /Invalid audio|Incomplete audio/);
    assert.equal(result.entries.get('quran-circles-shell-test').get('/'), 'working-shell');
    assert.deepEqual(result.deleted, []);
  }
});
