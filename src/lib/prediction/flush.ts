/**
 * Flush-timing assessment — turns the prediction into a *when*.
 *
 * Mushroom fruiting comes in flushes ~1–2 weeks after a soaking rain that
 * follows mild conditions. Experienced foragers reason about timing ("it
 * rained last week, give it a few days") more than about a static score. This
 * combines the moisture base now (soil-water index) with the MET forecast to
 * answer "should I go now, or wait?".
 *
 * Pure + heuristic — deliberately explainable, tuned against field rules of
 * thumb, to be calibrated later against the spot_feedback ground truth.
 */
import type { DailyForecast } from '@/lib/weather/forecast';

export type FlushStatus = 'fruiting' | 'soon' | 'building' | 'dry' | 'dormant';

export interface FlushAssessment {
  status: FlushStatus;
  /** Estimated days until a flush is likely, or null when not applicable. */
  daysUntil: number | null;
  title: string;
  message: string;
}

export interface FlushInput {
  month: number;
  soilMoistureIndex: number | null;
  rain7dMm: number;
  currentTempC: number;
  /** Upcoming forecast days (date strictly after today), oldest first. */
  forecast: DailyForecast[];
}

// Typical lag from a soaking rain to a visible flush (general; chanterelles ~2
// weeks, faster species ~1) — used to project a date from a forecast rain.
const FLUSH_LAG_DAYS = 8;
// A "soaking" cumulative rainfall (mm) that can drive a flush.
const SOAK_MM = 8;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function assessFlush(input: FlushInput): FlushAssessment {
  const { month, soilMoistureIndex, rain7dMm, currentTempC, forecast } = input;

  // Off-season: the brain is dormant regardless of weather.
  if (month < 5 || month > 11) {
    return {
      status: 'dormant',
      daysUntil: null,
      title: 'Utenom soppsesongen',
      message: 'Det er utenfor hovedsesongen. Kom tilbake fra sensommeren.'
    };
  }

  // Hard cold gate — nothing fruits in a freeze.
  if (currentTempC < 2) {
    return {
      status: 'dormant',
      daysUntil: null,
      title: 'For kaldt akkurat nå',
      message: 'For kaldt for soppvekst. Vent på mildere vær.'
    };
  }

  const mildNow = currentTempC >= 3 && currentTempC <= 20;
  // Moisture now: prefer the soil-water index, else a rain-based proxy.
  const wetNow = soilMoistureIndex != null ? soilMoistureIndex : clamp01(rain7dMm / 25);

  // Conditions ripe right now.
  if (wetNow >= 0.55 && mildNow) {
    return {
      status: 'fruiting',
      daysUntil: 0,
      title: 'Forholdene er modne nå 🍄',
      message: 'Fuktig mark og mildt vær — soppen kommer nå. Ta turen ut!'
    };
  }

  // It rained recently but the ground is drying / not yet peaked → on the way.
  if (rain7dMm >= 12 && mildNow) {
    return {
      status: 'building',
      daysUntil: 5,
      title: 'Soppen er på vei',
      message: 'Det regnet nylig — gi det noen dager, så er forholdene gode.'
    };
  }

  // Dry now: look ahead. Find the first forecast day where cumulative rain
  // crosses a soaking threshold, then project the flush a lag later.
  let accum = 0;
  let rainDay: number | null = null;
  forecast.forEach((d, idx) => {
    accum += d.precipMm;
    if (rainDay == null && accum >= SOAK_MM) rainDay = idx + 1; // 1-based days ahead
  });

  if (rainDay != null) {
    const daysUntil = rainDay + FLUSH_LAG_DAYS;
    return {
      status: 'soon',
      daysUntil,
      title: `Regn på vei — sopp om ~${daysUntil} dager`,
      message: `Det er meldt regn om ${rainDay} dag${rainDay === 1 ? '' : 'er'}. Soppen følger gjerne ~1 uke etter.`
    };
  }

  // Dry now and nothing meaningful coming.
  return {
    status: 'dry',
    daysUntil: null,
    title: 'Tørt — soppen venter på regn',
    message: 'Lite fukt og ingen regn i sikte. Sjansene er små inntil det kommer nedbør.'
  };
}
