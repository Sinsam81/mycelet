import { computeSoilMoistureIndex } from '@/lib/weather/soil-moisture';

export interface HistoricalFrostFeatures {
  provider: 'met_frost';
  temperatureC: number;
  humidityPct: number | null;
  rain3dMm: number;
  rain7dMm: number;
  rain14dMm: number | null;
  minTemp7dC: number | null;
  maxTemp7dC: number | null;
  soilMoistureIndex: number | null;
  sourceStationIds: string[];
}

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
type SelectedSeries = { source: string | null; points: FrostPoint[] };

const FROST_BASE = 'https://frost.met.no';
const DAY_MS = 24 * 60 * 60 * 1000;
const PLACEHOLDER = 'your-api-key-here';
const DAILY_ELEMENTS =
  'mean(air_temperature P1D),mean(relative_humidity P1D),sum(precipitation_amount P1D),min(air_temperature P1D),max(air_temperature P1D)';

function isRealClientId(value: string | undefined): value is string {
  return Boolean(value && value !== PLACEHOLDER && value.length >= 10);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function authHeader(clientId: string): string {
  return `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`;
}

async function frostGet(path: string, params: Record<string, string>, auth: string) {
  const response = await fetch(`${FROST_BASE}${path}?${new URLSearchParams(params).toString()}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    next: { revalidate: 31_536_000 }
  });
  if (!response.ok) throw new Error(`frost_${path.includes('sources') ? 'sources' : 'observations'}_${response.status}`);
  return response.json();
}

async function nearestSources(lat: number, lon: number, observedAt: string, auth: string): Promise<string[]> {
  const json = await frostGet(
    '/sources/v0.jsonld',
    {
      types: 'SensorSystem',
      geometry: `nearest(POINT(${lon} ${lat}))`,
      nearestmaxcount: '10',
      // Frost otherwise defaults to stations valid "now", which silently
      // misses stations that existed when an older occurrence was recorded.
      validtime: observedAt
    },
    auth
  );
  return Array.isArray(json?.data)
    ? json.data.map((row: { id?: unknown }) => String(row.id ?? '')).filter(Boolean)
    : [];
}

function collectSeries(data: FrostDataItem[]): Map<string, FrostPoint[]> {
  const byElement = new Map<string, FrostPoint[]>();
  for (const item of data) {
    const source = String(item.sourceId ?? '').split(':')[0];
    const time = item.referenceTime ? Date.parse(item.referenceTime) : NaN;
    if (!source || !Number.isFinite(time)) continue;
    for (const observation of item.observations ?? []) {
      const value = Number(observation.value);
      if (!observation.elementId || !Number.isFinite(value)) continue;
      const points = byElement.get(observation.elementId) ?? [];
      points.push({ source, time, value });
      byElement.set(observation.elementId, points);
    }
  }
  return byElement;
}

function nearestSeries(series: FrostPoint[] | undefined, sources: string[]): SelectedSeries {
  for (const source of sources) {
    const points = (series ?? []).filter((point) => point.source === source);
    if (points.length) return { source, points };
  }
  return { source: null, points: [] };
}

function latestWithin(points: FrostPoint[], start: number, end: number): number | null {
  const eligible = points.filter((point) => point.time >= start && point.time < end);
  if (!eligible.length) return null;
  return eligible.reduce((latest, point) => (point.time > latest.time ? point : latest)).value;
}

function pointsWithin(points: FrostPoint[], days: number, targetEnd: number): FrostPoint[] {
  const start = targetEnd - days * DAY_MS;
  return points.filter((point) => point.time >= start && point.time < targetEnd);
}

function rainWithin(points: FrostPoint[], days: number, targetEnd: number): number {
  return pointsWithin(points, days, targetEnd).reduce(
    (sum, point) => (point.value >= 0 ? sum + point.value : sum),
    0
  );
}

function extremeWithin(
  points: FrostPoint[],
  days: number,
  targetEnd: number,
  pick: 'min' | 'max'
): number | null {
  const values = pointsWithin(points, days, targetEnd).map((point) => point.value);
  if (!values.length) return null;
  return pick === 'min' ? Math.min(...values) : Math.max(...values);
}

export async function fetchHistoricalFrostFeatures({
  lat,
  lon,
  observedAt
}: {
  lat: number;
  lon: number;
  observedAt: string;
}): Promise<HistoricalFrostFeatures> {
  const clientId = process.env.MET_FROST_CLIENT_ID;
  if (!isRealClientId(clientId)) throw new Error('missing_frost_client_id');

  const targetStart = Date.parse(`${observedAt}T00:00:00Z`);
  if (!Number.isFinite(targetStart)) throw new Error('invalid_observed_at');
  const targetEnd = targetStart + DAY_MS;
  const auth = authHeader(clientId);
  const sources = await nearestSources(lat, lon, observedAt, auth);
  if (!sources.length) throw new Error('frost_no_historical_sources');

  const json = await frostGet(
    '/observations/v0.jsonld',
    {
      sources: sources.join(','),
      elements: DAILY_ELEMENTS,
      referencetime: `${isoDate(new Date(targetEnd - 14 * DAY_MS))}/${isoDate(new Date(targetEnd))}`
    },
    auth
  );
  if (!Array.isArray(json?.data)) throw new Error('frost_no_historical_observations');

  const series = collectSeries(json.data);
  const temperature = nearestSeries(series.get('mean(air_temperature P1D)'), sources);
  const humidity = nearestSeries(series.get('mean(relative_humidity P1D)'), sources);
  const rain = nearestSeries(series.get('sum(precipitation_amount P1D)'), sources);
  const minTemp = nearestSeries(series.get('min(air_temperature P1D)'), sources);
  const maxTemp = nearestSeries(series.get('max(air_temperature P1D)'), sources);
  const temperatureC = latestWithin(temperature.points, targetStart, targetEnd);
  if (temperatureC == null) throw new Error('frost_missing_historical_temperature');

  const rain14d = pointsWithin(rain.points, 14, targetEnd).sort((a, b) => a.time - b.time);
  const sourceStationIds = [...new Set(
    [temperature.source, humidity.source, rain.source, minTemp.source, maxTemp.source]
      .filter((source): source is string => Boolean(source))
      .map((source) => `frost:${source}`)
  )];

  return {
    provider: 'met_frost',
    temperatureC,
    humidityPct: latestWithin(humidity.points, targetStart, targetEnd),
    rain3dMm: rainWithin(rain.points, 3, targetEnd),
    rain7dMm: rainWithin(rain.points, 7, targetEnd),
    rain14dMm: rain14d.length ? rain14d.reduce((sum, point) => sum + Math.max(0, point.value), 0) : null,
    minTemp7dC: extremeWithin(minTemp.points, 7, targetEnd, 'min'),
    maxTemp7dC: extremeWithin(maxTemp.points, 7, targetEnd, 'max'),
    soilMoistureIndex: computeSoilMoistureIndex(
      rain14d.map((point) => point.value),
      temperatureC
    ),
    sourceStationIds
  };
}
