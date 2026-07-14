/**
 * Sampled full-pipeline spatial audit for "Lovende steder".
 *
 * Purpose:
 *   Measure whether the production habitat/forest/host-gate terms add real
 *   spatial signal against a target-group background (places people also look).
 *
 * What this covers:
 *   - Temporal holdout: train occurrences before CUTOFF, test after CUTOFF.
 *   - Target-group background: negatives are old occurrence locations from a
 *     DIFFERENT species in the same country, preferably within 150 km and the
 *     same +/-1-month season window, scored for the presence species/date.
 *   - Production-shaped recurrence signal: distance-decayed occurrence kernel.
 *   - Production-shaped habitat signal: NIBIO SR16 in Norway, CORINE in Sweden,
 *     buildSpeciesHabitatPreferences, computeHabitatScore, habitatFit, hostGate.
 *
 * What this does NOT cover:
 *   - Historical weather at the old find date. Using today's weather would be
 *     leakage/noise, so this script intentionally leaves weather out. Add a
 *     dated weather snapshot source before claiming full weather validation.
 *
 * Run:
 *   node --env-file=.env.local scripts/backtest-full-pipeline.mjs
 *
 * Useful knobs:
 *   MAX_TEST=200 NEG_PER_POS=3 FOREST_CONCURRENCY=4 ...
 *   FOREST_CACHE_PATH=.next/backtest-full-pipeline-forest-cache.json ...
 *   EXPORT_SDM_JSONL=.next/validation/sdm-target-group.jsonl ...
 *   node --env-file=.env.local scripts/backtest-full-pipeline.mjs --json
 *
 * This script may call external public map services. Keep MAX_TEST small while
 * developing; the forest cache makes repeat runs cheap.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { curveLookup, latBand, weekIndexFromISO } from './phenology-core.mjs';
import {
  buildTargetGroupIndex,
  chooseTargetGroupBackgrounds,
  spatialBlock
} from './lib/spatial-validation.mjs';

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/backtest-full-pipeline.mjs [--json]

Environment:
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Service role key
  CUTOFF                         Temporal split, default 2021-01-01
  MAX_TEST                       Test presences to sample, default 300
  NEG_PER_POS                    Target-group negatives per presence, default 3
  BG_RADIUS_KM                   Preferred local-background radius, default 150
  BG_MONTH_WINDOW                Allowed calendar-month distance, default 1
  FOREST_CONCURRENCY             NIBIO/CORINE fetch concurrency, default 4
  FOREST_CACHE_PATH              Cache file, default .next/backtest-full-pipeline-forest-cache.json
  EXPORT_SDM_JSONL               Optional JSONL export of target-group feature rows
  SPECIES_ID                     Optional filter for held-out test presences
  --json                         Print machine-readable JSON
`);
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const PAGE = clampInt(Number(process.env.PAGE || 1000), 1, 5000);
const HOLDOUT_CUTOFF = process.env.CUTOFF || '2021-01-01';
const MAX_TEST = clampInt(Number(process.env.MAX_TEST || 300), 1, Number.MAX_SAFE_INTEGER);
const NEG_PER_POS = clampInt(Number(process.env.NEG_PER_POS || 3), 1, 20);
const BG_RADIUS_KM = clampInt(Number(process.env.BG_RADIUS_KM || 150), 10, 1000);
const BG_MONTH_WINDOW = clampInt(Number(process.env.BG_MONTH_WINDOW || 1), 0, 6);
const FOREST_CONCURRENCY = clampInt(Number(process.env.FOREST_CONCURRENCY || 4), 1, 12);
const FOREST_CACHE_PATH = process.env.FOREST_CACHE_PATH || '.next/backtest-full-pipeline-forest-cache.json';
const EXPORT_SDM_JSONL = process.env.EXPORT_SDM_JSONL || null;
const SPECIES_ID_RAW = process.env.SPECIES_ID ? Number(process.env.SPECIES_ID) : null;
const SPECIES_ID = Number.isFinite(SPECIES_ID_RAW) ? SPECIES_ID_RAW : null;
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';

const KERNEL_BW_KM = 1.5;
const KERNEL_CUTOFF_KM = 5;
const GRID = 0.1; // degrees; larger than the 5 km kernel cutoff in Nordic latitudes
const CACHE_DECIMALS = 5;

const VARIANTS = [
  'fullCore',
  'fullWithinForest',
  'habitatCandidate',
  'habitatWithinForest',
  'occurrenceOnly',
  'phenologyOnly',
  'forestMask'
];

const SR16_WMS_URL = 'https://wms.nibio.no/cgi-bin/sr16';
const SR16_LAYERS = ['SRRTRESLAG', 'SRRBONITET', 'SRRVOLMB'];
const SR16_TIMEOUT_MS = 8000;
const TRESLAG_TO_FOREST_TYPE = {
  1: 'gran',
  2: 'furu',
  3: 'lauv'
};

const CORINE_IDENTIFY_URL =
  'https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/identify';
const CLC_TO_FOREST = {
  311: 'lauv',
  312: 'bar',
  313: 'blandet'
};

const NORWAY = { minLat: 57.7, maxLat: 71.5, minLon: 4.0, maxLon: 31.5 };
const SWEDEN = { minLat: 55.2, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 };

const DECIDUOUS_PARTNERS = ['bjork', 'eik', 'bok', 'osp', 'or', 'alm', 'ask', 'selje', 'rogn', 'hassel', 'lind'];
const CONIFEROUS_PARTNERS = ['gran', 'furu', 'contorta'];
const OPEN_HABITAT_TAGS = [
  'eng',
  'beite',
  'beitemark',
  'gress',
  'gressplen',
  'gressmark',
  'plen',
  'park',
  'hage',
  'lysninger',
  'kantsoner',
  'sti',
  'veikant',
  'sandig mark',
  'sandgrunn'
];
const FOREST_HABITAT_TAGS = [
  'skog',
  'barskog',
  'granskog',
  'furuskog',
  'lovskog',
  'løvskog',
  'lauvskog',
  'blandingsskog',
  'eikeskog',
  'fjellbjorkeskog',
  'fjellbjørkeskog',
  'lerkeskog',
  'fuktig skog',
  'moserik',
  'mose',
  'brannfelt',
  'myr',
  'myr-kant',
  'elvebredder'
];

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function fixed(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

function pct(value) {
  return value == null || !Number.isFinite(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function loadPhenology() {
  const src = readFileSync(new URL('../src/lib/prediction/phenology-data.ts', import.meta.url), 'utf8');
  const marker = 'PHENOLOGY: Record<string, SpeciesPhenology> = ';
  const json = src.slice(src.indexOf(marker) + marker.length).replace(/;\s*$/, '').trim();
  return JSON.parse(json);
}
const PHENOLOGY = loadPhenology();

function phenologyFactor(speciesId, lat, iso) {
  const entry = PHENOLOGY[String(speciesId)];
  if (!entry) return 0.5;
  const week = weekIndexFromISO(iso);
  if (week == null) return 0.5;
  const curve = entry[latBand(lat)] ?? entry.all;
  return curveLookup(curve, week) ?? 0.5;
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json();
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function sampleLimit(rows, max, rng) {
  if (rows.length <= max) return rows;
  return rows
    .map((row) => ({ row, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, max)
    .map((x) => x.row);
}

function cellKey(lat, lng) {
  return `${Math.round(lat / GRID)},${Math.round(lng / GRID)}`;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function buildOccurrenceIndex(trainRows) {
  const index = new Map();
  for (const r of trainRows) {
    let byCell = index.get(r.sid);
    if (!byCell) {
      byCell = new Map();
      index.set(r.sid, byCell);
    }
    const key = cellKey(r.lat, r.lng);
    const arr = byCell.get(key);
    if (arr) arr.push(r);
    else byCell.set(key, [r]);
  }
  return index;
}

function neighbourPoints(index, sid, lat, lng) {
  const byCell = index.get(sid);
  if (!byCell) return [];
  const ci = Math.round(lat / GRID);
  const cj = Math.round(lng / GRID);
  const out = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const arr = byCell.get(`${ci + di},${cj + dj}`);
      if (arr) out.push(...arr);
    }
  }
  return out;
}

function kernelDensity(index, sid, lat, lng) {
  let sum = 0;
  for (const p of neighbourPoints(index, sid, lat, lng)) {
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (d > KERNEL_CUTOFF_KM) continue;
    const r = d / KERNEL_BW_KM;
    sum += Math.exp(-(r * r));
  }
  return sum;
}

function occurrenceBoost(density) {
  return 1 + Math.min(0.6, density * 0.05);
}

function inBox(lat, lon, box) {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

function noSeBorderLon(lat) {
  if (lat <= 59) return 11.4;
  if (lat <= 61) return 11.4 + (lat - 59) * 0.6;
  if (lat <= 65) return 12.6 + (lat - 61) * 0.475;
  if (lat <= 69) return 14.5 + (lat - 65) * 1.5;
  return 20.5;
}

function getRegion(lat, lon) {
  const isNorway = inBox(lat, lon, NORWAY);
  const isSweden = inBox(lat, lon, SWEDEN);
  if (isNorway && !isSweden) return 'NO';
  if (isSweden && !isNorway) return 'SE';
  if (isNorway && isSweden) return lon < noSeBorderLon(lat) ? 'NO' : 'SE';
  return 'other';
}

function parseSr16Html(html) {
  const result = {
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

async function getSr16Forest(lat, lon) {
  const d = 0.001;
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetFeatureInfo',
    layers: SR16_LAYERS.join(','),
    query_layers: SR16_LAYERS.join(','),
    crs: 'EPSG:4326',
    bbox: `${lat - d},${lon - d},${lat + d},${lon + d}`,
    width: '101',
    height: '101',
    i: '50',
    j: '50',
    info_format: 'text/html'
  });

  try {
    const res = await fetch(`${SR16_WMS_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(SR16_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mycelet full-pipeline backtest (NIBIO SR16 CC BY 4.0)' }
    });
    if (!res.ok) return null;
    const values = parseSr16Html(await res.text());
    if (values.SRRTRESLAG === null) return null;
    return {
      forestType: TRESLAG_TO_FOREST_TYPE[values.SRRTRESLAG] ?? 'ukjent',
      ageYears: null,
      productivity: values.SRRBONITET,
      volumePerHa: values.SRRVOLMB,
      source: 'sr16'
    };
  } catch {
    return null;
  }
}

async function getCorineForest(lat, lon) {
  try {
    const params = new URLSearchParams({
      f: 'json',
      geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      sr: '4326',
      layers: 'all',
      tolerance: '2',
      mapExtent: `${lon - 0.1},${lat - 0.1},${lon + 0.1},${lat + 0.1}`,
      imageDisplay: '400,400,96',
      returnGeometry: 'false'
    });
    const res = await fetch(`${CORINE_IDENTIFY_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    let code = null;
    for (const result of json.results ?? []) {
      const value =
        result.attributes?.Code_18 ??
        result.attributes?.CODE_18 ??
        result.attributes?.['Raster.CODE_18'];
      if (value) {
        code = String(value);
        break;
      }
    }
    const forestType = CLC_TO_FOREST[code];
    if (!forestType) return null;
    return { forestType, ageYears: null, productivity: null, volumePerHa: null, source: 'corine' };
  } catch {
    return null;
  }
}

async function getForestProperties(lat, lon) {
  const region = getRegion(lat, lon);
  if (region === 'NO') return getSr16Forest(lat, lon);
  if (region === 'SE') return getCorineForest(lat, lon);
  return null;
}

function normalizeTreeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'a')
    .replace(/å/g, 'a')
    .trim();
}

function buildSpeciesHabitatPreferences(row) {
  return {
    preferredPartners: (row.mycorrhizal_partners ?? []).map(normalizeTreeName),
    habitat: row.habitat ?? []
  };
}

function hasTag(habitat, tags) {
  return habitat.some((h) => tags.includes(String(h).toLowerCase().trim()));
}

function computeHabitatScore(forest, preferences) {
  if (!forest || forest.source === 'fallback') return { score: 0.5, hostGate: 1 };

  let score = 0.5;
  let hostGate = 1;
  const opensTolerant = hasTag(preferences.habitat, OPEN_HABITAT_TAGS);
  const forestDependent =
    preferences.preferredPartners.length > 0 || hasTag(preferences.habitat, FOREST_HABITAT_TAGS);

  if (preferences.preferredPartners.includes(forest.forestType)) {
    score += 0.4;
  } else if (
    forest.forestType === 'lauv' &&
    preferences.preferredPartners.some((partner) => DECIDUOUS_PARTNERS.includes(partner))
  ) {
    score += 0.3;
  } else if (
    forest.forestType === 'bar' &&
    preferences.preferredPartners.some((partner) => CONIFEROUS_PARTNERS.includes(partner))
  ) {
    score += 0.3;
  } else if (forest.forestType === 'blandet') {
    score += 0.2;
  } else if (forest.forestType === 'apent') {
    if (opensTolerant) score += 0.3;
    else if (forestDependent) hostGate = 0.12;
    else score -= 0.1;
  } else if (forest.forestType !== 'ukjent') {
    score -= 0.15;
  }

  if (preferences.preferredAgeYearsMin != null && forest.ageYears != null) {
    const min = preferences.preferredAgeYearsMin;
    const max = preferences.preferredAgeYearsMax ?? Infinity;
    if (forest.ageYears >= min && forest.ageYears <= max) score += 0.15;
    else if (forest.ageYears < min) score -= 0.1;
  }

  if (forest.productivity != null && forest.productivity >= 14) {
    if (preferences.habitat.includes('kalkrik') || preferences.habitat.includes('næringsrik')) score += 0.1;
  }

  return {
    score: Math.max(0.2, Math.min(1.3, score)),
    hostGate
  };
}

function loadForestCache() {
  if (!existsSync(FOREST_CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(FOREST_CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveForestCache(cache) {
  mkdirSync(dirname(FOREST_CACHE_PATH), { recursive: true });
  writeFileSync(FOREST_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

function forestCacheKey(point) {
  return `${point.lat.toFixed(CACHE_DECIMALS)},${point.lng.toFixed(CACHE_DECIMALS)}`;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchAllOccurrences() {
  const rows = [];
  for (let from = 0; ; ) {
    const page = await rest(
      `species_occurrences?select=id,species_id,latitude,longitude,observed_at&species_id=not.is.null&observed_at=not.is.null&order=id&offset=${from}&limit=${PAGE}`
    );
    rows.push(
      ...page
        .map((r) => ({
          id: String(r.id),
          sid: Number(r.species_id),
          lat: Number(r.latitude),
          lng: Number(r.longitude),
          iso: r.observed_at
        }))
        .filter((r) => Number.isFinite(r.sid) && Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.iso)
    );
    from += page.length;
    if (page.length < PAGE) break;
    if (!JSON_OUTPUT && from % 50000 === 0) process.stdout.write(`  fetched ${from} occurrence rows\r`);
  }
  return rows;
}

async function fetchSpecies() {
  const rows = await rest(
    'mushroom_species?select=id,norwegian_name,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners&order=id'
  );
  return new Map(rows.map((r) => [Number(r.id), r]));
}

function scorePoint({ sid, lat, lng, iso }, forest, speciesById, occurrenceIndex) {
  const sp = speciesById.get(sid);
  const prefs = sp ? buildSpeciesHabitatPreferences(sp) : { preferredPartners: [], habitat: [] };
  const density = kernelDensity(occurrenceIndex, sid, lat, lng);
  const occ = occurrenceBoost(density);
  const phen = phenologyFactor(sid, lat, iso);
  const habitat = forest ? computeHabitatScore(forest, prefs) : null;
  const hab = habitat ? (0.5 + habitat.score) * habitat.hostGate : null;

  return {
    fullCore: hab == null ? 0 : occ * phen * hab,
    fullWithinForest: hab == null ? null : occ * phen * hab,
    habitatCandidate: hab == null ? 0 : hab,
    habitatWithinForest: hab,
    occurrenceOnly: occ,
    phenologyOnly: phen,
    forestMask: forest ? 1 : 0,
    features: {
      occurrenceDensity: density,
      occurrenceBoost: occ,
      phenology: phen,
      habitatMultiplier: hab,
      habitatScore: habitat?.score ?? null,
      hostGate: habitat?.hostGate ?? null,
      forestPresent: forest ? 1 : 0,
      forestSource: forest?.source ?? 'none',
      forestType: forest?.forestType ?? 'none',
      forestProductivity: forest?.productivity ?? null,
      forestVolumePerHa: forest?.volumePerHa ?? null
    }
  };
}

function exportSdmRow(pairId, label, role, point, forest, scores, presence, matchTier) {
  return {
    pairId,
    presenceId: presence.id,
    cvGroup: spatialBlock(presence.lat, presence.lng),
    label,
    role,
    speciesId: point.sid,
    observedAt: point.iso,
    latitude: point.lat,
    longitude: point.lng,
    region: getRegion(point.lat, point.lng),
    presenceRegion: getRegion(presence.lat, presence.lng),
    targetGroupSourceSpeciesId: point.sourceSid ?? point.sid,
    backgroundMatch: matchTier,
    scores: Object.fromEntries(VARIANTS.map((v) => [v, scores[v]])),
    features: scores.features,
    forest
  };
}

function compare(a, b) {
  if (a == null || b == null) return null;
  if (a > b) return 1;
  if (a === b) return 0.5;
  return 0;
}

function sourceName(forest) {
  return forest?.source ?? 'none';
}

function increment(map, key, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

function emptyCounters() {
  return {
    wins: Object.fromEntries(VARIANTS.map((v) => [v, 0])),
    comparisons: Object.fromEntries(VARIANTS.map((v) => [v, 0]))
  };
}

function addComparison(counter, variant, result) {
  if (result == null) return;
  counter.wins[variant] += result;
  counter.comparisons[variant]++;
}

function aucFromCounters(counter) {
  return Object.fromEntries(
    VARIANTS.map((v) => [v, counter.comparisons[v] > 0 ? counter.wins[v] / counter.comparisons[v] : null])
  );
}

async function main() {
  const rng = makeRng(246813579);
  const speciesById = await fetchSpecies();
  const occurrences = await fetchAllOccurrences();
  const train = occurrences.filter((r) => r.iso < HOLDOUT_CUTOFF);
  const testAll = occurrences.filter(
    (r) => r.iso >= HOLDOUT_CUTOFF && speciesById.has(r.sid) && (SPECIES_ID == null || r.sid === SPECIES_ID)
  );
  const tests = sampleLimit(testAll, MAX_TEST, rng);
  const occurrenceIndex = buildOccurrenceIndex(train);
  const backgroundIndex = buildTargetGroupIndex(train, getRegion);

  if (train.length === 0 || tests.length === 0) {
    throw new Error(`Not enough data after split. train=${train.length}, test=${tests.length}`);
  }

  const pairs = [];
  const backgroundMatchCounts = {};
  for (const presence of tests) {
    const matched = chooseTargetGroupBackgrounds({
      presence,
      index: backgroundIndex,
      count: NEG_PER_POS,
      rng,
      regionOf: getRegion,
      distanceKm: haversineKm,
      radiusKm: BG_RADIUS_KM,
      monthWindow: BG_MONTH_WINDOW
    });
    increment(backgroundMatchCounts, matched.tier);
    for (const bg of matched.rows) {
      pairs.push({
        presence,
        background: {
          id: bg.id,
          sid: presence.sid,
          sourceSid: bg.sid,
          lat: bg.lat,
          lng: bg.lng,
          iso: presence.iso
        },
        matchTier: matched.tier
      });
    }
  }
  if (pairs.length === 0) throw new Error('No matched target-group backgrounds.');

  const pointByKey = new Map();
  for (const pair of pairs) {
    pointByKey.set(forestCacheKey(pair.presence), pair.presence);
    pointByKey.set(forestCacheKey(pair.background), pair.background);
  }
  const uniquePoints = [...pointByKey.values()];
  const forestCache = loadForestCache();
  let cacheHits = 0;
  let cacheMisses = 0;

  await mapLimit(uniquePoints, FOREST_CONCURRENCY, async (point, idx) => {
    const key = forestCacheKey(point);
    if (Object.prototype.hasOwnProperty.call(forestCache, key)) {
      cacheHits++;
      return;
    }
    cacheMisses++;
    forestCache[key] = await getForestProperties(point.lat, point.lng);
    if (!JSON_OUTPUT && (idx + 1) % 100 === 0) {
      process.stdout.write(`  forest lookups ${idx + 1}/${uniquePoints.length}\r`);
    }
  });
  saveForestCache(forestCache);

  const overall = emptyCounters();
  const byPresenceRegion = new Map();
  const sources = {
    presence: {},
    background: {}
  };
  const sdmRows = [];

  for (let pairId = 0; pairId < pairs.length; pairId++) {
    const pair = pairs[pairId];
    const presenceForest = forestCache[forestCacheKey(pair.presence)] ?? null;
    const bgForest = forestCache[forestCacheKey(pair.background)] ?? null;
    increment(sources.presence, sourceName(presenceForest));
    increment(sources.background, sourceName(bgForest));

    const ps = scorePoint(pair.presence, presenceForest, speciesById, occurrenceIndex);
    const bs = scorePoint(pair.background, bgForest, speciesById, occurrenceIndex);
    const region = getRegion(pair.presence.lat, pair.presence.lng);
    if (!byPresenceRegion.has(region)) byPresenceRegion.set(region, emptyCounters());
    const regionCounter = byPresenceRegion.get(region);
    for (const v of VARIANTS) {
      const result = compare(ps[v], bs[v]);
      addComparison(overall, v, result);
      addComparison(regionCounter, v, result);
    }

    if (EXPORT_SDM_JSONL) {
      sdmRows.push(exportSdmRow(pairId, 1, 'presence', pair.presence, presenceForest, ps, pair.presence, pair.matchTier));
      sdmRows.push(
        exportSdmRow(
          pairId,
          0,
          'target_group_background',
          pair.background,
          bgForest,
          bs,
          pair.presence,
          pair.matchTier
        )
      );
    }
  }

  const auc = aucFromCounters(overall);
  const byRegion = Object.fromEntries(
    [...byPresenceRegion.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([region, counter]) => [
      region,
      {
        auc: aucFromCounters(counter),
        comparisons: counter.comparisons
      }
    ])
  );
  const report = {
    method: {
      holdoutCutoff: HOLDOUT_CUTOFF,
      trainOccurrences: train.length,
      testPresencesAvailable: testAll.length,
      testPresencesSampled: tests.length,
      targetGroupNegativesPerPresence: NEG_PER_POS,
      targetGroupBackground: {
        sameRegion: true,
        excludesTargetSpecies: true,
        preferredRadiusKm: BG_RADIUS_KM,
        monthWindow: BG_MONTH_WINDOW,
        matchCounts: backgroundMatchCounts
      },
      pairs: pairs.length,
      speciesId: SPECIES_ID,
      weather: 'not_included_historical_weather_required'
    },
    forest: {
      uniquePoints: uniquePoints.length,
      cachePath: FOREST_CACHE_PATH,
      cacheHits,
      cacheMisses,
      concurrency: FOREST_CONCURRENCY,
      sources
    },
    export: EXPORT_SDM_JSONL
      ? {
          path: EXPORT_SDM_JSONL,
          rows: sdmRows.length,
          format: 'jsonl',
          note: 'Target-group feature rows for SDM experiments; not a production model artifact.'
        }
      : null,
    auc,
    comparisons: overall.comparisons,
    byRegion
  };

  if (EXPORT_SDM_JSONL) {
    mkdirSync(dirname(EXPORT_SDM_JSONL), { recursive: true });
    writeFileSync(EXPORT_SDM_JSONL, `${sdmRows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n=== Full-pipeline spatial audit (sampled target-group) ===');
  console.log(`Holdout: train observed_at < ${HOLDOUT_CUTOFF}, test >= ${HOLDOUT_CUTOFF}`);
  console.log(`Train occurrences: ${train.length}`);
  console.log(`Test presences: ${tests.length}${testAll.length > tests.length ? ` (sample of ${testAll.length})` : ''}`);
  console.log(`Target-group background: ${NEG_PER_POS} per presence (${pairs.length} paired comparisons)`);
  console.log(
    `Background matching: same region, other species, preferred <=${BG_RADIUS_KM} km / +/-${BG_MONTH_WINDOW} month | ${JSON.stringify(backgroundMatchCounts)}`
  );
  console.log(`Forest points: ${uniquePoints.length} unique, cache hits ${cacheHits}, misses ${cacheMisses}`);
  if (EXPORT_SDM_JSONL) console.log(`SDM feature export: ${EXPORT_SDM_JSONL} (${sdmRows.length} rows)`);
  console.log(
    `Presence forest coverage: ${pct(1 - (sources.presence.none ?? 0) / pairs.length)}  ` +
      `| background forest coverage: ${pct(1 - (sources.background.none ?? 0) / pairs.length)}`
  );
  console.log(`Presence sources: ${JSON.stringify(sources.presence)}  | background sources: ${JSON.stringify(sources.background)}\n`);

  const label = {
    fullCore: 'fullCore: forest mask + habitat + recurrence + phenology',
    fullWithinForest: 'fullWithinForest: habitat + recurrence + phenology only when both are forest',
    habitatCandidate: 'habitatCandidate: forest mask + habitat multiplier',
    habitatWithinForest: 'habitatWithinForest: habitat multiplier only when both are forest',
    occurrenceOnly: 'occurrenceOnly: distance-decayed recurrence kernel',
    phenologyOnly: 'phenologyOnly: date/species/lat-band timing',
    forestMask: 'forestMask: can the grid even score this point'
  };
  console.log('AUC, target-group paired ranking:');
  for (const v of VARIANTS) {
    console.log(`  ${label[v].padEnd(76)} ${fixed(auc[v])}   n=${overall.comparisons[v]}`);
  }

  console.log('\nAUC by presence region (NO/SE asymmetry check):');
  for (const [region, result] of Object.entries(byRegion)) {
    console.log(`  ${region}`);
    for (const v of ['fullCore', 'habitatWithinForest', 'occurrenceOnly', 'forestMask']) {
      console.log(`    ${v.padEnd(22)} ${fixed(result.auc[v])}   n=${result.comparisons[v]}`);
    }
  }

  console.log('\nRead this honestly:');
  console.log('- AUC near 0.5 means the term does not rank future finds above places people also searched.');
  console.log('- fullWithinForest/habitatWithinForest isolate habitat preference inside forest cells.');
  console.log('- fullCore/habitatCandidate include the production grid candidate mask: no forest data means no top spot.');
  console.log('- Historical weather is intentionally excluded. Do not claim weather validation from this run.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
