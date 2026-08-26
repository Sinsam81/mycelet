import { NextRequest, NextResponse } from 'next/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { observedRainWindows } from '@/lib/weather/windows';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

// Feilstrengene vises rått i grensesnittet, så de følger leserens språk —
// kroppen i samme rute er allerede oversatt.
const COPY: Record<Locale, { badCoordinates: string; noWeather: string; failed: string }> = {
  nb: {
    badCoordinates: 'Mangler eller ugyldige koordinater (lat/lon)',
    noWeather: 'Værdata ikke tilgjengelig for området',
    failed: 'Kunne ikke vurdere soppforhold'
  },
  sv: {
    badCoordinates: 'Saknade eller ogiltiga koordinater (lat/lon)',
    noWeather: 'Väderdata är inte tillgängliga för området',
    failed: 'Kunde inte bedöma svampförhållandena'
  }
};

/**
 * "Perfekt soppdag" endpoint — returns today's mushroom-foraging verdict for a
 * location (weather + season). Lightweight and public; the daily proactive
 * notification (native push when the app ships, or a cron) calls this per user
 * area and, when `optimal`, pushes `title` + `message` + `reasons`.
 */

export const runtime = 'nodejs';

function num(value: string | null): number {
  // Number(null) is 0, so a missing parameter would otherwise pass the range
  // check as a valid 0,0 coordinate instead of being rejected.
  if (value == null || value.trim() === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// The daily verdict changes slowly, but the home page mounts this for every
// visitor — cache per coarse location + month so we don't hammer the weather
// providers. In-memory (per serverless instance); a simple throttle, not a CDN.
const dayCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const url = new URL(request.url);
  const lat = num(url.searchParams.get('lat'));
  const lon = num(url.searchParams.get('lon'));

  // Verdict + reasons are user-facing text, so the language is part of the
  // cache identity — otherwise the first caller's language wins for everyone.
  // Hentes før valideringen, siden feilteksten også er brukervendt.
  const locale = await getUserLocale();
  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: copy.badCoordinates }, { status: 400 });
  }

  const rl = checkRateLimit(`mushroom-day:${getClientKey(request, null)}`, 30, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();
  // Datoen, ikke bare måneden, er del av cache-nøkkelen: sesongleddet glir nå
  // fra dag til dag (se mushroom-day.ts), så et svar fra i går er et annet svar.
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${now.toISOString().slice(0, 10)},${locale}`;
  const cached = dayCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  try {
    const weather = await fetchWeatherSummary({ lat, lon });
    if (!weather) {
      return NextResponse.json({ error: copy.noWeather }, { status: 502 });
    }

    const assessment = assessMushroomDay(
      {
        temperatureC: weather.temperatureC,
        humidityPct: weather.humidityPct,
        // Same windows the home card uses, or the two surfaces would report
        // different scores for the same day and place.
        ...observedRainWindows(weather),
        minTemp7dC: weather.minTemp7dC,
        maxTemp7dC: weather.maxTemp7dC,
        // This endpoint feeds the proactive "perfect day" push. Without the
        // moisture veto a phone would buzz on a bone-dry day.
        soilMoistureIndex: weather.soilMoistureIndex,
        // Lets the reasons include "Siste regn: 12mm for 4 dager siden" —
        // same input the home card gets, or the two would disagree.
        precipDailyMm: weather.precipDailyMm
      },
      month,
      locale,
      dayOfMonth
    );

    const payload = { ...assessment, weatherSource: weather.source };
    dayCache.set(cacheKey, { at: Date.now(), payload });
    // Coarse (~1 km) on purpose — server logs must not hold a position trail.
    log.info('mushroom_day.success', {
      lat: Number(lat.toFixed(2)),
      lon: Number(lon.toFixed(2)),
      optimal: assessment.optimal,
      score: assessment.score,
      weatherSource: weather.source
    });

    return NextResponse.json(payload);
  } catch (error) {
    log.error('mushroom_day.failed', error);
    return NextResponse.json({ error: copy.failed }, { status: 500 });
  }
}
