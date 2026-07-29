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
}

export interface CacheAreaResult {
  cached: number;
  failed: number;
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
const MAX_TILES_PER_SAVE = 550;

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

export function latLngToTile(lat: number, lng: number, zoom: number) {
  const normalizedLng = normalizeLng(lng);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const n = 2 ** zoom;
  const x = Math.floor(((normalizedLng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log((1 + sinLat) / (1 - sinLat)) / Math.PI) / 2) * n);

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
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as OfflineArea[];
  } catch {
    return [];
  }
}

export function saveOfflineAreas(areas: OfflineArea[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(areas));
}

export function removeOfflineAreaById(id: string): OfflineArea[] {
  const next = readOfflineAreas().filter((area) => area.id !== id);
  saveOfflineAreas(next);
  return next;
}

function uniqueTileUrls(bounds: OfflineAreaBounds, zoomLevels: number[], template: string) {
  const merged = new Set<string>();
  zoomLevels.forEach((zoom) => {
    getTileUrlsForBounds(bounds, zoom, template).forEach((url) => merged.add(url));
  });
  return Array.from(merged).slice(0, MAX_TILES_PER_SAVE);
}

export async function cacheMapTilesForArea(
  bounds: OfflineAreaBounds,
  zoomLevels: number[],
  template: string = DEFAULT_TILE_TEMPLATE
): Promise<CacheAreaResult> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return { cached: 0, failed: 0 };
  }

  const urls = uniqueTileUrls(bounds, zoomLevels, template);
  if (urls.length === 0) {
    return { cached: 0, failed: 0 };
  }

  const cache = await caches.open(CACHE_NAME);

  let cached = 0;
  let failed = 0;

  await Promise.all(
    urls.map(async (url) => {
      try {
        const request = new Request(url, { method: 'GET' });
        const existing = await cache.match(request);
        if (existing) {
          cached += 1;
          return;
        }

        const response = await fetch(request);
        if (!response.ok) {
          failed += 1;
          return;
        }

        await cache.put(request, response.clone());
        cached += 1;
      } catch {
        failed += 1;
      }
    })
  );

  return { cached, failed };
}

