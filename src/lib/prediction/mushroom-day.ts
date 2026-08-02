/**
 * "Perfekt soppdag" assessment — decides whether *today* is a great day to go
 * mushroom foraging in a region, from weather + season alone. It answers "is it
 * mushroom weather right now?" (area-agnostic), NOT "is this exact spot good?"
 * (that's the per-cell prediction).
 *
 * This is the reusable brain behind the proactive "perfect day" notification:
 * a daily job (native push when the app ships, or a cron) calls it per user
 * area and, when `optimal`, sends `title` + `message` (+ `reasons` as the
 * data-backed "why"). It can also power an in-app banner.
 *
 * Pure + deterministic given (weather, month) — easy to unit-test and to reason
 * about. Calibrated by hand from field knowledge; tune against real data later.
 */

import { buildExplanation, type ExplanationWeather } from '@/lib/utils/prediction-explanation';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export interface MushroomDayAssessment {
  /** True only inside the broad mushroom season and when the score clears the bar. */
  optimal: boolean;
  /** 0–100 "is it mushroom weather" score. */
  score: number;
  /** Short headline, e.g. "🍄 Perfekt soppdag i dag!". */
  title: string;
  /** One-line body for the notification / banner. */
  message: string;
  /** Data-backed positive reasons (season, rain, temp, humidity) — the "why". */
  reasons: string[];
}

/** Cumulative rainfall over the longest window we have data for. */
function cumulativeRain(weather: ExplanationWeather): number {
  if (weather.rain14dMm != null) return weather.rain14dMm;
  if (weather.rain7dMm != null) return weather.rain7dMm;
  return weather.rain3dMm * 3; // rough extrapolation from the 3-day figure
}

/**
 * Sesongleddets vekt (0-35) per måned — nivået, ikke trappen.
 *
 * August–oktober er høysesong; juli og november er skuldre; juni er såvidt i
 * gang. Verdiene er de samme som før; det er OVERGANGEN mellom dem som er ny.
 */
const SEASON_WEIGHT_BY_MONTH = [0, 0, 0, 0, 0, 10, 22, 35, 35, 35, 22, 0];

/** Dagen midt i hver måned, som dag-i-året (ikke-skuddår). Ankerpunktene. */
const MID_MONTH_DAY_OF_YEAR = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/**
 * Glatt sesongvekt for en gitt dag i måneden.
 *
 * FØR var dette en trapp: `month >= 8 && month <= 10 → 35`, ellers 22, 10 eller
 * 0. Med identisk vær ga det et sprang på 13-22 poeng ved midnatt hver 1. i
 * måneden — 31. okt 100, 1. nov 87; 30. nov 87, 1. des 65. Sju-dagersstripen
 * krysser et månedsskifte seks dager i måneden, så brukeren så stripen falle et
 * helt hakk uten at noe i været hadde endret seg. Det er nøyaktig samme feilklasse
 * som regnvindus-spranget Sindre allerede har meldt fra om én gang (se
 * headeren i src/app/api/mushroom-forecast/route.ts).
 *
 * Nå interpoleres det lineært mellom månedenes MIDTPUNKTER. To konsekvenser
 * som er verdt å kjenne:
 *  - Midt i måneden er verdien nøyaktig den gamle, så nivået i høysesongen står.
 *    Kallere som bare oppgir måned (ingen `dayOfMonth`) behandles som midt i
 *    måneden og får derfor eksakt samme tall som før.
 *  - På skulderdagene glir tallet. Første halvdel av august ligger noen poeng
 *    lavere enn før, siste halvdel av juli noen poeng høyere — som er det
 *    interpolasjonen betyr: 2. august ligner mer på slutten av juli enn på
 *    midten av september.
 */
export function seasonWeight(month: number, dayOfMonth?: number): number {
  const m = Math.max(1, Math.min(12, Math.round(month)));
  if (dayOfMonth == null) return SEASON_WEIGHT_BY_MONTH[m - 1];

  const anchor = MID_MONTH_DAY_OF_YEAR[m - 1];
  const day = MID_MONTH_DAY_OF_YEAR[m - 1] + (Math.round(dayOfMonth) - 15);

  // Hvilke to måneder dagen ligger mellom, og hvor langt (0-1) mellom dem.
  const goingForward = day >= anchor;
  const otherMonth = goingForward ? (m % 12) + 1 : ((m + 10) % 12) + 1;
  let otherAnchor = MID_MONTH_DAY_OF_YEAR[otherMonth - 1];
  // Året går rundt: desember → januar og januar → desember.
  if (goingForward && otherAnchor < anchor) otherAnchor += 365;
  if (!goingForward && otherAnchor > anchor) otherAnchor -= 365;

  const span = Math.abs(otherAnchor - anchor);
  const t = span === 0 ? 0 : Math.min(1, Math.abs(day - anchor) / span);
  const from = SEASON_WEIGHT_BY_MONTH[m - 1];
  const to = SEASON_WEIGHT_BY_MONTH[otherMonth - 1];
  return from + (to - from) * t;
}

/**
 * User-facing copy per language. These strings are served straight to the client
 * (home card, push notification), so the caller must pass the reader's locale —
 * a Swedish user seeing Norwegian here was the bug this table fixes.
 */
interface DayCopy {
  titleOptimal: string;
  titleNormal: string;
  messageOptimal: string;
  messageNormal: string;
}

const COPY: Record<Locale, DayCopy> = {
  nb: {
    titleOptimal: '🍄 Perfekt soppdag i dag!',
    titleNormal: 'Soppforhold i dag',
    messageOptimal: 'Forholdene er ideelle for å finne sopp i dag — ta turen ut! 🍄',
    messageNormal: 'Forholdene er ikke helt optimale akkurat nå. Sjekk kartet for ditt nærområde.'
  },
  sv: {
    titleOptimal: '🍄 Perfekt svampdag i dag!',
    titleNormal: 'Svampförhållanden i dag',
    messageOptimal: 'Förhållandena är idealiska för att hitta svamp i dag — ut i skogen! 🍄',
    messageNormal: 'Förhållandena är inte helt optimala just nu. Kolla kartan över ditt närområde.'
  }
};

export function assessMushroomDay(
  weather: ExplanationWeather,
  month: number,
  locale: Locale = DEFAULT_LOCALE,
  /**
   * Dagen i måneden (1-31). Uten den behandles dagen som midt i måneden, som
   * gir nøyaktig de gamle tallene — se seasonWeight.
   */
  dayOfMonth?: number
): MushroomDayAssessment {
  let score = 0;

  // Season (0–35) — the strongest gate. Glatt over månedsskiftet, se seasonWeight.
  score += seasonWeight(month, dayOfMonth);

  // Cumulative rain (0–30) — a moist base is what drives fruiting.
  const rain = cumulativeRain(weather);
  if (rain >= 40) score += 30;
  else if (rain >= 20) score += 20;
  else if (rain >= 10) score += 10;

  // Temperature (0–20) — mild is best.
  const t = weather.temperatureC;
  if (t >= 10 && t <= 18) score += 20;
  else if (t >= 6 && t <= 22) score += 10;

  // Humidity (0–15).
  const h = weather.humidityPct;
  if (h >= 80) score += 15;
  else if (h >= 65) score += 8;

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Only celebrate inside the broad mushroom season; never in deep winter, even
  // if a freak-warm-and-wet day would otherwise score high. A genuinely good day
  // also needs a real moisture base — a dry spell never fruits, however mild or
  // in-season it is.
  const inSeasonWindow = month >= 6 && month <= 11;

  // A 14-day rain SUM stays high for two weeks after one old downpour, so on its
  // own it will celebrate a day when the ground has long since dried out. When
  // the bucket model is available it may VETO the celebration — it can never
  // lift a low score. 0.55 is the same gate assessFlush uses to return
  // 'fruiting', so the headline and the flush banner directly beneath it cannot
  // contradict each other. Without this, the card could read "🍄 Perfekt
  // soppdag i dag!" above a grey "Tørt — soppen venter på regn".
  //
  // Null or undefined (OpenWeather, forecast days) leaves the veto inert.
  const moistNow = weather.soilMoistureIndex == null || weather.soilMoistureIndex >= 0.55;
  const optimal = score >= 65 && inSeasonWindow && rain >= 15 && moistNow;

  const reasons = buildExplanation({ weather, month, locale })
    .filter((line) => line.level === 'positive')
    // Don't list "godt fuktet" as a reason on a day the moisture model vetoed.
    .filter((line) => moistNow || line.category !== 'rain')
    .map((line) => line.text);

  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
  const title = optimal ? copy.titleOptimal : copy.titleNormal;
  const message = optimal ? copy.messageOptimal : copy.messageNormal;

  return { optimal, score, title, message, reasons };
}
