import { getRegion } from '@/lib/utils/region';
import { computeSoilMoistureIndex } from '@/lib/weather/soil-moisture';

export interface WeatherSummary {
  source: 'met_frost' | 'smhi' | 'openweather' | 'unavailable';
  temperatureC: number;
  humidityPct: number;
  rain3dMm: number;
  rain7dMm: number;
  rain14dMm: number | null;
  // Hottest/coldest in last 7 days (frost-stress matters for mushrooms)
  minTemp7dC: number | null;
  maxTemp7dC: number | null;
  /**
   * Antecedent soil-water-balance index 0..1 (root-zone bucket over the daily
   * precip series). The mushroom-relevant moisture signal; null when the
   * provider has no daily precip history (OpenWeather). See soil-moisture.ts.
   */
  soilMoistureIndex: number | null;
}

export interface WeatherFetchOptions {
  lat: number;
  lon: number;
}

const PLACEHOLDER = 'your-api-key-here';

function isRealKey(value: string | undefined) {
  return Boolean(value && value !== PLACEHOLDER && value.length >= 10);
}

/**
 * Returns a WeatherSummary for the given coordinates, choosing the right
 * upstream provider based on country:
 *
 *   Norway -> MET Norway Frost API (https://frost.met.no)
 *     Requires MET_FROST_CLIENT_ID. Best precipitation history for Norway.
 *
 *   Sweden -> SMHI Open Data (https://opendata-download-metobs.smhi.se)
 *     No API key. Best for Swedish stations.
 *
 *   Other  -> OpenWeather forecast (legacy fallback).
 *
 * If the relevant adapter has no key configured, we currently return null
 * and let the caller decide. Real implementations live in adapters/.
 */
export async function fetchWeatherSummary({ lat, lon }: WeatherFetchOptions): Promise<WeatherSummary | null> {
  const region = getRegion(lat, lon);

  if (region === 'NO' && isRealKey(process.env.MET_FROST_CLIENT_ID)) {
    return fetchFrost({ lat, lon });
  }

  if (region === 'SE') {
    return fetchSmhi({ lat, lon });
  }

  if (isRealKey(process.env.OPENWEATHER_API_KEY)) {
    return fetchOpenWeather({ lat, lon });
  }

  return null;
}

// --- MET Frost (Norway) -------------------------------------------------

const FROST_BASE = 'https://frost.met.no';

// One daily-aggregate query covers everything we need: mean temp, mean
// humidity, accumulated rain (the strongest mushroom predictor), and temp
// extremes. Daily granularity is right for multi-day mushroom conditions, and
// the response stays small + cacheable — an earlier instant/hourly query ran
// to several MB across 10 stations and exceeded Next's 2MB fetch-cache limit.
// Daily means are also widely reported, where instant temp often isn't (the
// nearest stations to a point are frequently precip-only).
const FROST_DAILY_ELEMENTS =
  'mean(air_temperature P1D),mean(relative_humidity P1D),sum(precipitation_amount P1D),min(air_temperature P1D),max(air_temperature P1D)';

interface FrostObservation {
  elementId?: string;
  value?: number | string | null;
}
interface FrostDataItem {
  sourceId?: string;
  referenceTime?: string;
  observations?: FrostObservation[];
}
type FrostPoint = { source: string; time: number; value: number };

function frostAuthHeader(clientId: string): string {
  // Frost uses HTTP Basic with the client ID as username and empty password.
  return `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function frostGet(
  path: string,
  params: Record<string, string>,
  auth: string
): Promise<{ data?: FrostDataItem[] } | null> {
  const res = await fetch(`${FROST_BASE}${path}?${new URLSearchParams(params).toString()}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    next: { revalidate: 900 }
  });
  if (!res.ok) return null;
  return res.json();
}

/** Nearest weather stations to the point, ordered by distance (closest first). */
async function frostNearestSources(lat: number, lon: number, auth: string): Promise<string[]> {
  const json = await frostGet(
    '/sources/v0.jsonld',
    {
      types: 'SensorSystem',
      geometry: `nearest(POINT(${lon} ${lat}))`,
      // Wide enough to catch a temperature-reporting station — the closest
      // few are often precip-only (no air temperature).
      nearestmaxcount: '10'
    },
    auth
  );
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => String((d as { id?: string }).id ?? ''))
    .filter((id) => id.length > 0);
}

/** Flatten Frost data items into per-element time series. */
function collectFrostSeries(data: FrostDataItem[]): Map<string, FrostPoint[]> {
  const byElement = new Map<string, FrostPoint[]>();
  for (const item of data) {
    // Observation sourceIds carry a sensor suffix ("SN18700:0"); the /sources
    // list does not ("SN18700"). Normalize to the base id so they match.
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

/** Pick the series from the nearest source that actually has data for this element. */
function nearestSeries(series: FrostPoint[] | undefined, sourcesByDistance: string[]): FrostPoint[] {
  if (!series || series.length === 0) return [];
  for (const src of sourcesByDistance) {
    const matched = series.filter((p) => p.source === src);
    if (matched.length) return matched;
  }
  return [];
}

function latestValue(series: FrostPoint[]): number | null {
  if (series.length === 0) return null;
  return series.reduce((latest, p) => (p.time > latest.time ? p : latest)).value;
}

function frostSumWithinDays(series: FrostPoint[], days: number, now: number): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return series.reduce(
    (sum, p) => (p.time >= cutoff && p.value >= 0 ? sum + p.value : sum),
    0
  );
}

function frostExtremeWithinDays(
  series: FrostPoint[],
  days: number,
  now: number,
  pick: 'min' | 'max'
): number | null {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const values = series.filter((p) => p.time >= cutoff).map((p) => p.value);
  if (values.length === 0) return null;
  return pick === 'min' ? Math.min(...values) : Math.max(...values);
}

async function fetchFrost({ lat, lon }: WeatherFetchOptions): Promise<WeatherSummary | null> {
  const clientId = process.env.MET_FROST_CLIENT_ID;
  if (!isRealKey(clientId)) return null;
  const auth = frostAuthHeader(clientId as string);

  const sources = await frostNearestSources(lat, lon, auth);
  if (sources.length === 0) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Single daily-aggregate query over 14 days. +1d pad so today is in range.
  const daily = await frostGet(
    '/observations/v0.jsonld',
    {
      sources: sources.join(','),
      elements: FROST_DAILY_ELEMENTS,
      referencetime: `${isoDate(new Date(now - 14 * dayMs))}/${isoDate(new Date(now + dayMs))}`
    },
    auth
  );
  if (!daily?.data) return null;

  const series = collectFrostSeries(daily.data);

  // Each metric comes from the nearest station that actually reports it —
  // temp from the nearest temp station, rain from the nearest precip station.
  const temperatureC = latestValue(nearestSeries(series.get('mean(air_temperature P1D)'), sources));
  // Temperature is mandatory — without it there's no usable summary.
  if (temperatureC === null) return null;

  const humidSeries = nearestSeries(series.get('mean(relative_humidity P1D)'), sources);
  const precipSeries = nearestSeries(series.get('sum(precipitation_amount P1D)'), sources);
  const minSeries = nearestSeries(series.get('min(air_temperature P1D)'), sources);
  const maxSeries = nearestSeries(series.get('max(air_temperature P1D)'), sources);

  // Daily precip oldest→newest over the 14-day window → soil-water bucket.
  const precipDaily = [...precipSeries].sort((a, b) => a.time - b.time).map((p) => p.value);

  return {
    source: 'met_frost',
    temperatureC,
    humidityPct: latestValue(humidSeries) ?? 0,
    rain3dMm: frostSumWithinDays(precipSeries, 3, now),
    rain7dMm: frostSumWithinDays(precipSeries, 7, now),
    rain14dMm: precipSeries.length ? frostSumWithinDays(precipSeries, 14, now) : null,
    minTemp7dC: frostExtremeWithinDays(minSeries, 7, now, 'min'),
    maxTemp7dC: frostExtremeWithinDays(maxSeries, 7, now, 'max'),
    soilMoistureIndex: computeSoilMoistureIndex(precipDaily, temperatureC)
  };
}

// --- SMHI Open Data (Sweden) -------------------------------------------

const SMHI_BASE = 'https://opendata-download-metobs.smhi.se/api/version/latest';

// SMHI parameter IDs we care about for mushroom prediction.
const SMHI_PARAM = {
  airTemp: 1,        // momentary, hourly
  precip24h: 5,      // 24h sum (07-07)
  humidity: 6,       // momentary, hourly
  minTempDay: 19,    // daily min
  maxTempDay: 20     // daily max
} as const;

interface SmhiStation {
  key?: string | number;
  id?: number;
  name?: string;
  active?: boolean;
  latitude?: number;
  longitude?: number;
}

interface SmhiDataPoint {
  date?: number;
  value?: string | number | null;
  quality?: string;
}

async function smhiFetchStations(parameterId: number): Promise<SmhiStation[] | null> {
  const res = await fetch(`${SMHI_BASE}/parameter/${parameterId}.json`, {
    next: { revalidate: 86400 }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data?.station) ? data.station : null;
}

async function smhiFetchData(
  parameterId: number,
  stationKey: string | number,
  period: 'latest-hour' | 'latest-day' | 'latest-months'
): Promise<SmhiDataPoint[] | null> {
  const res = await fetch(
    `${SMHI_BASE}/parameter/${parameterId}/station/${stationKey}/period/${period}/data.json`,
    { next: { revalidate: 900 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data?.value) ? data.value : null;
}

function approxDistanceSq(stationLat: number, stationLon: number, lat: number, lon: number) {
  // Equirectangular approximation. Good enough for ranking; Sweden is narrow.
  const dLat = stationLat - lat;
  const dLon = (stationLon - lon) * Math.cos((lat * Math.PI) / 180);
  return dLat * dLat + dLon * dLon;
}

function nearestActive(stations: SmhiStation[] | null, lat: number, lon: number): SmhiStation | null {
  if (!stations) return null;
  const candidates = stations.filter(
    (s) =>
      s.active === true &&
      typeof s.latitude === 'number' &&
      typeof s.longitude === 'number' &&
      (s.key !== undefined || s.id !== undefined)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, s) =>
    approxDistanceSq(s.latitude!, s.longitude!, lat, lon) <
    approxDistanceSq(best.latitude!, best.longitude!, lat, lon)
      ? s
      : best
  );
}

function stationKey(s: SmhiStation): string | number {
  return (s.key ?? s.id) as string | number;
}

function latestNumeric(points: SmhiDataPoint[] | null): number | null {
  if (!points) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    const v = Number(points[i]?.value);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function sumWithinDays(points: SmhiDataPoint[] | null, days: number, now: number): number {
  if (!points) return 0;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return points.reduce((sum, p) => {
    const date = Number(p?.date);
    const value = Number(p?.value);
    if (!Number.isFinite(date) || date < cutoff) return sum;
    if (!Number.isFinite(value)) return sum;
    return sum + value;
  }, 0);
}

function extremeWithinDays(
  points: SmhiDataPoint[] | null,
  days: number,
  now: number,
  pick: 'min' | 'max'
): number | null {
  if (!points) return null;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  let result: number | null = null;
  for (const p of points) {
    const date = Number(p?.date);
    const value = Number(p?.value);
    if (!Number.isFinite(date) || date < cutoff) continue;
    if (!Number.isFinite(value)) continue;
    if (result === null) result = value;
    else if (pick === 'min' && value < result) result = value;
    else if (pick === 'max' && value > result) result = value;
  }
  return result;
}

async function fetchSmhi({ lat, lon }: WeatherFetchOptions): Promise<WeatherSummary | null> {
  const [tempStations, rainStations, humidStations, minStations, maxStations] = await Promise.all([
    smhiFetchStations(SMHI_PARAM.airTemp),
    smhiFetchStations(SMHI_PARAM.precip24h),
    smhiFetchStations(SMHI_PARAM.humidity),
    smhiFetchStations(SMHI_PARAM.minTempDay),
    smhiFetchStations(SMHI_PARAM.maxTempDay)
  ]);

  // Temp + rain are required; humidity/min/max are best-effort.
  const tempStn = nearestActive(tempStations, lat, lon);
  const rainStn = nearestActive(rainStations, lat, lon);
  if (!tempStn || !rainStn) return null;

  const humidStn = nearestActive(humidStations, lat, lon);
  const minStn = nearestActive(minStations, lat, lon);
  const maxStn = nearestActive(maxStations, lat, lon);

  const [tempData, rainData, humidData, minData, maxData] = await Promise.all([
    smhiFetchData(SMHI_PARAM.airTemp, stationKey(tempStn), 'latest-hour'),
    smhiFetchData(SMHI_PARAM.precip24h, stationKey(rainStn), 'latest-months'),
    humidStn ? smhiFetchData(SMHI_PARAM.humidity, stationKey(humidStn), 'latest-hour') : Promise.resolve(null),
    minStn ? smhiFetchData(SMHI_PARAM.minTempDay, stationKey(minStn), 'latest-months') : Promise.resolve(null),
    maxStn ? smhiFetchData(SMHI_PARAM.maxTempDay, stationKey(maxStn), 'latest-months') : Promise.resolve(null)
  ]);

  const temperatureC = latestNumeric(tempData);
  if (temperatureC === null) return null;

  const now = Date.now();

  // Last ~30 daily precip values oldest→newest → soil-water bucket.
  const precipDaily = (rainData ?? [])
    .map((p) => ({ date: Number(p?.date), value: Number(p?.value) }))
    .filter((p) => Number.isFinite(p.date) && Number.isFinite(p.value))
    .sort((a, b) => a.date - b.date)
    .slice(-30)
    .map((p) => p.value);

  return {
    source: 'smhi',
    temperatureC,
    humidityPct: latestNumeric(humidData) ?? 0,
    rain3dMm: sumWithinDays(rainData, 3, now),
    rain7dMm: sumWithinDays(rainData, 7, now),
    rain14dMm: sumWithinDays(rainData, 14, now),
    minTemp7dC: extremeWithinDays(minData, 7, now, 'min'),
    maxTemp7dC: extremeWithinDays(maxData, 7, now, 'max'),
    soilMoistureIndex: computeSoilMoistureIndex(precipDaily, temperatureC)
  };
}

// --- OpenWeather (legacy fallback for outside Nordics) -----------------

async function fetchOpenWeather({ lat, lon }: WeatherFetchOptions): Promise<WeatherSummary | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!isRealKey(apiKey)) return null;

  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=no&appid=${apiKey}`,
    { next: { revalidate: 900 } }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const list = data?.list ?? [];
  const first = list[0];

  return {
    source: 'openweather',
    temperatureC: Number(first?.main?.temp ?? 0),
    humidityPct: Number(first?.main?.humidity ?? 0),
    rain3dMm: list.slice(0, 24).reduce((sum: number, item: any) => sum + Number(item?.rain?.['3h'] ?? 0), 0),
    rain7dMm: list.slice(0, 56).reduce((sum: number, item: any) => sum + Number(item?.rain?.['3h'] ?? 0), 0),
    rain14dMm: null,
    minTemp7dC: null,
    maxTemp7dC: null,
    // OpenWeather here is a short forecast, not daily precip history → no bucket.
    soilMoistureIndex: null
  };
}
