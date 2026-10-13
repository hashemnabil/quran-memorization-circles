/* Keep the last working offline shell until every asset of the new build is cached. */
const CACHE_NAME = 'quran-circles-shell-v4';
const APP_SHELL = '/';
const CACHE_PREFIX = 'quran-circles-shell-';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(APP_SHELL, { cache: 'reload' });
      if (!response.ok) throw new Error('Unable to cache application shell');
      const html = await response.clone().text();
      const assets = [...new Set(
        [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)]
          .map((match) => new URL(match[1], self.location.origin))
          .filter((url) => url.origin === self.location.origin)
          .map((url) => url.href),
      )];

      // Never activate a shell that has no discoverable JS/CSS assets.
      if (assets.length === 0) throw new Error('No application assets found in shell');

      // Use a new cache version for every install attempt. On failure, deleting
      // this incomplete cache must never delete the active worker's last-good cache.
      const assetResponses = await Promise.all(assets.map(async (asset) => {
        const assetResponse = await fetch(asset, { cache: 'reload' });
        if (!assetResponse.ok) throw new Error(`Unable to cache app asset: ${asset}`);
        return [asset, assetResponse];
      }));

      await cache.put(APP_SHELL, response);
      await Promise.all(assetResponses.map(([asset, assetResponse]) => cache.put(asset, assetResponse)));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
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
        if (response.ok) (await caches.open(CACHE_NAME)).put(APP_SHELL, response.clone());
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
