import { NextRequest, NextResponse } from 'next/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * "Perfekt soppdag" endpoint — returns today's mushroom-foraging verdict for a
 * location (weather + season). Lightweight and public; the daily proactive
 * notification (native push when the app ships, or a cron) calls this per user
 * area and, when `optimal`, pushes `title` + `message` + `reasons`.
 */

export const runtime = 'nodejs';

function num(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const url = new URL(request.url);
  const lat = num(url.searchParams.get('lat'));
  const lon = num(url.searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Mangler eller ugyldige koordinater (lat/lon)' }, { status: 400 });
  }

  const rl = checkRateLimit(`mushroom-day:${getClientKey(request, null)}`, 30, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  try {
    const weather = await fetchWeatherSummary({ lat, lon });
    if (!weather) {
      return NextResponse.json({ error: 'Værdata ikke tilgjengelig for området' }, { status: 502 });
    }

    const month = new Date().getMonth() + 1;
    const assessment = assessMushroomDay(
      {
        temperatureC: weather.temperatureC,
        humidityPct: weather.humidityPct,
        rain3dMm: weather.rain3dMm,
        rain7dMm: weather.rain7dMm,
        rain14dMm: weather.rain14dMm,
        minTemp7dC: weather.minTemp7dC,
        maxTemp7dC: weather.maxTemp7dC
      },
      month
    );

    log.info('mushroom_day.success', { lat, lon, optimal: assessment.optimal, score: assessment.score, weatherSource: weather.source });

    return NextResponse.json({ ...assessment, weatherSource: weather.source });
  } catch (error) {
    log.error('mushroom_day.failed', error);
    return NextResponse.json(
      { error: 'Kunne ikke vurdere soppforhold', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
