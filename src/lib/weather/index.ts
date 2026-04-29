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

async function fetchSmhi(_opts: WeatherFetchOptions): Promise<WeatherSummary | null> {
  // TODO: implement against https://opendata-download-metobs.smhi.se/api
  // SMHI doesn't require a key. Pattern:
  // 1. GET /version/latest/parameter/1.json -> air temp stations
  // 2. Find nearest station to (lat, lon) by simple distance
  // 3. GET /version/latest/parameter/<id>/station/<id>/period/latest-months/data.json
  //    for params: 1 (air temp), 5 (precip), 6 (humidity)
  return null;
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
