import { NextRequest, NextResponse } from 'next/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { fetchDailyForecast } from '@/lib/weather/forecast';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { assessFlush } from '@/lib/prediction/flush';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { observedRainWindows, rainWindowsFromSeries, sumLastN } from '@/lib/weather/windows';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * 7-day "soppforhold"-trend for the home page.
 *
 * Every day in the strip — today included — is scored on the SAME trailing rain
 * windows, taken from one continuous daily series: the observed past followed by
 * the forecast future. That is what makes the bars comparable to each other.
 *
 * The previous version scored today on the adapter's own 14-day sum and days 1-6
 * on a sliding 7-day sum, which stepped the strip down between today and
 * tomorrow under unchanged weather. See the comment in GET for the detail.
 */

export const runtime = 'nodejs';

function num(value: string | null): number {
  // Number(null) is 0, so a missing parameter would otherwise pass the range
  // check as a valid 0,0 coordinate instead of being rejected.
  if (value == null || value.trim() === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

const cache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

// Short weekday labels for the 7-day strip, per language. Written out rather
// than derived from Intl so the Norwegian labels stay exactly as they were
// (Intl's nb-NO short weekdays carry a trailing period) and the Swedish ones
// are the ones a Swedish reader expects (lör/sön/tis, not lør/søn/tir).
const WEEKDAYS: Record<Locale, string[]> = {
  nb: ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'],
  sv: ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör']
};
const TODAY_LABEL: Record<Locale, string> = { nb: 'I dag', sv: 'I dag' };

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

  // The payload carries user-facing text (verdict, flush banner, weekday
  // labels), so the reader's language is part of the cache identity.
  const locale = await getUserLocale();
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const month = now.getMonth() + 1;
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${todayKey},${locale}`;
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

    const future = (forecast ?? []).filter((d) => d.date > todayKey).slice(0, 6);

    // ONE yardstick for all seven days. `series` is the observed daily rainfall
    // followed by the forecast daily rainfall, so day 0 and day 6 are measured
    // the same way: the trailing N days ending on that day.
    //
    // This is the bug the founder reported. Day 0 used to be scored on the
    // adapter's 14-day sum while days 1-6 fell back to a 7-day sum (the route
    // passed rain14dMm: null for them), and cumulativeRain() in mushroom-day.ts
    // silently picks the longest window available. Same threshold table, two
    // different windows — so the strip stepped down ~10-20 points between today
    // and tomorrow under completely unchanged weather.
    //
    // Day 0 must come from the series too. Mixing the adapter's own rain14dMm
    // into day 0 while days 1-6 use the series would reintroduce a smaller
    // version of the same discontinuity.
    const observedSeries = observed.precipDailyMm?.slice(-14) ?? null;
    const series = observedSeries ? [...observedSeries, ...future.map((d) => d.precipMm)] : null;
    const obsLen = observedSeries?.length ?? 0;

    const today = assessMushroomDay(
      {
        temperatureC: observed.temperatureC,
        humidityPct: observed.humidityPct,
        // Shared helper, so /api/mushroom-day reports the same number for the
        // same day and place.
        ...observedRainWindows(observed),
        minTemp7dC: observed.minTemp7dC,
        maxTemp7dC: observed.maxTemp7dC,
        // The bucket model dries out as the ground does, so it can veto a
        // celebration the raw rain sum would still allow. See mushroom-day.ts.
        soilMoistureIndex: observed.soilMoistureIndex
      },
      month,
      locale
    );

    const weekdays = WEEKDAYS[locale] ?? WEEKDAYS[DEFAULT_LOCALE];
    const days: { date: string; label: string; isToday: boolean; score: number; optimal: boolean }[] = [
      {
        date: todayKey,
        label: TODAY_LABEL[locale] ?? TODAY_LABEL[DEFAULT_LOCALE],
        isToday: true,
        score: today.score,
        optimal: today.optimal
      }
    ];

    const observedRain7d = observed.rain7dMm ?? observed.rain3dMm * 2;
    let forecastAccum = 0;
    const recent3: number[] = [];
    future.forEach((d, idx) => {
      const i = idx + 1; // 1..6 days ahead
      forecastAccum += d.precipMm;
      recent3.push(d.precipMm);
      if (recent3.length > 3) recent3.shift();
      const w = series ? series.slice(0, obsLen + i) : null;
      // Same trailing windows as day 0 when we have the daily series. The
      // fallback below is for providers with no daily history (OpenWeather):
      // it still slides ONE window every day, so the strip stays internally
      // consistent — just coarser.
      const windows = w
        ? rainWindowsFromSeries(w)
        : {
            rain3dMm: recent3.reduce((a, b) => a + b, 0),
            rain7dMm: (observedRain7d * Math.max(0, 7 - i)) / 7 + forecastAccum,
            rain14dMm: null
          };
      const dayDate = new Date(`${d.date}T12:00:00Z`);
      const a = assessMushroomDay(
        {
          temperatureC: d.tempC,
          humidityPct: d.humidityPct,
          ...windows,
          minTemp7dC: null,
          maxTemp7dC: null
        },
        dayDate.getUTCMonth() + 1,
        locale
      );
      days.push({
        date: d.date,
        label: weekdays[dayDate.getUTCDay()],
        isToday: false,
        score: a.score,
        optimal: a.optimal
      });
    });

    // Flush timing — "should I go now, or wait?" — from the moisture base now
    // plus the upcoming forecast rain.
    const flush = assessFlush(
      {
        month,
        soilMoistureIndex: observed.soilMoistureIndex,
        rain7dMm: observed.rain7dMm ?? observed.rain3dMm * 2,
        currentTempC: observed.temperatureC,
        forecast: future
      },
      undefined,
      locale
    );

    const payload = { today, days, flush, hasForecast: future.length > 0, weatherSource: observed.source };
    cache.set(cacheKey, { at: Date.now(), payload });
    // Coarse (~1 km) on purpose — server logs must not hold a position trail.
    log.info('mushroom_forecast.success', {
      lat: Number(lat.toFixed(2)),
      lon: Number(lon.toFixed(2)),
      days: days.length,
      hasForecast: future.length > 0
    });

    return NextResponse.json(payload);
  } catch (error) {
    log.error('mushroom_forecast.failed', error);
    return NextResponse.json(
      { error: 'Kunne ikke hente soppvarsel', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
