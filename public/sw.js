const STATIC_CACHE = 'mycelet-static-v1';
const TILE_CACHE = 'mycelet-map-tiles-v1';
const STATIC_ASSETS = ['/', '/map', '/pricing', '/manifest.json', '/icons/icon.svg', '/icons/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, TILE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isMapTileRequest(url) {
  // The base maps the app can save offline. Must stay in sync with the three
  // tile templates in src/lib/utils/offlineMap.ts — a tile the cache warms but
  // this predicate misses would never be served back offline (blank map).
  // Kartverket "Terreng" (Norway only)
  if (url.origin === 'https://cache.kartverket.no' && url.pathname.includes('/wmts/1.0.0/topo/default/webmercator/')) {
    return true;
  }
  // OpenStreetMap "Kart" (Sweden + rest of world) — {a,b,c}.tile.openstreetmap.org
  if (url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org')) {
    return true;
  }
  // Esri World Imagery "Satellitt"
  if (url.origin === 'https://server.arcgisonline.com' && url.pathname.includes('/World_Imagery/MapServer/tile/')) {
    return true;
  }
  return false;
}

function isCacheableStaticRequest(url) {
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/auth/')) return false;

  return (
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.webp')
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  if (isMapTileRequest(requestUrl)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (error) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  if (requestUrl.origin === self.location.origin) {
    if (event.request.mode === 'navigate') return;
    if (!isCacheableStaticRequest(requestUrl)) return;

    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);

        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
