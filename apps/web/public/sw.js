// Minimal service worker: cache-first for immutable static assets only.
// - /engine/ holds the 7MB Stockfish build: caching it makes app opens fast
//   (bump the CACHE name when upgrading the engine version)
// - /assets/ are content-hashed by vite, safe to cache forever
// Navigations and API calls are never intercepted, so deploys stay fresh
// and the analysis always talks to the live chess.com/lichess APIs.
const CACHE = 'ccd-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  const cacheable =
    url.pathname.startsWith('/engine/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/');
  if (!cacheable) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});
