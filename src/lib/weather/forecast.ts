/**
 * Multi-day weather forecast via MET Norway Locationforecast 2.0 — free, global,
 * no API key (requires an identifying User-Agent). Powers the home page's 7-day
 * "soppforhold"-trend. Distinct from `fetchWeatherSummary`, which returns recent
 * OBSERVED weather (the moisture base); this is the forward forecast.
 */

const FORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

export interface DailyForecast {
  /** YYYY-MM-DD (UTC). */
  date: string;
  tempC: number;
  precipMm: number;
  humidityPct: number;
}

export interface ForecastTimeStep {
  time: string;
  data: {
    instant?: { details?: { air_temperature?: number; relative_humidity?: number } };
    next_1_hours?: { details?: { precipitation_amount?: number } };
    next_6_hours?: { details?: { precipitation_amount?: number } };
  };
}

/**
 * Collapse MET's mixed hourly + 6-hourly timeseries into per-day aggregates.
 * Pure. Precipitation prefers the 1-hour window (no overlap between consecutive
 * hourly steps) and falls back to the 6-hour window for the coarser later steps.
 */
export function aggregateDailyForecast(timeseries: ForecastTimeStep[]): DailyForecast[] {
  const byDay = new Map<string, { temps: number[]; hums: number[]; precip: number }>();
  for (const step of timeseries) {
    const date = step.time.slice(0, 10);
    let bucket = byDay.get(date);
    if (!bucket) {
      bucket = { temps: [], hums: [], precip: 0 };
      byDay.set(date, bucket);
    }
    const inst = step.data.instant?.details ?? {};
    if (typeof inst.air_temperature === 'number') bucket.temps.push(inst.air_temperature);
    if (typeof inst.relative_humidity === 'number') bucket.hums.push(inst.relative_humidity);
    const p1 = step.data.next_1_hours?.details?.precipitation_amount;
    const p6 = step.data.next_6_hours?.details?.precipitation_amount;
    if (typeof p1 === 'number') bucket.precip += p1;
    else if (typeof p6 === 'number') bucket.precip += p6;
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, b]) => ({
      date,
      tempC: Math.round(avg(b.temps) * 10) / 10,
      precipMm: Math.round(b.precip * 10) / 10,
      humidityPct: Math.round(avg(b.hums))
    }));
}

export async function fetchDailyForecast(query: { lat: number; lon: number }): Promise<DailyForecast[] | null> {
  try {
    const res = await fetch(`${FORECAST_URL}?lat=${query.lat.toFixed(4)}&lon=${query.lon.toFixed(4)}`, {
      headers: { 'User-Agent': 'mycelet.com/1.0 support@mycelet.com' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const timeseries = json?.properties?.timeseries;
    if (!Array.isArray(timeseries)) return null;
    return aggregateDailyForecast(timeseries as ForecastTimeStep[]);
  } catch {
    return null;
  }
}
