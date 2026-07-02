// sw.js – Service Worker for KAVACH PWA
// Caches all static assets on install and serves from cache when offline.
// API calls use a network‑first strategy, while static files use cache‑first.

const CACHE_NAME = 'kavach-cache-v2';
const OFFLINE_URL = 'offline.html'; // optional fallback page

// List of core assets to cache – adjust if you add more files.
const CORE_ASSETS = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/bluetooth.js',
  '/static/voice.js',
  '/static/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    })
  );
  // Force the waiting service worker to become active.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Clean up old caches.
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Network‑first for API calls (any request starting with /api/)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone and store in cache for offline fallback.
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request) || new Response(JSON.stringify({ error: 'Offline' }), { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // For everything else (static assets) use cache‑first.
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Update cache with the fresh response.
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      }).catch(() => {
        // If both cache and network fail, optionally serve an offline page.
        if (event.request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});
