// v2 (2026-07-19): byte-bump to force reinstall on every client. A service
// worker runs under the CSP captured when its script was fetched, so widening
// the header (PR #85, OSM/Esri in connect-src) never reached already-installed
// workers — an unchanged script skips reinstall. Any byte change here re-runs
// install; skipWaiting/clients.claim swap the new worker in immediately.
const STATIC_CACHE = 'mycelet-static-v3';
const TILE_CACHE = 'mycelet-map-tiles-v1'; // unchanged: users' saved offline tiles live here

// v3 (2026-08-01): '/', '/map' og '/pricing' er fjernet herfra.
//
// De var død vekt, og en av dem var direkte misvisende:
//
//   • Fetch-handleren under returnerer tidlig på `event.request.mode ===
//     'navigate'`. En HTML-side kan derfor ALDRI serveres fra denne cachen.
//     Vi lastet altså ned tre sider ved installasjon som aldri ble brukt.
//   • '/map' krever dessuten innlogging (PROTECTED_PATHS i
//     src/lib/supabase/middleware.ts). For en utlogget besøkende cachet vi i
//     praksis en omdirigering til innloggingssiden.
//
// At navigasjoner bevisst går til nettverket er RIKTIG for denne appen: en
// sopp-app som serverer en gammel side i skogen kan vise utdaterte
// sikkerhetsopplysninger om en art. Ekte offline-bruk er kartfliser
// (TILE_CACHE, premium), ikke sider.
//
// v4 (2026-08-02): ett unntak fra siste avsnitt — offline-skallet.
//
// Etter v3 kunne INGEN side åpnes uten nett, mens appen samtidig selger
// «offline-kart»: flisene lå i TILE_CACHE, men det fantes ikke noe skall å vise
// dem i. Den lagrede turen var utilgjengelig akkurat der den skulle brukes.
//
// '/offline' (public/offline/index.html) løser det uten å gjenåpne noen av
// problemene over:
//   • Den er ÅPEN — ikke i PROTECTED_PATHS — så det som precaches er en ekte
//     side, ikke en omdirigering til innlogging.
//   • Den er statisk og henter ingen serverdata. Den viser bare det brukerens
//     egen nettleser allerede har: områder fra localStorage og fliser fra
//     TILE_CACHE. Ingen artsdata, ingen sikkerhetstekst som kan bli utdatert.
//   • Navigasjoner går fortsatt til NETTET FØRST. Skallet brukes kun når
//     fetch() faktisk feiler, så en påkoblet bruker får aldri en gammel side.
const OFFLINE_SHELL = '/offline';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  OFFLINE_SHELL,
  '/offline/offline-map.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // Én cache.addAll() forkaster ALT hvis én enkelt ressurs feiler. Da
        // ville et 404 på et ikon tatt med seg offline-skallet i fallet — og
        // det oppdages først i skogen. Cach hver ressurs for seg.
        Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)))
      )
      .catch(() => undefined)
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
    // Nettet først, alltid. Har brukeren dekning, får hen den ferske siden —
    // en sopp-app skal aldri servere en gammel artsside fra cache. Bare når
    // fetch() faktisk feiler (ingen dekning) svarer vi med offline-skallet, som
    // viser de lagrede kartområdene. URL-en i adressefeltet står stille, så
    // brukeren kommer tilbake til siden hen ba om ved neste forsøk.
    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request).catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          const shell = await cache.match(OFFLINE_SHELL);
          return shell || Response.error();
        })
      );
      return;
    }

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
