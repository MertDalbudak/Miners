/*
  Miners service worker (generated at build time from src/sw-template.js).
  Precaches the whole game so it runs offline once installed.
*/

const CACHE = 'miners-__VERSION__';
const PRECACHE = __PRECACHE__;
// Module scripts are requested in CORS mode; servers often add `Vary: Origin`
const MATCH = { ignoreVary: true };

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('miners-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Pages: network first so updates arrive, cache when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request, MATCH).then(r => r || caches.match('./', MATCH)))
    );
    return;
  }

  // Assets are content-hashed: cache first
  event.respondWith(
    caches.match(request, MATCH).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
