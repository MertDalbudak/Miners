const CACHE_NAME = 'miners-v5';
const ASSETS_TO_CACHE = [
  './',
  './canvas.html',
  './manifest.json',
  './js/config.js',
  './js/assets.js',
  './js/entities.js',
  './js/levelgen.js',
  './js/renderer.js',
  './js/game.js',
  './image_source/icon.png',
  './image_source/background.jpg',
  './image_source/dirt_block.png',
  './image_source/gold_block.png',
  './image_source/stone_block.jpg',
  './image_source/player.png',
  './image_source/player_mirror.png',
  './image_source/torch.gif',
  './image_source/tnt_block.jpg',
  './image_source/treasure.png',
  './image_source/surface.jpg',
  './sound_source/dirt_hit.mp3',
  './sound_source/gold_hit.mp3',
  './sound_source/tnt_hit.mp3',
  './sound_source/torch_pickup.mp3',
  './sound_source/pickaxe_pickup.mp3'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching app assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => {
        console.log('Cache addAll failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Don't cache non-successful responses or non-GET requests
          if (!response || response.status !== 200 || response.type !== 'basic' || event.request.method !== 'GET') {
            return response;
          }
          // Clone the response for caching
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
      .catch(() => {
        // Return offline fallback if available
        return caches.match('/canvas.html');
      })
  );
});
