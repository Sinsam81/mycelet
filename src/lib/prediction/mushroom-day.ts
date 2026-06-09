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

export function assessMushroomDay(weather: ExplanationWeather, month: number): MushroomDayAssessment {
  let score = 0;

  // Season (0–35) — the strongest gate.
  if (month >= 8 && month <= 10) score += 35;
  else if (month === 7 || month === 11) score += 22;
  else if (month === 6) score += 10;

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
  const optimal = score >= 65 && inSeasonWindow && rain >= 15;

  const reasons = buildExplanation({ weather, month })
    .filter((line) => line.level === 'positive')
    .map((line) => line.text);

  const title = optimal ? '🍄 Perfekt soppdag i dag!' : 'Soppforhold i dag';
  const message = optimal
    ? 'Forholdene er ideelle for å finne sopp i dag — ta turen ut! 🍄'
    : 'Forholdene er ikke helt optimale akkurat nå. Sjekk kartet for ditt nærområde.';

  return { optimal, score, title, message, reasons };
}
