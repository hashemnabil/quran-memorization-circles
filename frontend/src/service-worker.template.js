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
        const assetResponse = await fetch(asset, { cache: 'reload' });
        if (!assetResponse.ok) throw new Error(`Unable to cache app asset: ${asset}`);
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
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
        return (await caches.match(request)) || (await caches.match(APP_SHELL)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico' || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    })());
  }
});
