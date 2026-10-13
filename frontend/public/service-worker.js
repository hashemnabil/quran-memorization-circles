/* Cache the complete same-origin app shell so a previously opened app can boot offline. */
const CACHE_NAME = 'quran-circles-shell-v2';
const APP_SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_SHELL, { cache: 'reload' });
    if (!response.ok) throw new Error('Unable to cache application shell');
    await cache.put(APP_SHELL, response.clone());
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\/assets\/[^"]+)"/g)]
      .map((match) => new URL(match[1], self.location.origin).href);
    await Promise.all(assets.map(async (asset) => {
      try {
        const assetResponse = await fetch(asset, { cache: 'reload' });
        if (assetResponse.ok) await cache.put(asset, assetResponse);
      } catch { /* Optional asset. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('quran-circles-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
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
