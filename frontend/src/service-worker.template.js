/* Keep the last working offline shell until every asset of the new build is cached. */
const CACHE_NAME = '__SHELL_CACHE_NAME__';
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;
const APP_SHELL = '/';
const CACHE_PREFIX = 'quran-circles-shell-';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const existed = await caches.has(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(APP_SHELL, { cache: 'reload' });
      if (!response.ok) throw new Error('Unable to cache application shell');
      const html = await response.clone().text();
      const expected = new Set(PRECACHE_ASSETS.map((asset) => new URL(asset, self.location.origin).href));
      const references = [...html.matchAll(/(?:src|href)="([^" ]*\/assets\/[^" ]+)"/g)]
        .map((match) => new URL(match[1], self.location.origin).href);
      if (!references.length || references.some((asset) => !expected.has(asset))) throw new Error('Shell and worker belong to different builds');
      const assets = [...expected];
      // A shell without its JS/CSS cannot start offline. Fail the installation
      // rather than activating a partial cache and deleting the previous version.
      const assetResponses = await Promise.all(assets.map(async (asset) => {
        const isSound = new URL(asset).pathname.startsWith('/sounds/');
        let assetResponse = await fetch(asset, { cache: 'reload', ...(isSound ? { headers: { Range: 'bytes=0-' } } : {}) });
        if (!assetResponse.ok) throw new Error(`Unable to cache app asset: ${asset}`);
        if (isSound) {
          // Fetch the complete media range. Some download managers intercept plain
          // audio fetches with an empty 204; never activate a shell with empty tones.
          const data = await assetResponse.arrayBuffer();
          const bytes = new Uint8Array(data);
          const signature = String.fromCharCode(...bytes.slice(0, 4));
          const format = String.fromCharCode(...bytes.slice(8, 12));
          if (bytes.length <= 44 || signature !== 'RIFF' || format !== 'WAVE') throw new Error(`Invalid audio asset: ${asset}`);
          if (assetResponse.status === 206) {
            const range = /^bytes 0-(\d+)\/(\d+)$/.exec(assetResponse.headers.get('Content-Range') || '');
            if (!range || Number(range[1]) + 1 !== bytes.length || Number(range[2]) !== bytes.length) throw new Error(`Incomplete audio asset: ${asset}`);
          }
          // CacheStorage cannot store a 206 response. Normalize only a verified
          // complete file, so future range or ordinary requests can read it offline.
          assetResponse = new Response(data, { status: 200, headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(bytes.length) } });
        }
        return [asset, assetResponse];
      }));

      await cache.put(APP_SHELL, response);
      await Promise.all(assetResponses.map(([asset, assetResponse]) => cache.put(asset, assetResponse)));
      await self.skipWaiting();
    } catch (error) {
      if (!existed) await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Background Sync is a wake-up hint only. The authenticated application owns
// the encrypted outbox and credentials, so it performs the actual sync after
// a live window receives this message. Browsers may defer or omit this event.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'halaqat-pending-sync') return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'HALAQAT_SYNC_REQUEST' });
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === 'GET' && request.destination === 'image') {
    // Private account images belong in encrypted IndexedDB, never a shared
    // plaintext CacheStorage bucket. Bundled public branding stays available.
    const publicAsset = url.origin === self.location.origin && (url.pathname === '/brand-logo.png' || url.pathname === '/favicon.svg' || url.pathname.startsWith('/onboarding/') || url.pathname.startsWith('/assets/'));
    if (!publicAsset) { event.respondWith(fetch(request, { cache: 'no-store' })); return; }
    event.respondWith((async () => {
      const cache = await caches.open('quran-circles-images');
      const cached = await cache.match(request) || (url.origin === self.location.origin ? await caches.match(request, { ignoreVary: true }) : undefined);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const html = await response.clone().text();
          const refs = [...html.matchAll(/(?:src|href)="([^" ]*\/assets\/[^" ]+)"/g)].map((match) => new URL(match[1], self.location.origin).href);
          const cache = await caches.open(CACHE_NAME);
          // Keep the last complete shell when a deployment serves new HTML before its assets are ready.
          if (refs.length && (await Promise.all(refs.map((asset) => cache.match(asset)))).every(Boolean)) await cache.put(APP_SHELL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request, { ignoreVary: true })) || (await caches.match(APP_SHELL, { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/sounds/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.ico' || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      // Vite can add Vary: Origin. Module-script requests carry Origin while
      // worker precache requests do not; immutable public assets are identical.
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    })());
  }
});
