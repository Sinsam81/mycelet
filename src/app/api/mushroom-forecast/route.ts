import { NextRequest, NextResponse } from 'next/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { fetchDailyForecast } from '@/lib/weather/forecast';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * 7-day "soppforhold"-trend for the home page. Day 0 uses observed weather (so it
 * matches /api/mushroom-day); days 1–6 score the MET forecast with a sliding,
 * projected 7-day rain base (observed past rain decaying out of the window as
 * forecast rain accumulates in). A forecast, framed as such.
 */

export const runtime = 'nodejs';

function num(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

const cache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const WEEKDAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const url = new URL(request.url);
  const lat = num(url.searchParams.get('lat'));
  const lon = num(url.searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Mangler eller ugyldige koordinater' }, { status: 400 });
  }

  const rl = checkRateLimit(`mushroom-forecast:${getClientKey(request, null)}`, 20, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const month = now.getMonth() + 1;
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${todayKey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  try {
    const [observed, forecast] = await Promise.all([
      fetchWeatherSummary({ lat, lon }),
      fetchDailyForecast({ lat, lon })
    ]);
    if (!observed) {
      return NextResponse.json({ error: 'Værdata ikke tilgjengelig for området' }, { status: 502 });
    }

    const today = assessMushroomDay(
      {
        temperatureC: observed.temperatureC,
        humidityPct: observed.humidityPct,
        rain3dMm: observed.rain3dMm,
        rain7dMm: observed.rain7dMm,
        rain14dMm: observed.rain14dMm,
        minTemp7dC: observed.minTemp7dC,
        maxTemp7dC: observed.maxTemp7dC
      },
      month
    );

    const days: { date: string; label: string; score: number; optimal: boolean }[] = [
      { date: todayKey, label: 'I dag', score: today.score, optimal: today.optimal }
    ];

    const future = (forecast ?? []).filter((d) => d.date > todayKey).slice(0, 6);
    const observedRain7d = observed.rain7dMm ?? observed.rain3dMm * 2;
    let forecastAccum = 0;
    const recent3: number[] = [];
    future.forEach((d, idx) => {
      const i = idx + 1; // 1..6 days ahead
      forecastAccum += d.precipMm;
      recent3.push(d.precipMm);
      if (recent3.length > 3) recent3.shift();
      // Sliding 7-day rain: observed past decays out of the window, forecast accumulates in.
      const rain7d = (observedRain7d * Math.max(0, 7 - i)) / 7 + forecastAccum;
      const rain3d = recent3.reduce((a, b) => a + b, 0);
      const dayDate = new Date(`${d.date}T12:00:00Z`);
      const a = assessMushroomDay(
        {
          temperatureC: d.tempC,
          humidityPct: d.humidityPct,
          rain3dMm: rain3d,
          rain7dMm: rain7d,
          rain14dMm: null,
          minTemp7dC: null,
          maxTemp7dC: null
        },
        dayDate.getUTCMonth() + 1
      );
      days.push({ date: d.date, label: WEEKDAYS[dayDate.getUTCDay()], score: a.score, optimal: a.optimal });
    });

    const payload = { today, days, hasForecast: future.length > 0, weatherSource: observed.source };
    cache.set(cacheKey, { at: Date.now(), payload });
    log.info('mushroom_forecast.success', { lat, lon, days: days.length, hasForecast: future.length > 0 });

    return NextResponse.json(payload);
  } catch (error) {
    log.error('mushroom_forecast.failed', error);
    return NextResponse.json(
      { error: 'Kunne ikke hente soppvarsel', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
