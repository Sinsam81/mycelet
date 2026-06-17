/**
 * Build historical weather features for species_occurrences.
 *
 * This fills occurrence_weather_features with weather-at-find-time features:
 * temperature, humidity, rain windows, min/max temp, and soil-moisture bucket.
 *
 * Why this exists:
 *   The live prediction engine has a weather term, but old GBIF occurrence rows
 *   need weather from the occurrence date, not today's weather. Without this
 *   cache, any "weather validation" would be illusory.
 *
 * Run small first:
 *   LIMIT=25 DRY_RUN=1 node --env-file=.env.local scripts/build-occurrence-weather-features.mjs
 *
 * Then write batches:
 *   LIMIT=200 node --env-file=.env.local scripts/build-occurrence-weather-features.mjs
 *
 * Filters:
 *   REGION=NO|SE
 *   SPECIES_ID=12
 *   SINCE=2021-01-01 UNTIL=2025-01-01
 *
 * Notes:
 *   - Norway needs MET_FROST_CLIENT_ID.
 *   - Sweden uses SMHI corrected-archive CSV and caches per station/parameter.
 *   - External weather calls are cached under .next/weather-feature-cache/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const HELP = new Set(['-h', '--help']);
const args = new Set(process.argv.slice(2));

if ([...args].some((a) => HELP.has(a))) {
  console.log(`Usage: node --env-file=.env.local scripts/build-occurrence-weather-features.mjs [--help]

Environment:
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY      Service role key
  MET_FROST_CLIENT_ID            Required for REGION=NO / Frost rows
  LIMIT                          Occurrence rows to inspect, default 100
  OFFSET                         Occurrence offset, default 0
  REGION                         Optional NO or SE filter
  SPECIES_ID                     Optional species id
  SINCE                          Optional observed_at lower bound, e.g. 2021-01-01
  UNTIL                          Optional observed_at upper bound, e.g. 2025-01-01
  CONCURRENCY                    Weather fetch concurrency, default 3
  CACHE_DIR                      Default .next/weather-feature-cache
  WRITE_FEATURES=1 / DRY_RUN=0   Enable upsert. Writes are OFF by default (dry-run).
  SKIP_EXISTING=0                Rebuild rows already present
  WRITE_ERRORS=1                 Persist unavailable/error rows; off by default
  --json                         Print machine-readable JSON summary
`);
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const FROST_CLIENT_ID = process.env.MET_FROST_CLIENT_ID || null;
const LIMIT = clampInt(Number(process.env.LIMIT || 100), 1, 5000);
const OFFSET = clampInt(Number(process.env.OFFSET || 0), 0, Number.MAX_SAFE_INTEGER);
const REGION = process.env.REGION && ['NO', 'SE'].includes(process.env.REGION) ? process.env.REGION : null;
const SPECIES_ID_RAW = process.env.SPECIES_ID ? Number(process.env.SPECIES_ID) : null;
const SPECIES_ID = Number.isFinite(SPECIES_ID_RAW) ? SPECIES_ID_RAW : null;
const SINCE = process.env.SINCE || null;
const UNTIL = process.env.UNTIL || null;
const CONCURRENCY = clampInt(Number(process.env.CONCURRENCY || 3), 1, 8);
const CACHE_DIR = process.env.CACHE_DIR || '.next/weather-feature-cache';

// Bounding boxes (mirror src/lib/utils/region.ts) used to narrow the occurrence
// query to a region server-side. Without this, a REGION=SE batch would have to
// scan the NO-dominated low ids to find Swedish rows. The boxes overlap; the
// client-side noSeBorderLon() check below still refines NO vs SE within it.
const REGION_BBOX = {
  NO: { minLat: 57.7, maxLat: 71.5, minLon: 4.0, maxLon: 31.5 },
  SE: { minLat: 55.2, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 }
};
// Safe by default: never upsert unless writes are explicitly enabled, so a
// direct invocation can't accidentally write to the DB. The runner passes
// DRY_RUN=0 when WRITE_FEATURES=1; a direct caller can use either flag.
const DRY_RUN = !(process.env.DRY_RUN === '0' || process.env.WRITE_FEATURES === '1');
const SKIP_EXISTING = process.env.SKIP_EXISTING !== '0';
const WRITE_ERRORS = process.env.WRITE_ERRORS === '1';
const JSON_OUTPUT = args.has('--json') || process.env.JSON === '1';
const SMHI_STATION_CANDIDATES = clampInt(Number(process.env.SMHI_STATION_CANDIDATES || 4), 1, 10);

const NEUTRAL_HUMIDITY_PCT = 75;
const DAY_MS = 24 * 60 * 60 * 1000;
const FROST_BASE = 'https://frost.met.no';
const FROST_DAILY_ELEMENTS =
  'mean(air_temperature P1D),mean(relative_humidity P1D),sum(precipitation_amount P1D),min(air_temperature P1D),max(air_temperature P1D)';
const SMHI_BASE = 'https://opendata-download-metobs.smhi.se/api/version/latest';
const SMHI_PARAM = {
  airTemp: 1,
  precip24h: 5,
  humidity: 6,
  minTempDay: 19,
  maxTempDay: 20
};

const NORWAY = { minLat: 57.7, maxLat: 71.5, minLon: 4.0, maxLon: 31.5 };
const SWEDEN = { minLat: 55.2, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 };

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function dateMs(iso) {
  return Date.parse(`${iso}T00:00:00Z`);
}

function endOfDateMs(iso) {
  return dateMs(iso) + DAY_MS;
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

function approxDistanceSq(stationLat, stationLon, lat, lon) {
  const dLat = stationLat - lat;
  const dLon = (stationLon - lon) * Math.cos((lat * Math.PI) / 180);
  return dLat * dLat + dLon * dLon;
}

function evapotranspirationMmPerDay(meanTempC) {
  return Math.max(0, Math.min(5, 0.18 * meanTempC));
}

function computeSoilMoistureIndex(dailyPrecipMm, meanTempC, capacityMm = 50) {
  if (!dailyPrecipMm.length || !Number.isFinite(meanTempC)) return null;
  const et = evapotranspirationMmPerDay(meanTempC);
  let soil = capacityMm * 0.5;
  for (const p of dailyPrecipMm) {
    const rain = Number.isFinite(p) && p > 0 ? p : 0;
    soil = Math.max(0, Math.min(capacityMm, soil + rain - et));
  }
  return Math.round((soil / capacityMm) * 1000) / 1000;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJsonCache(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonCache(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data)}\n`);
}

async function cachedJson(path, fetcher) {
  const cached = readJsonCache(path);
  if (cached !== null) return cached;
  const data = await fetcher();
  writeJsonCache(path, data);
  return data;
}

async function cachedText(path, fetcher) {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const data = await fetcher();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return data;
}

async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function occurrencePath(offset, limit) {
  const params = new URLSearchParams({
    select: 'id,species_id,latitude,longitude,observed_at',
    observed_at: 'not.is.null',
    order: 'id',
    offset: String(offset),
    limit: String(limit)
  });
  if (SPECIES_ID != null) params.set('species_id', `eq.${SPECIES_ID}`);
  if (SINCE) params.append('observed_at', `gte.${SINCE}`);
  if (UNTIL) params.append('observed_at', `lt.${UNTIL}`);
  // Narrow to the region's bounding box server-side so SE batches don't scan
  // the NO-dominated low ids. noSeBorderLon() still refines NO/SE in the overlap.
  const bbox = REGION ? REGION_BBOX[REGION] : null;
  if (bbox) {
    params.append('latitude', `gte.${bbox.minLat}`);
    params.append('latitude', `lte.${bbox.maxLat}`);
    params.append('longitude', `gte.${bbox.minLon}`);
    params.append('longitude', `lte.${bbox.maxLon}`);
  }
  return `species_occurrences?${params.toString()}`;
}

async function existingFeatureIds(ids) {
  // Dry-runs should work before migration 022 exists; they are often used as a
  // preflight before writing the occurrence_weather_features table.
  if (!ids.length || !SKIP_EXISTING || DRY_RUN) return new Set();
  const out = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = await rest(`occurrence_weather_features?select=occurrence_id&occurrence_id=in.(${chunk.join(',')})`);
    for (const row of rows ?? []) out.add(Number(row.occurrence_id));
  }
  return out;
}

function frostAuthHeader() {
  return `Basic ${Buffer.from(`${FROST_CLIENT_ID}:`).toString('base64')}`;
}

async function frostGet(path, params, auth) {
  const res = await fetch(`${FROST_BASE}${path}?${new URLSearchParams(params).toString()}`, {
    headers: { Authorization: auth, Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Frost ${res.status}: ${await res.text()}`);
  return res.json();
}

async function frostNearestSources(lat, lon, auth) {
  const key = join(CACHE_DIR, 'frost', `sources-${lat.toFixed(3)}-${lon.toFixed(3)}.json`);
  const json = await cachedJson(key, () =>
    frostGet(
      '/sources/v0.jsonld',
      {
        types: 'SensorSystem',
        geometry: `nearest(POINT(${lon} ${lat}))`,
        nearestmaxcount: '10'
      },
      auth
    )
  );
  return (json?.data ?? [])
    .map((d) => String(d.id ?? ''))
    .filter((id) => id.length > 0);
}

function collectFrostSeries(data) {
  const byElement = new Map();
  for (const item of data ?? []) {
    const source = String(item.sourceId ?? '').split(':')[0];
    const time = item.referenceTime ? Date.parse(item.referenceTime) : NaN;
    if (!source || !Number.isFinite(time)) continue;
    for (const obs of item.observations ?? []) {
      const value = Number(obs.value);
      if (!obs.elementId || !Number.isFinite(value)) continue;
      const arr = byElement.get(obs.elementId) ?? [];
      arr.push({ source, time, value });
      byElement.set(obs.elementId, arr);
    }
  }
  return byElement;
}

function nearestSeries(series, sourcesByDistance) {
  if (!series || series.length === 0) return [];
  for (const src of sourcesByDistance) {
    const matched = series.filter((p) => p.source === src);
    if (matched.length) return matched;
  }
  return [];
}

function latestWithin(series, startMs, endMs) {
  const values = series.filter((p) => p.time >= startMs && p.time < endMs);
  if (!values.length) return null;
  return values.reduce((latest, p) => (p.time > latest.time ? p : latest)).value;
}

function sumWithinDays(series, days, targetEndMs) {
  const cutoff = targetEndMs - days * DAY_MS;
  return series.reduce((sum, p) => (p.time >= cutoff && p.time < targetEndMs && p.value >= 0 ? sum + p.value : sum), 0);
}

function extremeWithinDays(series, days, targetEndMs, pick) {
  const cutoff = targetEndMs - days * DAY_MS;
  const values = series.filter((p) => p.time >= cutoff && p.time < targetEndMs).map((p) => p.value);
  if (!values.length) return null;
  return pick === 'min' ? Math.min(...values) : Math.max(...values);
}

async function frostHistoricalFeatures(occ) {
  if (!FROST_CLIENT_ID) {
    throw new Error('missing_MET_FROST_CLIENT_ID');
  }
  const auth = frostAuthHeader();
  const sources = await frostNearestSources(occ.latitude, occ.longitude, auth);
  if (!sources.length) throw new Error('frost_no_nearby_sources');

  const targetStart = dateMs(occ.observed_at);
  const targetEnd = targetStart + DAY_MS;
  const startIso = isoDate(new Date(targetEnd - 14 * DAY_MS));
  const endIso = isoDate(new Date(targetEnd + DAY_MS));
  const cacheKey = join(CACHE_DIR, 'frost', `obs-${sources.join('_')}-${startIso}-${endIso}.json`);
  const daily = await cachedJson(cacheKey, () =>
    frostGet(
      '/observations/v0.jsonld',
      {
        sources: sources.join(','),
        elements: FROST_DAILY_ELEMENTS,
        referencetime: `${startIso}/${endIso}`
      },
      auth
    )
  );
  const series = collectFrostSeries(daily?.data ?? []);
  const tempSeries = nearestSeries(series.get('mean(air_temperature P1D)'), sources);
  const humiditySeries = nearestSeries(series.get('mean(relative_humidity P1D)'), sources);
  const precipSeries = nearestSeries(series.get('sum(precipitation_amount P1D)'), sources);
  const minSeries = nearestSeries(series.get('min(air_temperature P1D)'), sources);
  const maxSeries = nearestSeries(series.get('max(air_temperature P1D)'), sources);

  const temperatureC = latestWithin(tempSeries, targetStart, targetEnd);
  if (temperatureC == null) throw new Error('frost_missing_temperature');

  const precipDaily = precipSeries
    .filter((p) => p.time >= targetEnd - 14 * DAY_MS && p.time < targetEnd)
    .sort((a, b) => a.time - b.time)
    .map((p) => p.value);

  return {
    provider: 'met_frost',
    temperature_c: temperatureC,
    humidity_pct: latestWithin(humiditySeries, targetStart, targetEnd) ?? NEUTRAL_HUMIDITY_PCT,
    rain_3d_mm: sumWithinDays(precipSeries, 3, targetEnd),
    rain_7d_mm: sumWithinDays(precipSeries, 7, targetEnd),
    rain_14d_mm: precipSeries.length ? sumWithinDays(precipSeries, 14, targetEnd) : null,
    min_temp_7d_c: extremeWithinDays(minSeries, 7, targetEnd, 'min'),
    max_temp_7d_c: extremeWithinDays(maxSeries, 7, targetEnd, 'max'),
    soil_moisture_index: computeSoilMoistureIndex(precipDaily, temperatureC),
    source_station_ids: sources.map((s) => `frost:${s}`)
  };
}

async function smhiStations(parameterId) {
  const cacheKey = join(CACHE_DIR, 'smhi', `stations-${parameterId}.json`);
  const json = await cachedJson(cacheKey, async () => {
    const res = await fetch(`${SMHI_BASE}/parameter/${parameterId}.json`);
    if (!res.ok) throw new Error(`SMHI station ${parameterId} ${res.status}: ${await res.text()}`);
    return res.json();
  });
  return Array.isArray(json?.station) ? json.station : [];
}

function stationCoversDate(station, targetMs) {
  const from = Number(station.from);
  const to = Number(station.to);
  return (!Number.isFinite(from) || targetMs >= from) && (!Number.isFinite(to) || targetMs <= to);
}

async function nearestSmhiStations(parameterId, lat, lon, targetMs) {
  const stations = await smhiStations(parameterId);
  return stations
    .filter((s) => {
      const key = s.key ?? s.id;
      return key != null && typeof s.latitude === 'number' && typeof s.longitude === 'number' && stationCoversDate(s, targetMs);
    })
    .sort((a, b) => approxDistanceSq(a.latitude, a.longitude, lat, lon) - approxDistanceSq(b.latitude, b.longitude, lat, lon))
    .slice(0, SMHI_STATION_CANDIDATES);
}

function smhiStationKey(station) {
  return String(station.key ?? station.id);
}

function parseSmhiCsv(csv) {
  const rows = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!/^\d{4}-\d{2}-\d{2};/.test(line)) continue;
    const cols = line.split(';');
    const date = cols[0];
    const time = cols[1] || '00:00:00';
    const value = Number(String(cols[2]).replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    rows.push({ time: Date.parse(`${date}T${time}Z`), date, value });
  }
  return rows.filter((r) => Number.isFinite(r.time));
}

async function smhiArchiveSeries(parameterId, station) {
  const key = smhiStationKey(station);
  const cacheKey = join(CACHE_DIR, 'smhi', `archive-${parameterId}-${key}.csv`);
  const csv = await cachedText(cacheKey, async () => {
    const res = await fetch(`${SMHI_BASE}/parameter/${parameterId}/station/${key}/period/corrected-archive/data.csv`);
    if (!res.ok) throw new Error(`SMHI archive ${parameterId}/${key} ${res.status}: ${await res.text()}`);
    return res.text();
  });
  return parseSmhiCsv(csv);
}

async function firstSmhiSeriesWithData(parameterId, occ, needsWindowDays) {
  const targetEnd = endOfDateMs(occ.observed_at);
  const stations = await nearestSmhiStations(parameterId, occ.latitude, occ.longitude, targetEnd - 1);
  for (const station of stations) {
    const series = await smhiArchiveSeries(parameterId, station);
    const start = targetEnd - needsWindowDays * DAY_MS;
    if (series.some((p) => p.time >= start && p.time < targetEnd)) {
      return { station, series };
    }
  }
  return null;
}

function meanOnDate(series, iso) {
  const values = series.filter((p) => p.date === iso).map((p) => p.value);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function smhiHistoricalFeatures(occ) {
  const targetEnd = endOfDateMs(occ.observed_at);
  const [temp, rain, humidity, minTemp, maxTemp] = await Promise.all([
    firstSmhiSeriesWithData(SMHI_PARAM.airTemp, occ, 1),
    firstSmhiSeriesWithData(SMHI_PARAM.precip24h, occ, 14),
    firstSmhiSeriesWithData(SMHI_PARAM.humidity, occ, 1),
    firstSmhiSeriesWithData(SMHI_PARAM.minTempDay, occ, 7),
    firstSmhiSeriesWithData(SMHI_PARAM.maxTempDay, occ, 7)
  ]);

  if (!temp) throw new Error('smhi_missing_temperature');
  const temperatureC = meanOnDate(temp.series, occ.observed_at);
  if (temperatureC == null) throw new Error('smhi_missing_temperature_on_date');

  const rainSeries = rain?.series ?? [];
  const precipDaily = rainSeries
    .filter((p) => p.time >= targetEnd - 14 * DAY_MS && p.time < targetEnd)
    .sort((a, b) => a.time - b.time)
    .map((p) => p.value);
  const stationIds = [
    temp ? `smhi:${SMHI_PARAM.airTemp}:${smhiStationKey(temp.station)}` : null,
    rain ? `smhi:${SMHI_PARAM.precip24h}:${smhiStationKey(rain.station)}` : null,
    humidity ? `smhi:${SMHI_PARAM.humidity}:${smhiStationKey(humidity.station)}` : null,
    minTemp ? `smhi:${SMHI_PARAM.minTempDay}:${smhiStationKey(minTemp.station)}` : null,
    maxTemp ? `smhi:${SMHI_PARAM.maxTempDay}:${smhiStationKey(maxTemp.station)}` : null
  ].filter(Boolean);

  return {
    provider: 'smhi',
    temperature_c: temperatureC,
    humidity_pct: humidity ? meanOnDate(humidity.series, occ.observed_at) ?? NEUTRAL_HUMIDITY_PCT : NEUTRAL_HUMIDITY_PCT,
    rain_3d_mm: rain ? sumWithinDays(rain.series, 3, targetEnd) : 0,
    rain_7d_mm: rain ? sumWithinDays(rain.series, 7, targetEnd) : 0,
    rain_14d_mm: rain ? sumWithinDays(rain.series, 14, targetEnd) : null,
    min_temp_7d_c: minTemp ? extremeWithinDays(minTemp.series, 7, targetEnd, 'min') : null,
    max_temp_7d_c: maxTemp ? extremeWithinDays(maxTemp.series, 7, targetEnd, 'max') : null,
    soil_moisture_index: computeSoilMoistureIndex(precipDaily, temperatureC),
    source_station_ids: stationIds
  };
}

async function featureForOccurrence(occ) {
  const region = getRegion(occ.latitude, occ.longitude);
  if (REGION && region !== REGION) return null;

  try {
    const weather =
      region === 'NO'
        ? await frostHistoricalFeatures(occ)
        : region === 'SE'
          ? await smhiHistoricalFeatures(occ)
          : null;
    if (!weather) throw new Error(`unsupported_region_${region}`);
    return {
      occurrence_id: occ.id,
      species_id: occ.species_id,
      observed_at: occ.observed_at,
      latitude: occ.latitude,
      longitude: occ.longitude,
      region,
      ...weather,
      error: null,
      updated_at: new Date().toISOString()
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (!WRITE_ERRORS) {
      return { skipped: true, error, region, occurrence_id: occ.id };
    }
    return {
      occurrence_id: occ.id,
      species_id: occ.species_id,
      observed_at: occ.observed_at,
      latitude: occ.latitude,
      longitude: occ.longitude,
      region,
      provider: 'unavailable',
      temperature_c: null,
      humidity_pct: null,
      rain_3d_mm: null,
      rain_7d_mm: null,
      rain_14d_mm: null,
      min_temp_7d_c: null,
      max_temp_7d_c: null,
      soil_moisture_index: null,
      source_station_ids: [],
      error,
      updated_at: new Date().toISOString()
    };
  }
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

async function upsertFeatures(rows) {
  if (!rows.length || DRY_RUN) return;
  await rest('occurrence_weather_features?on_conflict=occurrence_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  });
}

async function main() {
  ensureDir(CACHE_DIR);

  // Collect up to LIMIT region-matched occurrences. Region-matched rows are
  // interleaved by id (the low ids are NO-heavy), so a REGION batch pages
  // through until it has enough rather than region-filtering a single
  // LIMIT-sized page (which can yield zero SE rows). A non-region run keeps the
  // original single-page behaviour. The bbox query narrows the scan server-side.
  const PAGE_SIZE = REGION ? 1000 : LIMIT;
  const MAX_SCAN = REGION ? 80000 : LIMIT;
  const matched = [];
  let scanned = 0;
  let offset = OFFSET;
  while (matched.length < LIMIT && scanned < MAX_SCAN) {
    const rows = await rest(occurrencePath(offset, PAGE_SIZE));
    const batch = (rows ?? [])
      .map((r) => ({
        id: Number(r.id),
        species_id: r.species_id == null ? null : Number(r.species_id),
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        observed_at: r.observed_at
      }))
      .filter((r) => Number.isFinite(r.id) && Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.observed_at);
    if (!batch.length) break;
    scanned += batch.length;
    offset += batch.length;
    for (const o of batch) {
      if (!REGION || getRegion(o.latitude, o.longitude) === REGION) matched.push(o);
      if (matched.length >= LIMIT) break;
    }
    if (batch.length < PAGE_SIZE) break; // exhausted the table
    if (!REGION) break; // non-region run: a single page of LIMIT rows
  }

  const regionFiltered = matched.slice(0, LIMIT);
  const existing = await existingFeatureIds(regionFiltered.map((o) => o.id));
  const todo = regionFiltered.filter((o) => !existing.has(o.id));
  const results = await mapLimit(todo, CONCURRENCY, async (occ, idx) => {
    const result = await featureForOccurrence(occ);
    if (!JSON_OUTPUT && (idx + 1) % 25 === 0) process.stdout.write(`  processed ${idx + 1}/${todo.length}\r`);
    return result;
  });
  const good = results.filter((r) => r && !r.skipped);
  const skipped = results.filter((r) => r?.skipped);
  await upsertFeatures(good);

  const byRegion = {};
  for (const row of good) byRegion[row.region] = (byRegion[row.region] ?? 0) + 1;
  const errors = {};
  for (const row of skipped) errors[row.error] = (errors[row.error] ?? 0) + 1;

  const report = {
    filters: {
      limit: LIMIT,
      offset: OFFSET,
      region: REGION,
      speciesId: SPECIES_ID,
      since: SINCE,
      until: UNTIL,
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
      writeErrors: WRITE_ERRORS
    },
    inspected: scanned,
    regionMatched: regionFiltered.length,
    existingSkipped: existing.size,
    attempted: todo.length,
    featuresReady: good.length,
    byRegion,
    skippedErrors: {
      count: skipped.length,
      errors
    },
    cacheDir: CACHE_DIR,
    frostClientConfigured: Boolean(FROST_CLIENT_ID)
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n=== Occurrence weather feature build ===');
  console.log(`Inspected: ${report.inspected}  | region-matched: ${report.regionMatched}  | existing skipped: ${report.existingSkipped}  | attempted: ${report.attempted}`);
  console.log(`Features ready: ${report.featuresReady}${DRY_RUN ? ' (dry-run, not written)' : ''}`);
  console.log(`By region: ${JSON.stringify(report.byRegion)}`);
  console.log(`Skipped/errors not written: ${report.skippedErrors.count} ${JSON.stringify(report.skippedErrors.errors)}`);
  console.log(`Cache dir: ${report.cacheDir}`);
  if (!FROST_CLIENT_ID) console.log('Note: MET_FROST_CLIENT_ID missing; NO rows will be skipped unless WRITE_ERRORS=1.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
