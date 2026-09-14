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
 * Sweden currently routes through CORINE in src/lib/forest. A richer Sweden
 * adapter should use Skogsstyrelsens Skogliga grunddata when credentials and
 * layer endpoints are configured.
 */

import { getRegion } from '@/lib/utils/region';
import type { ForestProperties, ForestType, HabitatQuery } from './types';

const SR16_WMS_URL = 'https://wms.nibio.no/cgi-bin/sr16';

/**
 * Layers queried per point. Parsing is keyed on each response block's
 * header (see parseSr16Html), so the order here no longer matters. We only
 * request the three layers that map onto ForestProperties fields.
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
 *   - The response is one concatenated HTML document per layer (not a single
 *     multi-table doc), each headed «Skogressurskart (<LAYER> raster)».
 *   - The value isn't in a clean attribute — it sits inside a JS guard
 *     `if (<value> == 9999) { ... } else { ... }`, where <value> is the raw
 *     pixel. We read it from there.
 *   - NIBIO's own template mislabels SRRVOLMB as "SSRVOLMB" in the header;
 *     normalised below.
 *   - ⚠️ When a layer is nodata at the pixel, NIBIO OMITS that layer's whole
 *     sub-document instead of returning -9999. The first version of this
 *     parser mapped values positionally by query order, so a missing
 *     SRRBONITET block made the standing volume be read as the site index
 *     (a 65 m³/ha stand became «bonitet 65», which clears the ≥ 14 rich-soil
 *     bonus in habitat.ts and corrupts the soil factor in the nightly tiles).
 *     Measured 0–14 % of forest cells per region (review 2026-09-14, ten
 *     independent live reproductions — docs/mikro-prediksjon-gjennomgang.md).
 *     Values are therefore keyed on the header; the positional reading is
 *     kept only as a fallback for a response without headers.
 *   - nodata is -9999 (and any negative); real values for these layers are
 *     always >= 0.
 */
const SR16_HEADER = /Skogressurskart \((S[SR]R[A-Z]+) raster\)/g;
const SR16_VALUE = /\((-?\d+) == 9999\)/;

function normaliserLagnavn(navn: string): Sr16Layer | null {
  const n = navn === 'SSRVOLMB' ? 'SRRVOLMB' : navn;
  return (SR16_LAYERS as readonly string[]).includes(n) ? (n as Sr16Layer) : null;
}

function lesVerdi(segment: string): number | null {
  const m = segment.match(SR16_VALUE);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseSr16Html(html: string): Record<Sr16Layer, number | null> {
  const result: Record<Sr16Layer, number | null> = {
    SRRTRESLAG: null,
    SRRBONITET: null,
    SRRVOLMB: null
  };
  const headers = [...html.matchAll(SR16_HEADER)];
  if (headers.length === 0) {
    // Ingen overskrifter: gammel posisjonell lesing, i spørrerekkefølge.
    const matches = [...html.matchAll(new RegExp(SR16_VALUE.source, 'g'))];
    SR16_LAYERS.forEach((layer, idx) => {
      const match = matches[idx];
      if (!match) return;
      const value = Number(match[1]);
      result[layer] = Number.isFinite(value) && value >= 0 ? value : null;
    });
    return result;
  }
  headers.forEach((h, i) => {
    const layer = normaliserLagnavn(h[1]);
    if (!layer) return;
    const start = h.index ?? 0;
    const end = headers[i + 1]?.index ?? html.length;
    result[layer] = lesVerdi(html.slice(start, end));
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

  // Nothing at all = no forest cell here (water, urban, bare rock). Return
  // null rather than a neutral guess — we genuinely don't know what it is.
  // A cell with treslag missing but bonitet/volume present IS forest (seen
  // live at 60.2602, 5.2623: treslag −9999, bonitet 23, 732 m³/ha); the
  // first version threw the whole cell away in that case.
  if (values.SRRTRESLAG === null && values.SRRBONITET === null && values.SRRVOLMB === null) {
    return null;
  }

  return {
    forestType: values.SRRTRESLAG === null ? 'ukjent' : (TRESLAG_TO_FOREST_TYPE[values.SRRTRESLAG] ?? 'ukjent'),
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
