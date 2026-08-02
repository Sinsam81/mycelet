/**
 * Offline-skallet — den eneste SIDEN i Mycelet som kan åpnes uten nett.
 *
 * Hvorfor en frittstående fil i public/ og ikke en vanlig Next-side:
 *
 *   • Service workeren precacher denne siden ved installasjon. En Next-side
 *     drar med seg RSC-nyttelast og /_next/static-biter som ikke ligger i
 *     cachen før brukeren har besøkt nøyaktig den siden — offline blir den da
 *     en hvit skjerm.
 *   • /map er auth-gated (PROTECTED_PATHS i src/lib/supabase/middleware.ts).
 *     Å precache den lagret i praksis en omdirigering til innloggingssiden for
 *     utloggede — derfor ble den fjernet igjen i PR #102. Denne siden er åpen
 *     og henter ingenting fra serveren: alt den viser ligger allerede i
 *     brukerens egen nettleser (localStorage + Cache API).
 *   • next-intl lever i React-bunten og finnes ikke her. Språket leses av samme
 *     cookie, og teksten ligger i COPY under — samme løsning som den statiske
 *     landingssiden i public/landing/.
 *
 * Funksjonene øverst er rene og testes fra
 * src/lib/utils/__tests__/offline-shell.test.ts. Én av testene sammenligner
 * flis-URL-ene herfra mot dem src/lib/utils/offlineMap.ts LAGRET — de to må
 * være byte-identiske, ellers bommer oppslaget i cachen og kartet blir tomt.
 */

export const TILE_SIZE = 256;
export const TILE_CACHE_NAME = 'mycelet-map-tiles-v1';
export const AREAS_STORAGE_KEY = 'mycelet.offline-areas.v1';
export const LOCALE_COOKIE = 'MYCELET_LOCALE';

/** Så stort rutenett vi tegner. 12 × 12 fliser = 3072 px, rikelig å panorere i. */
export const MAX_GRID_SPAN = 12;

/**
 * Samme tre maler som TERRAIN/OSM/SATELLITE i src/lib/utils/offlineMap.ts.
 * Et lagret område husker ikke hvilket bakgrunnskart det ble lagret med, så vi
 * prøver alle tre mot cachen og bruker den som faktisk ligger der.
 */
export const TILE_TEMPLATES = [
  'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLng(lng) {
  let value = lng;
  while (value < -180) value += 360;
  while (value > 180) value -= 360;
  return value;
}

/** Leaflets standardfordeling av {s}: subdomains 'abc', indeks |x + y| % 3. */
export function subdomainFor(x, y) {
  const subdomains = 'abc';
  return subdomains[Math.abs(x + y) % subdomains.length];
}

export function tileUrl(template, x, y, zoom) {
  return template
    .replace('{s}', subdomainFor(x, y))
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Breddegrad/lengdegrad → piksel i verdensrutenettet (Web Mercator, EPSG:3857).
 * NB: nevneren er 2π. Se den lange kommentaren over latLngToTile i
 * src/lib/utils/offlineMap.ts — halvparten manglet der en gang, og da havnet
 * hele Norden i Nordishavet.
 */
export function latLngToPixel(lat, lng, zoom) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.sin((clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180);

  return {
    x: ((normalizeLng(lng) + 180) / 360) * worldSize,
    y: ((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2) * worldSize
  };
}

export function latLngToTile(lat, lng, zoom) {
  const n = 2 ** zoom;
  const pixel = latLngToPixel(lat, lng, zoom);

  return {
    x: clamp(Math.floor(pixel.x / TILE_SIZE), 0, n - 1),
    y: clamp(Math.floor(pixel.y / TILE_SIZE), 0, n - 1)
  };
}

/**
 * Flisene som dekker et lagret område på ett zoomnivå, som et rutenett vi kan
 * legge ut i faste piksler. Større områder klippes rundt midten — et stort
 * skjermbilde lagret på PC kan ellers bli hundrevis av fliser.
 */
export function buildTileGrid(bounds, zoom, maxSpan = MAX_GRID_SPAN) {
  const n = 2 ** zoom;
  const northWest = latLngToTile(bounds.north, bounds.west, zoom);
  const southEast = latLngToTile(bounds.south, bounds.east, zoom);

  let minX = Math.min(northWest.x, southEast.x);
  let maxX = Math.max(northWest.x, southEast.x);
  let minY = Math.min(northWest.y, southEast.y);
  let maxY = Math.max(northWest.y, southEast.y);

  if (maxX - minX + 1 > maxSpan) {
    const center = Math.floor((minX + maxX) / 2);
    minX = clamp(center - Math.floor(maxSpan / 2), 0, Math.max(0, n - maxSpan));
    maxX = Math.min(n - 1, minX + maxSpan - 1);
  }
  if (maxY - minY + 1 > maxSpan) {
    const center = Math.floor((minY + maxY) / 2);
    minY = clamp(center - Math.floor(maxSpan / 2), 0, Math.max(0, n - maxSpan));
    maxY = Math.min(n - 1, minY + maxSpan - 1);
  }

  const columns = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const tiles = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({ x: minX + column, y: minY + row, column, row });
    }
  }

  return { zoom, minX, minY, columns, rows, tiles };
}

/**
 * Punkt → piksel inne i rutenettet over. Brukes til GPS-prikken: den skal stå
 * der brukeren faktisk står, ikke omtrentlig.
 */
export function projectToGrid(grid, lat, lng) {
  const pixel = latLngToPixel(lat, lng, grid.zoom);
  const x = pixel.x - grid.minX * TILE_SIZE;
  const y = pixel.y - grid.minY * TILE_SIZE;

  return {
    x,
    y,
    inside: x >= 0 && y >= 0 && x <= grid.columns * TILE_SIZE && y <= grid.rows * TILE_SIZE
  };
}

/** Lagrede områder fra localStorage. Alt som ikke er et brukbart område kastes. */
export function parseAreas(raw) {
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((area) => {
    if (!area || typeof area !== 'object') return false;
    if (typeof area.zoom !== 'number' || !Number.isFinite(area.zoom)) return false;
    const bounds = area.bounds;
    if (!bounds || typeof bounds !== 'object') return false;
    return ['north', 'south', 'east', 'west'].every(
      (key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key])
    );
  });
}

/* ------------------------------------------------------------------ */
/* Tekst. Ingen next-intl her — se filhodet.                            */
/* ------------------------------------------------------------------ */

const COPY = {
  nb: {
    headingOffline: 'Du er uten nett',
    headingOnline: 'Offline-kart',
    areasHeading: 'Lagrede kartområder',
    noAreas:
      'Du har ingen lagrede kartområder. Åpne kartet mens du har dekning og lagre området du skal gå i (krever Premium eller Sesongpass).',
    noCacheApi: 'Nettleseren din lagrer ikke kartfliser, så det finnes ingen områder å åpne uten nett.',
    open: 'Åpne',
    tiles: (count, zoom) => `${count} fliser • zoom ${zoom}`,
    tileCount: (found, total) =>
      found === total
        ? `Alle ${total} kartflisene ligger lagret på denne enheten.`
        : `${found} av ${total} kartfliser ligger lagret. De tomme rutene ble aldri lastet ned.`,
    noTiles: 'Ingen av kartflisene for dette området ligger lagret. Området må lagres på nytt når du har dekning.',
    positionSearching: 'Finner posisjonen din …',
    positionInside: (accuracy) => `Posisjonen din er merket på kartet (±${accuracy} m).`,
    positionOutside: 'Du står utenfor dette kartområdet.',
    positionDenied: 'Posisjon er ikke tillatt, så du vises ikke på kartet.',
    positionUnavailable: 'Fikk ikke tak i posisjonen din.',
    retry: 'Prøv å laste appen på nytt'
  },
  sv: {
    headingOffline: 'Du är utan nät',
    headingOnline: 'Offlinekarta',
    areasHeading: 'Sparade kartområden',
    noAreas:
      'Du har inga sparade kartområden. Öppna kartan medan du har täckning och spara området du ska gå i (kräver Premium eller Säsongspass).',
    noCacheApi: 'Din webbläsare sparar inga kartrutor, så det finns inga områden att öppna utan nät.',
    open: 'Öppna',
    tiles: (count, zoom) => `${count} rutor • zoom ${zoom}`,
    tileCount: (found, total) =>
      found === total
        ? `Alla ${total} kartrutor finns sparade på den här enheten.`
        : `${found} av ${total} kartrutor finns sparade. De tomma rutorna laddades aldrig ner.`,
    noTiles: 'Ingen av kartrutorna för det här området finns sparade. Området måste sparas om när du har täckning.',
    positionSearching: 'Hämtar din position …',
    positionInside: (accuracy) => `Din position är utmärkt på kartan (±${accuracy} m).`,
    positionOutside: 'Du står utanför det här kartområdet.',
    positionDenied: 'Position är inte tillåten, så du visas inte på kartan.',
    positionUnavailable: 'Kunde inte hämta din position.',
    retry: 'Försök ladda appen igen'
  }
};

export function readLocale(cookieString) {
  const match = /(?:^|;\s*)MYCELET_LOCALE=([^;]+)/.exec(cookieString || '');
  return match && match[1].trim() === 'sv' ? 'sv' : 'nb';
}

/* ------------------------------------------------------------------ */
/* Fra her og ned: DOM. Kjøres bare i nettleseren, aldri under test.    */
/* ------------------------------------------------------------------ */

function applyStaticCopy(locale) {
  document.documentElement.lang = locale === 'sv' ? 'sv' : 'nb';
  if (locale !== 'sv') return;

  document.querySelectorAll('[data-sv]').forEach((element) => {
    element.textContent = element.getAttribute('data-sv');
  });
}

function formatDate(iso, locale) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'nb-NO', {
    day: 'numeric',
    month: 'short'
  });
}

async function drawGrid(grid, elements, copy) {
  const { canvas, tileNote } = elements;

  // Bare flisene, ikke alt: posisjonsprikken er også barn av canvas, og et blankt
  // canvas.textContent = '' slettet den — da lå brukeren aldri på kartet.
  canvas.querySelectorAll('.tile').forEach((tile) => tile.remove());
  canvas.style.width = `${grid.columns * TILE_SIZE}px`;
  canvas.style.height = `${grid.rows * TILE_SIZE}px`;

  const cache = await caches.open(TILE_CACHE_NAME);
  let found = 0;

  await Promise.all(
    grid.tiles.map(async (tile) => {
      const cell = document.createElement('div');
      cell.className = 'tile';
      cell.style.left = `${tile.column * TILE_SIZE}px`;
      cell.style.top = `${tile.row * TILE_SIZE}px`;
      canvas.appendChild(cell);

      for (const template of TILE_TEMPLATES) {
        const response = await cache.match(tileUrl(template, tile.x, tile.y, grid.zoom));
        if (!response) continue;

        const image = document.createElement('img');
        image.alt = '';
        image.decoding = 'async';
        image.src = URL.createObjectURL(await response.blob());
        cell.appendChild(image);
        found += 1;
        return;
      }
    })
  );

  tileNote.textContent = found === 0 ? copy.noTiles : copy.tileCount(found, grid.tiles.length);
  return found;
}

function watchPosition(grid, elements, copy) {
  const { dot, positionNote } = elements;

  if (!('geolocation' in navigator)) {
    positionNote.textContent = copy.positionUnavailable;
    return;
  }

  positionNote.textContent = copy.positionSearching;

  navigator.geolocation.watchPosition(
    (position) => {
      const point = projectToGrid(grid, position.coords.latitude, position.coords.longitude);
      if (!point.inside) {
        dot.hidden = true;
        positionNote.textContent = copy.positionOutside;
        return;
      }

      dot.style.left = `${point.x}px`;
      dot.style.top = `${point.y}px`;
      dot.hidden = false;
      positionNote.textContent = copy.positionInside(Math.round(position.coords.accuracy ?? 0));
    },
    (error) => {
      dot.hidden = true;
      positionNote.textContent = error && error.code === 1 ? copy.positionDenied : copy.positionUnavailable;
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
}

async function init() {
  const locale = readLocale(document.cookie);
  const copy = COPY[locale];
  applyStaticCopy(locale);

  const elements = {
    heading: document.getElementById('offline-heading'),
    list: document.getElementById('area-list'),
    empty: document.getElementById('area-empty'),
    view: document.getElementById('map-view'),
    viewName: document.getElementById('map-name'),
    scroller: document.getElementById('map-scroller'),
    canvas: document.getElementById('map-canvas'),
    dot: document.getElementById('map-position'),
    tileNote: document.getElementById('tile-note'),
    positionNote: document.getElementById('position-note'),
    retry: document.getElementById('retry')
  };

  elements.heading.textContent = navigator.onLine ? copy.headingOnline : copy.headingOffline;
  elements.retry.textContent = copy.retry;
  elements.retry.addEventListener('click', () => window.location.reload());

  if (!('caches' in window)) {
    elements.empty.textContent = copy.noCacheApi;
    elements.empty.hidden = false;
    return;
  }

  let areas = [];
  try {
    areas = parseAreas(window.localStorage.getItem(AREAS_STORAGE_KEY));
  } catch {
    areas = [];
  }

  if (areas.length === 0) {
    elements.empty.textContent = copy.noAreas;
    elements.empty.hidden = false;
    return;
  }

  const showArea = async (area) => {
    const grid = buildTileGrid(area.bounds, area.zoom);
    elements.viewName.textContent = area.name || '';
    elements.view.hidden = false;
    elements.dot.hidden = true;

    await drawGrid(grid, elements, copy);

    // Sentrer på midten av området, ikke øverste venstre hjørne.
    const center = projectToGrid(grid, area.centerLat ?? 0, area.centerLng ?? 0);
    if (center.inside) {
      elements.scroller.scrollLeft = Math.max(0, center.x - elements.scroller.clientWidth / 2);
      elements.scroller.scrollTop = Math.max(0, center.y - elements.scroller.clientHeight / 2);
    }

    watchPosition(grid, elements, copy);
    elements.view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  areas.forEach((area) => {
    const item = document.createElement('li');

    const name = document.createElement('p');
    name.className = 'area-name';
    name.textContent = area.name || '—';

    const meta = document.createElement('p');
    meta.className = 'area-meta';
    const date = formatDate(area.createdAt, locale);
    meta.textContent = [copy.tiles(area.cachedTiles ?? 0, area.zoom), date].filter(Boolean).join(' • ');

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = copy.open;
    button.addEventListener('click', () => {
      void showArea(area);
    });

    item.append(name, meta, button);
    elements.list.appendChild(item);
  });
}

if (typeof document !== 'undefined' && document.getElementById('offline-shell')) {
  void init();
}
