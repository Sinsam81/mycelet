import { getRegion } from '@/lib/utils/region';

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

async function fetchFrost(_opts: WeatherFetchOptions): Promise<WeatherSummary | null> {
  // TODO: implement once MET_FROST_CLIENT_ID is configured.
  // Steps:
  // 1. POST /sources/v0.jsonld?types=SensorSystem&geometry=nearest({lon} {lat})&nearestmaxcount=3
  //    -> get nearest weather station IDs
  // 2. GET /observations/v0.jsonld
  //      ?sources=<ids>
  //      &elements=air_temperature,relative_humidity,sum(precipitation_amount P1D)
  //      &referencetime=<now-14d>/<now>
  //    -> aggregate to 3d/7d/14d totals
  return null;
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

  return {
    source: 'smhi',
    temperatureC,
    humidityPct: latestNumeric(humidData) ?? 0,
    rain3dMm: sumWithinDays(rainData, 3, now),
    rain7dMm: sumWithinDays(rainData, 7, now),
    rain14dMm: sumWithinDays(rainData, 14, now),
    minTemp7dC: extremeWithinDays(minData, 7, now, 'min'),
    maxTemp7dC: extremeWithinDays(maxData, 7, now, 'max')
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
    maxTemp7dC: null
  };
}
