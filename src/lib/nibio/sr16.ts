/**
 * SR16 forest-raster data adapter — live NIBIO WMS GetFeatureInfo.
 *
 * Fetches real forest properties (treslag, bonitet, volum) for a single
 * coordinate from NIBIO's free, no-auth WMS service. This is "Vei 1" from
 * `docs/nibio-setup.md` — no download, no API key, always-fresh data, at
 * the cost of one network hop per point. For high-volume tile generation
 * we can later move to a local PostGIS table ("Vei 2") without touching
 * call sites.
 *
 * Coverage caveat: SR16 covers mainland Norway. Returns null for queries
 * outside the bounding box, on water/urban/open cells (SR16 nodata), and
 * on any network/parse failure — callers then lean on the climate signal.
 *
 * Sweden/Finland get a separate adapter (Skogsstyrelsen kNN — TODO).
 */

import { getRegion } from '@/lib/utils/region';
import type { ForestProperties, ForestType, HabitatQuery } from './types';

const SR16_WMS_URL = 'https://wms.nibio.no/cgi-bin/sr16';

/**
 * Layers queried per point, in a FIXED order. Parsing is positional (see
 * parseSr16Html), so the order here is the contract — don't reorder without
 * updating the parser. We only request the three layers that map onto
 * ForestProperties fields.
 */
const SR16_LAYERS = ['SRRTRESLAG', 'SRRBONITET', 'SRRVOLMB'] as const;
type Sr16Layer = (typeof SR16_LAYERS)[number];

const SR16_TIMEOUT_MS = 8000;

/** SR16 treslag raster codes → our ForestType vocabulary. */
const TRESLAG_TO_FOREST_TYPE: Readonly<Record<number, ForestType>> = {
  1: 'gran',
  2: 'furu',
  3: 'lauv'
};

/**
 * SR16 dekker Fastlands-Norge. Bruker `getRegion` fra region.ts så vi
 * deler bounding-box-logikken med vær-adapterne — én sannhet om hva
 * som er Norge vs Sverige vs annet.
 */
export function isWithinNorway(query: HabitatQuery): boolean {
  return getRegion(query.lat, query.lon) === 'NO';
}

/**
 * Parse the raster pixel value for each queried layer out of NIBIO's
 * GetFeatureInfo HTML.
 *
 * NIBIO quirks this works around:
 *   - The response is one concatenated HTML document per layer, in query
 *     order (not a single multi-table doc).
 *   - The value isn't in a clean attribute — it sits inside a JS guard
 *     `if (<value> == 9999) { ... } else { ... }`, where <value> is the raw
 *     pixel. We read it from there.
 *   - Layer-name headers are unreliable (NIBIO's own template mislabels
 *     SRRVOLMB as "SSRVOLMB"), so we map values positionally by query order
 *     rather than by header text.
 *   - nodata is -9999 (and any negative); real values for these layers are
 *     always >= 0.
 */
export function parseSr16Html(html: string): Record<Sr16Layer, number | null> {
  const result: Record<Sr16Layer, number | null> = {
    SRRTRESLAG: null,
    SRRBONITET: null,
    SRRVOLMB: null
  };
  const matches = [...html.matchAll(/\((-?\d+) == 9999\)/g)];
  SR16_LAYERS.forEach((layer, idx) => {
    const match = matches[idx];
    if (!match) return;
    const value = Number(match[1]);
    result[layer] = Number.isFinite(value) && value >= 0 ? value : null;
  });
  return result;
}

async function fetchSr16Html(query: HabitatQuery): Promise<string | null> {
  const { lat, lon } = query;
  // ~100 m bbox centered on the point; we query the center pixel (i=j=50 of
  // a 101×101 image) so the lookup lands on the requested coordinate.
  const d = 0.001;
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetFeatureInfo',
    layers: SR16_LAYERS.join(','),
    query_layers: SR16_LAYERS.join(','),
    crs: 'EPSG:4326',
    // WMS 1.3.0 mandates lat,lon (not lon,lat) axis order for EPSG:4326.
    bbox: `${lat - d},${lon - d},${lat + d},${lon + d}`,
    width: '101',
    height: '101',
    i: '50',
    j: '50',
    info_format: 'text/html'
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SR16_TIMEOUT_MS);
  try {
    const res = await fetch(`${SR16_WMS_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mycelet (mushroom prediction; data: NIBIO SR16 CC BY 4.0)' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    // Network error or timeout abort — caller falls back to climate-only.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch SR16 forest properties for a single coordinate.
 *
 * Returns null in the cases the caller must handle by falling back to the
 * climate signal:
 *   - Outside Norway bounding box → use Sweden adapter or fallback.
 *   - SR16 has no forest cell at the coordinate (water, urban, open land,
 *     coverage gap) → treslag is nodata.
 *   - Network/parse error reaching the WMS.
 */
export async function getForestProperties(query: HabitatQuery): Promise<ForestProperties | null> {
  if (!isWithinNorway(query)) {
    return null;
  }

  const html = await fetchSr16Html(query);
  if (html === null) {
    return null;
  }

  const values = parseSr16Html(html);

  // No treslag = no forest cell here. Return null rather than a neutral
  // 'apent' guess — we genuinely don't know what the cell is.
  if (values.SRRTRESLAG === null) {
    return null;
  }

  return {
    forestType: TRESLAG_TO_FOREST_TYPE[values.SRRTRESLAG] ?? 'ukjent',
    // SR16's public WMS exposes no stand-age layer; height/volume are
    // maturity proxies we can fold in later. Null here makes habitat
    // scoring skip the age term rather than guess.
    ageYears: null,
    productivity: values.SRRBONITET,
    volumePerHa: values.SRRVOLMB,
    source: 'sr16'
  };
}

/**
 * Fallback ForestProperties for when SR16 has no data. All-null fields
 * with source='fallback' signal "no signal — score neutrally".
 *
 * Exported for tests and for the prediction-tile generator (which can
 * choose to skip cells without data instead of scoring them neutrally).
 */
export function fallbackProperties(): ForestProperties {
  return {
    forestType: 'ukjent',
    ageYears: null,
    productivity: null,
    volumePerHa: null,
    source: 'fallback'
  };
}
