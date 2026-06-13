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
import { dayOfYearFromMonth, phenologyFactor } from '@/lib/prediction/phenology';

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

/**
 * Optional species/genus context. When supplied, the flush lag and the season
 * gate become species-aware: a slower-responding genus projects a later flush,
 * and a species that is out of its empirical fruiting window reads as dormant
 * even when the generic weather looks good. Omit it entirely for the generic
 * home-page widget — behaviour is then identical to the original single-lag
 * model.
 */
export interface FlushSpeciesContext {
  /** Scientific genus (capitalized, matching GENUS_PREFERENCES keys). */
  genus: string | null;
  /** DB id for the empirical phenology lookup (phenology.ts). */
  speciesId?: number | null;
  /** Latitude — phenology curves are latitude-banded. */
  lat?: number | null;
}

// Typical lag from a soaking rain to a visible flush (general; chanterelles ~2
// weeks, faster species ~1) — used to project a date from a forecast rain. This
// is the fallback when no genus is supplied.
const FLUSH_LAG_DAYS = 8;
// A "soaking" cumulative rainfall (mm) that can drive a flush.
const SOAK_MM = 8;

/**
 * Genus-specific lag (days) from a soaking rain to a visible flush. These are
 * field rules of thumb, not lab constants:
 *  - Boletus/Leccinum (rørsopp/skrubb) respond fast — primordia to mature
 *    fruitbody in ~4-6 days after warm summer rain.
 *  - Cantharellus/Craterellus (kantarell/traktkantarell) are slow responders —
 *    the classic forager rule "gi den ~2 uker etter et skikkelig regn" (12-14 d).
 *  - Hydnum (piggsopp) fruits late and develops slowly in cool autumn soil, so
 *    the lag stretches further still.
 * Everything else falls back to FLUSH_LAG_DAYS (8, the mid-range).
 * Source: Nordic field-guide phenology + forager rules of thumb; to be
 * calibrated against spot_feedback ground truth later.
 */
const GENUS_FLUSH_LAG: Readonly<Record<string, number>> = {
  Boletus: 5,
  Leccinum: 5,
  Cantharellus: 13,
  Craterellus: 13,
  Hydnum: 16
};

// Below this fraction of the species' phenology peak we treat it as out of its
// own fruiting window (≈ "near zero"), even inside the generic season months.
const PHENOLOGY_DORMANT_FACTOR = 0.1;

function flushLagFor(species?: FlushSpeciesContext): number {
  if (!species || !species.genus) return FLUSH_LAG_DAYS;
  return GENUS_FLUSH_LAG[species.genus] ?? FLUSH_LAG_DAYS;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function assessFlush(input: FlushInput, species?: FlushSpeciesContext): FlushAssessment {
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

  // Per-species season gate. When we have an empirical phenology curve for this
  // species at this latitude, a near-zero seasonal weight means it is out of its
  // OWN fruiting window — dormant for this species even if the generic weather
  // (and the month) say "go". Skipped when no species context or no curve, so
  // the generic widget is unaffected.
  if (species?.speciesId != null && species.lat != null) {
    const seasonW = phenologyFactor(species.speciesId, species.lat, dayOfYearFromMonth(month));
    if (seasonW != null && seasonW < PHENOLOGY_DORMANT_FACTOR) {
      return {
        status: 'dormant',
        daysUntil: null,
        title: 'Utenom artens sesong',
        message: 'Denne arten fruktifiserer vanligvis ikke nå her. Prøv en annen art eller kom tilbake i sesongen.'
      };
    }
  }

  const flushLagDays = flushLagFor(species);

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
    const daysUntil = rainDay + flushLagDays;
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
