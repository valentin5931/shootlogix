/**
 * ShootLogix Service Worker
 * Provides offline support: caches static assets and API responses.
 * Strategy: Cache-First for assets, Network-First for API calls.
 */

const CACHE_VERSION = 'shootlogix-v2';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/static/app.js',
  '/static/style.css',
  '/static/js/offline-queue.js',
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (mutations go straight to network)
  if (event.request.method !== 'GET') return;

  // API calls: Network-First with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful GET responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed: try cache
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            // No cache: return offline JSON
            return new Response(
              JSON.stringify({ error: 'Offline - data unavailable' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static assets: Cache-First
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // If it's a page request, return the cached index page
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      })
  );
});
