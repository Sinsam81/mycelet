// v2 (2026-07-19): byte-bump to force reinstall on every client. A service
// worker runs under the CSP captured when its script was fetched, so widening
// the header (PR #85, OSM/Esri in connect-src) never reached already-installed
// workers — an unchanged script skips reinstall. Any byte change here re-runs
// install; skipWaiting/clients.claim swap the new worker in immediately.
// MERK om nummereringen: kommentarene under (v2, v3, v4 …) er en endringslogg
// for FILA. Tallet i cache-navnet er noe annet — det er identiteten til selve
// lagringen, og skal bare økes når vi VIL kaste alt som ligger der (activate
// sletter enhver cache som ikke heter noe av det to under). De to teller derfor
// ikke i takt, og det er meningen.
const STATIC_CACHE = 'mycelet-static-v3';
const TILE_CACHE = 'mycelet-map-tiles-v1'; // unchanged: users' saved offline tiles live here

// v5 (2026-08-02): STATIC_CACHE beskjæres.
//
// Navnet 'mycelet-static-v3' står stille mellom utrullinger, mens filnavnene
// under /_next/static/ er innholdshashet og altså NYE ved hver bygging. Cachen
// vokste derfor monotont: ~2 MB død JS/CSS per deploy som ingenting ryddet bort.
// Etter noen titalls utrullinger snakker vi 50-100 MB i samme lagringskvote som
// kartflisene — og på iOS kaster WKWebView hele originens lagring når det blir
// trangt. Da ryker offline-flisene brukeren har BETALT for.
//
// Vi beskjærer til de nyeste oppføringene i stedet for å bumpe navnet, fordi
// beskjæringen også rydder opp i cacher som allerede har vokst seg store hos
// eksisterende brukere. Precachede ressurser (offline-skallet, ikonene) er
// unntatt: de ligger først i cachen og ville vært de første til å ryke.
const STATIC_CACHE_MAX_ENTRIES = 80;

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
//     (v6 legger til ett tilfelle til: nettet svarer ikke i det hele tatt.)
const OFFLINE_SHELL = '/offline';

// v6 (2026-11-10): navigasjoner har en frist.
//
// v4 viste skallet bare når fetch() KASTET — altså i flymodus. I skogen er det
// vanlige tilfellet et annet: telefonen har én strek, forbindelsen er «oppe»,
// og fetch() verken svarer eller feiler før WebViewens egen frist (rundt et
// minutt). Imens sto brukeren med hvit skjerm, og det lagrede kartet hen har
// betalt for kom aldri fram.
//
// Nå løper navigasjonen mot en klokke. Kommer det ikke så mye som svarhoder på
// NAVIGATION_TIMEOUT_MS, vises skallet — hvis det ligger i cachen. Gjør det
// ikke det, venter vi videre på nettet akkurat som før.
// Et svar som rekker fram i tide vinner alltid, så en påkoblet bruker merker
// ingenting, og freskhetsregelen fra v3 står: skallet er statisk og har verken
// artsdata eller sikkerhetstekst. URL-en står stille, så «Prøv igjen» i
// skallet går til siden brukeren ba om.
//
// IKKE fjern fristen som «unødvendig» fordi catch-grenen finnes: de to dekker
// hvert sitt tilfelle (kastet / svarte aldri).
//
// Unntak: /auth/ og /api/. En treg innloggingsretur (/auth/callback?code=…)
// fullføres på serveren selv om vi viser skallet, og bruker da opp
// engangskoden — «Prøv igjen» ville feilet. Slike navigasjoner får vente.
const NAVIGATION_TIMEOUT_MS = 10000;

// v7 (2026-11-10): fristen gjelder bare FØRSTE forsøk.
//
// v6 hadde et hull. Skallet precaches for alle, ikke bare for dem som har
// lagret et kart, så fristen traff enhver besøkende på tregt nett: kom første
// byte etter 14 s, ble siden byttet ut med skallet etter 10, svaret som var på
// vei ble kastet — og «Prøv å laste appen på nytt» startet en ny forespørsel
// som ble kuttet på nøyaktig samme måte. Så lenge nettet var tregere enn
// fristen kunne siden ikke lastes i det hele tatt, der v5 leverte den etter
// ventetiden.
//
// Nå huskes adressen som fikk skallet (networkWaits), og NESTE navigasjon dit
// går til nettet uten frist. Unntaket brukes opp av det ene forsøket.
//
// Det foreldes dessuten etter WAIT_FOR_NETWORK_MS, og det er kort med vilje.
// Workeren kan ikke se forskjell på en bruker som laster på nytt og en WebView
// som laster på nytt av seg selv — iOS kan kaste innholdsprosessen mens appen
// ligger i bakgrunnen (en tur i kameraet), og siden lastes da på nytt når
// brukeren kommer tilbake. Uten dekning ville et unntak som lå igjen gitt hvit
// skjerm til WebViewens egen frist, altså nøyaktig det v6 skulle fjerne. Et
// halvt minutt dekker den som laster på nytt med en gang; det er også omtrent
// så lenge Chrome lar en ledig worker leve.
//
// For alt som kommer senere sier skallets knapp fra selv, med en melding rett
// før den laster på nytt — se message-lytteren under respondToNavigation og
// retryWithNetworkWait i public/offline/offline-map.js. Meldingsnavnet må være
// likt i de to filene.
const WAIT_FOR_NETWORK_MS = 30 * 1000;
const WAIT_FOR_NETWORK_MESSAGE = 'mycelet:wait-for-network';
/** Adresse (uten fragment) → tidspunktet i ms da unntaket fra fristen foreldes. */
const networkWaits = new Map();

// '/icons/icon-maskable.svg' er fjernet herfra: den er ikke referert noe sted i
// appen (manifestene bruker icon-512.png som maskable), så den var en
// installasjonsnedlasting ingen kunne be om — og med beskjæringen under ville
// den i tillegg okkupert en av de vernede plassene for alltid.
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
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

/** Ressursene install() la inn. Disse skal aldri beskjæres bort. */
function isPrecachedAsset(url) {
  return STATIC_ASSETS.some((asset) => new URL(asset, self.location.origin).href === url);
}

/**
 * Hold STATIC_CACHE under taket. cache.keys() kommer i innsettingsrekkefølge,
 * altså eldst først — vi kaster fra toppen, men hopper over precachede
 * ressurser (de ble lagt inn ALLER først og ville ellers gått først).
 */
async function trimStaticCache(cache) {
  const keys = await cache.keys();
  let excess = keys.length - STATIC_CACHE_MAX_ENTRIES;
  if (excess <= 0) return;

  for (const request of keys) {
    if (excess <= 0) break;
    if (isPrecachedAsset(request.url)) continue;
    await cache.delete(request);
    excess--;
  }
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

/** Offline-skallet fra precachen, eller undefined. Kaster aldri. */
function offlineShell() {
  return caches
    .open(STATIC_CACHE)
    .then((cache) => cache.match(OFFLINE_SHELL))
    .catch(() => undefined);
}

/** Navigasjoner som ikke tåler å bli byttet ut med skallet mens serveren jobber. */
function isOneShotNavigation(url) {
  return url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/');
}

/** To navigasjoner til samme side skal treffe samme oppføring, med eller uten #fragment. */
function navigationKey(url) {
  return url.origin + url.pathname + url.search;
}

/** Neste navigasjon til adressen får vente på nettet uten frist. */
function allowNetworkWait(key) {
  const now = Date.now();
  // Rydd her, ikke på en klokke: oppføringer kommer bare til etter en frist
  // eller et trykk i skallet, så kartet holder seg på en håndfull adresser.
  for (const [other, expires] of networkWaits) {
    if (expires <= now) networkWaits.delete(other);
  }
  networkWaits.set(key, now + WAIT_FOR_NETWORK_MS);
}

/** Bruker opp unntaket for adressen. true hvis det fantes og ikke var foreldet. */
function takeNetworkWait(key) {
  const expires = networkWaits.get(key);
  if (expires === undefined) return false;
  networkWaits.delete(key);
  return expires > Date.now();
}

/**
 * Svaret kom etter at skallet var vist, og ingen skal ha det. Avbryt
 * nedlastingen av kroppen, så den ikke deler en tynn linje med neste forsøk.
 */
function discardLateResponse(response) {
  try {
    if (response && response.body) response.body.cancel().catch(() => undefined);
  } catch (error) {
    // Kroppen var låst eller allerede lest: ingenting å rydde.
  }
}

/**
 * Nettet først; skallet når nettet kaster, eller ikke har svart innen fristen.
 * Løftet som returneres løses ALLTID med en Response og avvises aldri — et
 * respondWith() som avvises gir brukeren en død side.
 *
 * ⚠️ fetch(request) skal stå UTEN init-objekt. Det er fristende å avbryte den
 * foreldreløse forespørselen med fetch(request, { signal }), men ethvert
 * init-objekt gjør en navigasjon om til en vanlig forespørsel (Fetch-standarden,
 * Request-konstruktøren): mode blir 'same-origin' og referrer blir workeren
 * selv. Serveren ser da ikke lenger en navigasjon — /api/prove/svar skriver for
 * eksempel bare når Sec-Fetch-Mode er 'navigate'. Vi nøyer oss med å avbryte
 * NEDLASTINGEN av svaret som kommer for sent (discardLateResponse).
 */
function respondToNavigation(request, url) {
  // Kastet fetch (ingen dekning): skallet, ellers en vanlig nettverksfeil.
  const network = fetch(request).catch(() => offlineShell().then((shell) => shell || Response.error()));

  if (isOneShotNavigation(url)) return network;

  // Forrige forsøk på denne adressen endte i skallet. Dette er brukeren som
  // prøver igjen: da venter vi på nettet, slik v5 gjorde (se v7 øverst).
  const key = navigationKey(url);
  if (takeNetworkWait(key)) return network;

  return new Promise((resolve) => {
    let networkAnswered = false;
    let shellServed = false;

    const timer = setTimeout(() => {
      offlineShell().then((shell) => {
        // Nettet rakk fram mens vi slo opp skallet: siden er levert, og da
        // skal adressen heller ikke huskes som «svarte ikke».
        if (networkAnswered) return;
        // Uten skall har vi ikke noe bedre å by på enn å vente videre på nettet.
        if (!shell) return;

        shellServed = true;
        allowNetworkWait(key);
        resolve(shell);
      });
    }, NAVIGATION_TIMEOUT_MS);

    network.then((response) => {
      clearTimeout(timer);
      if (shellServed) {
        discardLateResponse(response);
        return;
      }
      networkAnswered = true;
      resolve(response);
    });
  });
}

// Skallets «Prøv å laste appen på nytt» sender denne rett før den laster på
// nytt. Uten den gjelder unntaket fra fristen bare det første halve minuttet,
// og bare så lenge workeren har levd siden fristen gikk ut — leser brukeren
// skallet litt først, ville forsøket blitt kuttet en gang til.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== WAIT_FOR_NETWORK_MESSAGE || typeof data.url !== 'string') return;

  try {
    const url = new URL(data.url, self.location.origin);
    if (url.origin === self.location.origin) allowNetworkWait(navigationKey(url));
  } catch (error) {
    // Ugyldig adresse: da finnes det heller ingen navigasjon å gi fri.
  }
});

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
    // fetch() feiler (ingen dekning) eller ikke svarer innen fristen (én strek,
    // se v6 øverst) svarer vi med offline-skallet, som viser de lagrede
    // kartområdene. URL-en i adressefeltet står stille, så brukeren kommer
    // tilbake til siden hen ba om ved neste forsøk.
    if (event.request.mode === 'navigate') {
      event.respondWith(respondToNavigation(event.request, requestUrl));
      return;
    }

    if (!isCacheableStaticRequest(requestUrl)) return;

    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);

        const networkFetch = fetch(event.request)
          .then(async (response) => {
            if (response && response.ok) {
              await cache.put(event.request, response.clone());
              await trimStaticCache(cache);
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
