import { NextRequest, NextResponse } from 'next/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { fetchDailyForecast } from '@/lib/weather/forecast';
import { assessFlush } from '@/lib/prediction/flush';
import { reconcileFlushWithWeek } from '@/lib/prediction/flush-vs-week';
import { buildWeek, filterUpcomingDays } from '@/lib/prediction/week-scores';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { roundForProviderLookup } from '@/lib/privacy/provider-precision';
import { osloIDag } from '@/lib/api/oslo-dag';

/**
 * 7-day "soppforhold"-trend for the home page.
 *
 * Every day in the strip — today included — is scored on the SAME trailing rain
 * windows, taken from one continuous daily series: the observed past followed by
 * the forecast future. That is what makes the bars comparable to each other.
 * The walk itself lives in the shared module `@/lib/prediction/week-scores`
 * (also used by the /soppforhold area pages); the tests locking its behaviour
 * stay in __tests__/route.test.ts here.
 *
 * The previous version scored today on the adapter's own 14-day sum and days 1-6
 * on a sliding 7-day sum, which stepped the strip down between today and
 * tomorrow under unchanged weather. See week-scores.ts for the detail.
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

// Feilstrengene vises rått i grensesnittet, som resten av kroppen.
const COPY: Record<Locale, { badCoordinates: string; noWeather: string; failed: string }> = {
  nb: {
    badCoordinates: 'Mangler eller ugyldige koordinater',
    noWeather: 'Værdata ikke tilgjengelig for området',
    failed: 'Kunne ikke hente soppvarsel'
  },
  sv: {
    badCoordinates: 'Saknade eller ogiltiga koordinater',
    noWeather: 'Väderdata är inte tillgängliga för området',
    failed: 'Kunde inte hämta svampprognosen'
  }
};

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const url = new URL(request.url);
  const lat = num(url.searchParams.get('lat'));
  const lon = num(url.searchParams.get('lon'));

  // The payload carries user-facing text (verdict, flush banner, weekday
  // labels), so the reader's language is part of the cache identity — og
  // feilteksten under er like brukervendt, så språket hentes før valideringen.
  const locale = await getUserLocale();
  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: copy.badCoordinates }, { status: 400 });
  }

  const rl = checkRateLimit(`mushroom-forecast:${getClientKey(request, null)}`, 20, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  // «I dag» er dagen i Oslo, ikke i UTC. Med UTC-datoen viste stripen mellom
  // midnatt og kl. 01/02 norsk tid «I dag» for dagen som nettopp var slutt, og
  // kalte dagen leseren faktisk sto i for morgendagens ukedag. Prognosens døgn
  // er METs UTC-døgn; filterUpcomingDays tar dem som ligger ETTER denne datoen,
  // så dagen i dag hverken faller ut eller står to ganger. Se
  // src/lib/api/oslo-dag.ts.
  const iDag = osloIDag(new Date());
  const todayKey = iDag.dato;
  const month = iDag.maaned;
  // Dagen og språket er del av nøkkelen: svaret bærer både datoene og teksten.
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${todayKey},${locale}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  try {
    // Punktet er leserens posisjon, og begge kallene går ut av huset (observert
    // vær og METs prognose). De får det avrundet til ~110 m — samme regel som
    // /api/prediction, se provider-precision.ts. Dagens klienter sender to
    // desimaler; ruta håndhever nå det den før bare håpet på.
    const oppslag = roundForProviderLookup(lat, lon);
    const [observed, forecast] = await Promise.all([
      fetchWeatherSummary(oppslag),
      fetchDailyForecast(oppslag)
    ]);
    if (!observed) {
      return NextResponse.json({ error: copy.noWeather }, { status: 502 });
    }

    const future = filterUpcomingDays(forecast, todayKey);

    // Hele 7-dagersvandringen — énvindusregelen, det glidende sesongleddet og
    // fuktbøtta som flyttes døgn for døgn — ligger i week-scores.ts, delt med
    // områdesidene under /soppforhold. Historikken bak hver detalj står der.
    const { today, days } = buildWeek(observed, future, {
      todayKey,
      month,
      dayOfMonth: iDag.dagIManeden,
      locale
    });

    // Flush timing — "should I go now, or wait?" — from the moisture base now
    // plus the upcoming forecast rain.
    //
    // Dagen og dommen over banneret sendes med, så banneret sier det samme om
    // sesongen som dommen: tidlig eller sent i en skulder, og feiringen bare der
    // dommen også feirer (seasonShoulder i mushroom-day.ts). Begge følger
    // Oslo-datoen, som alt er i mellomlagernøkkelen sammen med språket.
    const flush = assessFlush(
      {
        month,
        dayOfMonth: iDag.dagIManeden,
        dayOptimal: today.optimal,
        soilMoistureIndex: observed.soilMoistureIndex,
        rain7dMm: observed.rain7dMm ?? observed.rain3dMm * 2,
        currentTempC: observed.temperatureC,
        forecast: future
      },
      undefined,
      locale
    );

    // Banneret og stripen står rett over hverandre og kan gi motsatt råd:
    // «soon» peker alltid 9–14 dager fram, mens stripen bare viser dag 0–6, og i
    // 77 % av de tilfellene har stripen selv en dag som er ≥10 poeng bedre enn i
    // dag. Se flush-vs-week.ts — når stripen har en tydelig vinner, sier
    // banneret det først og lar projeksjonen bli tillegget.
    const forsontFlush = reconcileFlushWithWeek(flush, days, locale);

    const payload = {
      today,
      days,
      flush: forsontFlush,
      hasForecast: future.length > 0,
      weatherSource: observed.source
    };
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
    return NextResponse.json({ error: copy.failed }, { status: 500 });
  }
}
