import { readLocalJson, writeLocal } from './safe-storage';

export interface OfflineAreaBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OfflineArea {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  bounds: OfflineAreaBounds;
  cachedTiles: number;
  failedTiles: number;
  createdAt: string;
  /**
   * Hvilket bakgrunnskart og hvilke zoomnivåer som faktisk ble lagret. Uten
   * disse kan ikke sletting regne ut igjen hvilke fliser området eier — og da
   * ble «Slett» bare en fjerning fra lista, mens flisene ble liggende i
   * CacheStorage for alltid. Valgfrie: områder lagret før dette mangler dem, og
   * ryddes da med alle tre malene (se removeOfflineAreaTiles).
   */
  tileTemplate?: string;
  zoomLevels?: number[];
}

export interface CacheAreaResult {
  /** Fliser som ligger i cachen etterpå. Alltid minst én — se NoTilesCachedError. */
  cached: number;
  failed: number;
}

/**
 * Kastes av cacheMapTilesForArea når ikke én eneste flis for området ligger i
 * cachen etter forsøket: ingen dekning, et nett som ikke svarer, en flisserver
 * som bare gir feil, full lagring — eller en nettleser uten CacheStorage.
 *
 * Hvorfor en feil, og ikke { cached: 0, failed: N } som før: kartets «Lagre
 * kartområde» legger resultatet øverst i lista over lagrede områder og kaster
 * det eldste ut når lista er full — med flisene. Et «område» uten fliser er
 * ikke et offline-kart. På én strek byttet det ut et ekte, nedlastet område mot
 * et tomt, akkurat der det gamle ikke kan lastes ned igjen, og hvert nytt
 * forsøk tok ett til. Kvitteringen sa dessuten «Området ble lagret».
 *
 * Det var mulig også før (uten nett kastet hver fetch med en gang), men ble
 * vanlig da lagringen fikk frist og begynte å bli ferdig på et nett som
 * henger. Et avvist løfte kan ikke leses som en lagring: kallstedet havner i
 * sin catch, lista og flisene står urørt.
 */
export class NoTilesCachedError extends Error {
  /** Hvor mange fliser som ble forsøkt og feilet (0 når ingenting kunne forsøkes). */
  readonly failed: number;

  constructor(failed: number) {
    super('No map tiles could be stored for the offline area');
    this.name = 'NoTilesCachedError';
    this.failed = failed;
  }
}

/**
 * Kastes av cacheMapTilesForArea når området trenger flere fliser enn én
 * lagring tar (MAX_TILES_PER_SAVE). Ingenting er hentet eller lagret da.
 *
 * Før ble lista over fliser bare kuttet ved taket, uten et ord. Det som falt
 * bort var det som sto sist i lista, og det er ikke tilfeldig hva som står
 * sist: flisene legges ut nivå for nivå, vest mot øst. Med hele landet i
 * utsnittet (zoom 4 på en telefon) tok det mest detaljerte nivået alle 550
 * plassene med den vestlige delen av seg selv, og nivået brukeren faktisk så
 * på — det offline-siden tegner — ble ikke lagret i det hele tatt. Kvitteringen
 * sa «Område lagret. 550 kartfliser klare offline», og uten dekning var kartet
 * blankt.
 *
 * Et område som ikke får plass, er ikke et halvt offline-kart; det er et som
 * ikke kan lagres slik. Kallstedet ber brukeren zoome inn.
 */
export class OfflineAreaTooLargeError extends Error {
  /** Hvor mange fliser området trenger. */
  readonly tiles: number;
  /** Hvor mange én lagring tar. */
  readonly limit: number;

  constructor(tiles: number, limit: number) {
    super('The offline area needs more map tiles than one save can store');
    this.name = 'OfflineAreaTooLargeError';
    this.tiles = tiles;
    this.limit = limit;
  }
}

const STORAGE_KEY = 'mycelet.offline-areas.v1';

// The three base-map tile templates, kept in one place so MushroomMap builds its
// Leaflet layers from the SAME strings the offline cache warms — no drift. The
// offline cache must follow the ACTIVE base map: Kartverket "Terreng" is blank
// outside Norway, so saving a Swedish area with it would cache nothing usable.
export const TERRAIN_TILE_TEMPLATE = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';
export const OSM_TILE_TEMPLATE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const SATELLITE_TILE_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const DEFAULT_TILE_TEMPLATE = TERRAIN_TILE_TEMPLATE;
const CACHE_NAME = 'mycelet-map-tiles-v1';
/**
 * Så mange fliser tar én lagring. Et vanlig utsnitt bruker langt færre: 20–35
 * på en telefon og rundt 70 på en stor skjerm fra zoom 7 og innover, opptil
 * 270 på zoom 5–6. Taket nås først når utsnittet dekker et helt land (zoom 4
 * på en telefon, zoom 5 på en stor skjerm). Da avvises lagringen — se
 * OfflineAreaTooLargeError.
 */
export const MAX_TILES_PER_SAVE = 550;

/**
 * Dypeste EKTE flisnivå hvert bakgrunnskart har. Kartet lar brukeren zoome
 * dypere (til 20) ved å forstørre disse flisene, så det er disse tallene
 * Leaflet-lagene i MushroomMap bruker som maxNativeZoom — og de offline-
 * lagringen må holde seg innenfor: en flis på nivå 19 finnes ikke hos
 * Kartverket.
 */
export const MAX_NATIVE_ZOOM: Readonly<Record<string, number>> = {
  [TERRAIN_TILE_TEMPLATE]: 18,
  [OSM_TILE_TEMPLATE]: 19,
  [SATELLITE_TILE_TEMPLATE]: 19
};

/** Oversiktsnivået går aldri grovere enn dette. */
const MIN_OVERVIEW_ZOOM = 8;

/**
 * Hvilke zoomnivåer som lagres for et utsnitt, og hvilket av dem som er
 * «områdets» nivå.
 *
 *  - Nivået brukeren ser på står FØRST. Flisene hentes i den rekkefølgen de
 *    står, og det er dette nivået offline-siden tegner. Dør nettet midt i
 *    lagringen, er det dette som bør være komplett — før sto oversiktsnivået
 *    først.
 *  - Så oversikten (ett nivå ut, aldri grovere enn 8), så detaljene (ett nivå
 *    inn).
 *  - Ingenting dypere enn bakgrunnskartet faktisk har. Kartet kan stå på zoom
 *    19–20 ved å forstørre nivå 18; da er det nivå 18 som skal lagres. Før ble
 *    nivå 19 og 20 forsøkt hentet hos Kartverket, som ikke har dem: hver av de
 *    flisene feilet, og området ble husket med et zoomnivå offline-siden ikke
 *    fant én eneste flis for.
 */
export function offlineZoomLevels(
  viewZoom: number,
  template: string = DEFAULT_TILE_TEMPLATE
): { zoom: number; zoomLevels: number[] } {
  const deepest = MAX_NATIVE_ZOOM[template] ?? 18;
  const zoom = Math.max(0, Math.min(deepest, Math.round(viewZoom)));
  const overview = Math.max(MIN_OVERVIEW_ZOOM, zoom - 1);
  const detail = Math.min(deepest, zoom + 1);
  return { zoom, zoomLevels: Array.from(new Set([zoom, overview, detail])) };
}

// Lagringen hentet alle flisene (opptil 550) i én Promise.all uten frist. Én
// flis som verken svarte eller feilet — det vanlige på én strek dekning — holdt
// «lagrer …» åpen for alltid, og området ble aldri registrert.
//
// Nå: en liten kø og en frist per flis. Køen er ikke pynt — med 550 samtidige
// fetch stiller nettleseren dem bak ~6 forbindelser per vert, og en frist som
// startet da forespørselen ble OPPRETTET ville avbrutt friske fliser som bare
// sto i kø. Fristen starter derfor først når en arbeider faktisk sender.
export const TILE_FETCH_CONCURRENCY = 6;
export const TILE_FETCH_TIMEOUT_MS = 15_000;
// Henger nettet helt, skal ikke 550 fliser × 15 s ventes ut (over 20 minutter).
// Etter så mange frister på rad uten ett eneste svar regnes resten som feilet.
export const TILE_TIMEOUTS_BEFORE_GIVING_UP = 12;

// Match Leaflet's own subdomain distribution so the URLs we pre-cache are
// byte-identical to the ones Leaflet requests when it later renders offline
// (default subdomains 'abc', index = |x + y| % 3). If these diverge, the {s}
// tiles Leaflet asks for miss the cache and the map goes blank.
function subdomainFor(x: number, y: number): string {
  const subdomains = 'abc';
  return subdomains[Math.abs(x + y) % subdomains.length];
}

function buildTileUrl(template: string, x: number, y: number, zoom: number): string {
  return template
    .replace('{s}', subdomainFor(x, y))
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLng(lng: number) {
  let value = lng;
  while (value < -180) value += 360;
  while (value > 180) value -= 360;
  return value;
}

/**
 * Breddegrad/lengdegrad → flis-koordinat i Web Mercator (EPSG:3857), samme
 * projeksjon Leaflet og Kartverket bruker.
 *
 * ⚠️ NEVNEREN ER 2π, IKKE π. Det var feilen: `ln((1+sin φ)/(1−sin φ))` er
 * *to ganger* `atanh(sin φ)`, så uten halvparten blir y-forskyvningen dobbelt så
 * stor. Hver nordisk breddegrad havnet da på 80–86 °N, og Tromsø regnet ut
 * y = −384 og ble klemt til Nordpolen.
 *
 * Konsekvensen var ikke synlig i appen, for Leaflet regner selv ut flisene den
 * VISER. Bare offline-nedlastingen brukte denne funksjonen — så «Lagre
 * kartområde» hentet tomt hav, og kvitteringen sa «550 kartfliser klare
 * offline». Målt for Oslo på zoom 12: den gamle formelen ga flis y=335, som er
 * 854 bytes tomt Nordishav. Riktig flis er y=1191 og 111 250 bytes med kart i.
 *
 * Den gamle testen sjekket `tile.y >= 0`, som er sant for enhver breddegrad —
 * også en gal. Se __tests__/offlineMap.test.ts for den som faktisk kan feile.
 */
export function latLngToTile(lat: number, lng: number, zoom: number) {
  const normalizedLng = normalizeLng(lng);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const n = 2 ** zoom;
  const x = Math.floor(((normalizedLng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2) * n);

  return {
    x: clamp(x, 0, n - 1),
    y: clamp(y, 0, n - 1)
  };
}

export function getTileUrlsForBounds(
  bounds: OfflineAreaBounds,
  zoom: number,
  template: string = DEFAULT_TILE_TEMPLATE
): string[] {
  const northWest = latLngToTile(bounds.north, bounds.west, zoom);
  const southEast = latLngToTile(bounds.south, bounds.east, zoom);

  const minX = Math.min(northWest.x, southEast.x);
  const maxX = Math.max(northWest.x, southEast.x);
  const minY = Math.min(northWest.y, southEast.y);
  const maxY = Math.max(northWest.y, southEast.y);

  const urls: string[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      urls.push(buildTileUrl(template, x, y, zoom));
    }
  }

  return urls;
}

export function readOfflineAreas(): OfflineArea[] {
  const parsed = readLocalJson<unknown>(STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed as OfflineArea[];
}

export function saveOfflineAreas(areas: OfflineArea[]) {
  writeLocal(STORAGE_KEY, JSON.stringify(areas));
}

/**
 * Flis-URL-ene ETT område eier.
 *
 * Kjenner vi malen og zoomnivåene (lagret fra og med denne versjonen), regner vi
 * ut nøyaktig det settet. Gjør vi ikke det — gamle områder — tar vi alle tre
 * bakgrunnskartene på zoom−1/zoom/zoom+1, som er akkurat det lagringen den gang
 * kunne ha brukt. Å slette en URL som ikke ligger i cachen er en no-op, så det
 * brede settet koster ingenting utover litt tid.
 */
export function offlineAreaTileUrls(area: OfflineArea): string[] {
  const zoomLevels =
    area.zoomLevels && area.zoomLevels.length > 0
      ? area.zoomLevels
      : Array.from(new Set([Math.max(8, area.zoom - 1), area.zoom, Math.min(18, area.zoom + 1)]));
  const templates = area.tileTemplate
    ? [area.tileTemplate]
    : [TERRAIN_TILE_TEMPLATE, OSM_TILE_TEMPLATE, SATELLITE_TILE_TEMPLATE];

  const urls = new Set<string>();
  for (const template of templates) {
    for (const zoom of zoomLevels) {
      for (const url of getTileUrlsForBounds(area.bounds, zoom, template)) urls.add(url);
    }
  }
  return Array.from(urls);
}

/**
 * Slett områdets fliser fra CacheStorage.
 *
 * Uten denne frigjorde «Slett» null lagring: removeOfflineAreaById rørte bare
 * localStorage, så området forsvant fra lista mens flisene ble liggende. En
 * Kartverket-topoflis er rundt 74 kB og hver lagring tar inntil 550 av dem, så
 * en sesong med lagrede områder bygger opp hundrevis av megabyte brukeren ikke
 * kan se eller rydde. På iOS øker det sjansen for at WKWebView kaster HELE
 * originens lagring under press — inkludert kartene han betalte for.
 *
 * `behold` er områdene som fortsatt skal virke uten dekning etterpå. Fliser de
 * også eier, blir liggende. To lagrede områder som overlapper, deler fliser —
 * det er samme URL — og uten dette tok slettingen av det ene med seg kartet til
 * det andre: området sto igjen i lista med «550 fliser» og var blankt i skogen.
 * Verst var det ved lagring med full liste. Dekket det eldste området, som da
 * kastes ut, samme sted som det nye (samme skog lagret før hver tur), ble
 * flisene til området som NETTOPP var lagret, slettet i samme øyeblikk.
 *
 * Returnerer antall fliser som faktisk lå der og ble fjernet.
 */
export async function removeOfflineAreaTiles(area: OfflineArea, behold: readonly OfflineArea[] = []): Promise<number> {
  if (typeof window === 'undefined' || !('caches' in window)) return 0;
  try {
    const vernet = new Set<string>();
    for (const annet of behold) {
      if (annet.id === area.id) continue;
      for (const url of offlineAreaTileUrls(annet)) vernet.add(url);
    }
    const urls = offlineAreaTileUrls(area).filter((url) => !vernet.has(url));
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          return (await cache.delete(url)) ? 1 : 0;
        } catch {
          return 0;
        }
      })
    );
    return results.reduce((sum: number, n) => sum + n, 0);
  } catch {
    return 0;
  }
}

export function removeOfflineAreaById(id: string): OfflineArea[] {
  const next = readOfflineAreas().filter((area) => area.id !== id);
  saveOfflineAreas(next);
  return next;
}

/** Tøm hele flis-cachen. Tjenestearbeideren fyller den også på ved vanlig bruk. */
export async function clearMapTileCache(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    return await caches.delete(CACHE_NAME);
  } catch {
    return false;
  }
}

/** Omtrentlig lagringsbruk for hele originen, i megabyte. Null når ukjent. */
export async function estimateStorageMb(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage } = await navigator.storage.estimate();
    if (usage == null) return null;
    return Math.round((usage / (1024 * 1024)) * 10) / 10;
  } catch {
    return null;
  }
}

/**
 * Alle flisene området trenger, i den rekkefølgen nivåene er oppgitt. IKKE
 * kuttet: et kutt her er usynlig for den som lagrer — se
 * OfflineAreaTooLargeError.
 */
function uniqueTileUrls(bounds: OfflineAreaBounds, zoomLevels: number[], template: string) {
  const merged = new Set<string>();
  zoomLevels.forEach((zoom) => {
    getTileUrlsForBounds(bounds, zoom, template).forEach((url) => merged.add(url));
  });
  return Array.from(merged);
}

/** Hvor mange fliser en lagring av området vil hente og lagre. */
export function countTilesForArea(
  bounds: OfflineAreaBounds,
  zoomLevels: number[],
  template: string = DEFAULT_TILE_TEMPLATE
): number {
  return uniqueTileUrls(bounds, zoomLevels, template).length;
}

/**
 * Laster ned og lagrer flisene for et område.
 *
 * Løses med tellingen når MINST ÉN flis ligger i cachen etterpå (også fliser
 * som lå der fra før). `failed` er flisene som mangler: kallstedet skal si fra
 * om dem, for et område med hull er ikke «klart offline».
 *
 * Avvises med
 *  - OfflineAreaTooLargeError når området trenger flere fliser enn én lagring
 *    tar. Ingenting er hentet da.
 *  - NoTilesCachedError når ikke én flis ligger i cachen etterpå — et område
 *    uten fliser skal ikke registreres som lagret.
 * Se klassene over.
 */
export async function cacheMapTilesForArea(
  bounds: OfflineAreaBounds,
  zoomLevels: number[],
  template: string = DEFAULT_TILE_TEMPLATE
): Promise<CacheAreaResult> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    throw new NoTilesCachedError(0);
  }

  const urls = uniqueTileUrls(bounds, zoomLevels, template);
  if (urls.length === 0) {
    throw new NoTilesCachedError(0);
  }
  // FØR cachen åpnes og første flis hentes: alt eller ingenting.
  if (urls.length > MAX_TILES_PER_SAVE) {
    throw new OfflineAreaTooLargeError(urls.length, MAX_TILES_PER_SAVE);
  }

  const cache = await caches.open(CACHE_NAME);

  let cached = 0;
  let failed = 0;

  let next = 0;
  let timeoutsInARow = 0;

  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      // Nettet svarer ikke i det hele tatt: tell resten ærlig som feilet.
      if (timeoutsInARow >= TILE_TIMEOUTS_BEFORE_GIVING_UP) {
        failed += 1;
        continue;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        const request = new Request(url, { method: 'GET' });
        const existing = await cache.match(request);
        if (existing) {
          cached += 1;
          continue;
        }

        // AbortController + setTimeout, ikke AbortSignal.timeout: den siste
        // finnes ikke i eldre WKWebView. Fristen dekker også lesingen av
        // kroppen i cache.put, derfor ryddes den først i finally.
        const controller = new AbortController();
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, TILE_FETCH_TIMEOUT_MS);

        const response = await fetch(request, { signal: controller.signal });
        if (!response.ok) {
          timeoutsInARow = 0;
          failed += 1;
          continue;
        }

        await cache.put(request, response.clone());
        timeoutsInARow = 0;
        cached += 1;
      } catch {
        if (timedOut) timeoutsInARow += 1;
        failed += 1;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(TILE_FETCH_CONCURRENCY, urls.length) }, worker));

  if (cached === 0) throw new NoTilesCachedError(failed);

  return { cached, failed };
}

