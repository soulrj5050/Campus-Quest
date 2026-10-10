/* ============================================================
   CAMPUS QUEST – Service Worker
   Caches local assets so the PWA works offline after first load.
   External CDN resources (Leaflet) are fetched from network.
   ============================================================ */

const CACHE_NAME = 'campus-quest-v6';

const LOCAL_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

// Install: pre-cache local assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve cached local assets, go to network for everything else
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
