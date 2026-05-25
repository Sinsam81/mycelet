/**
 * Swedish forest-type adapter — live CORINE Land Cover point query.
 *
 * Sweden's counterpart to NIBIO SR16 (src/lib/nibio). Unlike NIBIO there is
 * no anonymous live SLU Forest Map WMS, so v1 leans on **CORINE Land Cover
 * 2018** instead: a free, anonymous, pan-European land-cover dataset served
 * by the EEA over an ArcGIS MapServer `identify` endpoint. It tells us the
 * forest TYPE at a point (broad-leaved / coniferous / mixed) but nothing
 * about stand age, bonitet or volume — so those fields come back null and
 * habitat scoring leans on the tree-type match alone.
 *
 * Why CORINE over SLU for v1: it ships TODAY with zero account setup, covers
 * all of Sweden (and Europe), and the coniferous/broad-leaved/mixed split is
 * exactly the signal mycorrhizal scoring needs. SLU Forest Map (per-species
 * volume for tall/gran/contorta/björk/ek/bok) is richer and remains the
 * upgrade path — drop it in here behind the same ForestProperties shape and
 * nothing downstream changes. See [[sweden-forest-data-slu]].
 *
 * Resolution caveat: CORINE's minimum mapping unit is 25 ha (100 m raster),
 * so this is a landscape-scale signal, not a stand-level one like SR16.
 */

import { getRegion } from '@/lib/utils/region';
import type { ForestProperties, ForestType, HabitatQuery } from '@/lib/nibio/types';

/**
 * EEA's CORINE Land Cover 2018 (Web Mercator) ArcGIS MapServer. The
 * `identify` operation accepts a point in EPSG:4326 and reprojects server
 * side, so we never have to convert to Web Mercator ourselves.
 */
const CORINE_IDENTIFY_URL =
  'https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/identify';

const CORINE_TIMEOUT_MS = 8000;

/**
 * CORINE Land Cover level-3 codes (CODE_18) → our ForestType vocabulary.
 * Only the forest/woodland classes map; every other class (urban, water,
 * agriculture, …) is a definitive "not forest" → null, so the caller falls
 * back to the climate signal rather than scoring a non-forest cell.
 *
 *   311 Broad-leaved forest        → 'lauv'    (deciduous group)
 *   312 Coniferous forest          → 'bar'     (conifer group: gran/furu)
 *   313 Mixed forest               → 'blandet'
 *   324 Transitional woodland/shrub → 'blandet' (regenerating / scrubby forest)
 */
const CLC_CODE_TO_FOREST_TYPE: Readonly<Record<number, ForestType>> = {
  311: 'lauv',
  312: 'bar',
  313: 'blandet',
  324: 'blandet'
};

/** CORINE covers Sweden. Shares region.ts so the NO/SE split is one source of truth. */
export function isWithinSweden(query: HabitatQuery): boolean {
  return getRegion(query.lat, query.lon) === 'SE';
}

interface CorineResult {
  layerId?: number;
  value?: string | null;
  attributes?: Record<string, string> | null;
}

interface CorineIdentifyResponse {
  results?: CorineResult[];
}

/**
 * Pull the CODE_18 land-cover code out of one identify result. The code lives
 * under different attribute keys depending on the layer:
 *   - raster layer (layerId 1):  "Raster.CODE_18"
 *   - vector layer (layerId 0):  "Code_18" (and echoed in the top-level `value`)
 * NoData pixels (ocean / outside coverage) carry no code → null.
 */
function readCode(result: CorineResult): number | null {
  const attrs = result.attributes ?? {};
  const raw = attrs['Raster.CODE_18'] ?? attrs['Code_18'] ?? attrs['CODE_18'] ?? result.value ?? null;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/**
 * Map a CORINE identify response to a ForestType (or null for non-forest /
 * no data). Pure — unit-tested against captured fixtures.
 *
 * Prefers the **raster layer** (layerId 1): it returns the single pixel under
 * the point. The vector layer (layerId 0) can return several overlapping
 * polygons within the identify tolerance, which is ambiguous for a point — so
 * we only consult it as a fallback when the raster layer is absent, and then
 * only accept an actual forest polygon.
 */
export function parseCorineForestType(json: unknown): ForestType | null {
  const results = (json as CorineIdentifyResponse | null)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const raster = results.find((r) => r.layerId === 1);
  if (raster) {
    const code = readCode(raster);
    // NoData → null. A real code maps to a forest type, or to null if it's a
    // non-forest class (urban/water/agriculture) — a definitive answer.
    if (code == null) return null;
    return CLC_CODE_TO_FOREST_TYPE[code] ?? null;
  }

  // No raster layer (unexpected): scan vector polygons, accept first forest one.
  for (const r of results) {
    const code = readCode(r);
    if (code != null && CLC_CODE_TO_FOREST_TYPE[code]) {
      return CLC_CODE_TO_FOREST_TYPE[code];
    }
  }
  return null;
}

async function fetchCorineJson(query: HabitatQuery): Promise<CorineIdentifyResponse | null> {
  const { lat, lon } = query;
  // A small extent around the point; the raster identify returns the exact
  // pixel regardless, so this only sizes the (unused) image grid + tolerance.
  const d = 0.1;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, // esriGeometryPoint x,y = lon,lat in EPSG:4326
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'all',
    tolerance: '2',
    mapExtent: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    imageDisplay: '200,200,96',
    returnGeometry: 'false',
    f: 'json'
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CORINE_TIMEOUT_MS);
  try {
    const res = await fetch(`${CORINE_IDENTIFY_URL}?${params.toString()}`, {
      signal: controller.signal,
      // ASCII only — a non-Latin1 char (e.g. ©) makes this server return HTTP 500.
      headers: { 'User-Agent': 'Mycelet (mushroom prediction; data: CORINE Land Cover, EEA Copernicus)' }
    });
    if (!res.ok) return null;
    return (await res.json()) as CorineIdentifyResponse;
  } catch {
    // Network error or timeout abort — caller falls back to climate-only.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch Swedish forest properties for a coordinate via CORINE Land Cover.
 *
 * Returns null in the cases the caller must handle by falling back to the
 * climate signal:
 *   - Outside Sweden bounding box → wrong adapter, never hit the network.
 *   - The point is not forest (urban, water, agriculture) per CORINE.
 *   - No data (ocean / outside coverage) or a network/parse error.
 *
 * Numeric fields (ageYears/productivity/volumePerHa) are always null: CORINE
 * is land-cover TYPE only. source='corine' tells habitat scoring to skip
 * those terms while still rewarding the tree-type match.
 */
export async function getSwedishForestProperties(query: HabitatQuery): Promise<ForestProperties | null> {
  if (!isWithinSweden(query)) return null;

  const json = await fetchCorineJson(query);
  if (json === null) return null;

  const forestType = parseCorineForestType(json);
  if (forestType === null) return null;

  return {
    forestType,
    ageYears: null,
    productivity: null,
    volumePerHa: null,
    source: 'corine'
  };
}
