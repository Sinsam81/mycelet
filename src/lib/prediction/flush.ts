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
import { isInMushroomSeason } from '@/lib/prediction/mushroom-day';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

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

/**
 * User-facing copy per language. The flush banner is rendered verbatim from
 * `title`/`message`, so the caller passes the reader's locale — otherwise a
 * Swedish user gets Norwegian text (the bug this table fixes).
 */
interface FlushCopy {
  offSeasonTitle: string;
  offSeasonMessage: string;
  tooColdTitle: string;
  tooColdMessage: string;
  speciesOffSeasonTitle: string;
  speciesOffSeasonMessage: string;
  fruitingTitle: string;
  fruitingMessage: string;
  buildingTitle: string;
  buildingMessage: string;
  soonTitle: (daysUntil: number) => string;
  soonMessage: (rainInDays: number) => string;
  dryTitle: string;
  dryMessage: string;
}

const COPY: Record<Locale, FlushCopy> = {
  nb: {
    offSeasonTitle: 'Utenom soppsesongen',
    offSeasonMessage: 'Det er utenfor hovedsesongen. Kom tilbake fra sensommeren.',
    tooColdTitle: 'For kaldt akkurat nå',
    tooColdMessage: 'For kaldt for soppvekst. Vent på mildere vær.',
    speciesOffSeasonTitle: 'Utenom artens sesong',
    speciesOffSeasonMessage:
      'Denne arten fruktifiserer vanligvis ikke nå her. Prøv en annen art eller kom tilbake i sesongen.',
    fruitingTitle: 'Forholdene er modne nå 🍄',
    fruitingMessage: 'Fuktig mark og mildt vær — soppen kommer nå. Ta turen ut!',
    buildingTitle: 'Soppen er på vei',
    buildingMessage: 'Det regnet nylig — gi det noen dager, så er forholdene gode.',
    soonTitle: (daysUntil) => `Regn på vei — sopp om ~${daysUntil} dager`,
    soonMessage: (rainInDays) =>
      `Det er meldt regn om ${rainInDays} dag${rainInDays === 1 ? '' : 'er'}. Soppen følger gjerne ~1 uke etter.`,
    dryTitle: 'Tørt — soppen venter på regn',
    dryMessage: 'Lite fukt og ingen regn i sikte. Sjansene er små inntil det kommer nedbør.'
  },
  sv: {
    offSeasonTitle: 'Utanför svampsäsongen',
    offSeasonMessage: 'Det är utanför högsäsongen. Kom tillbaka i slutet av sommaren.',
    tooColdTitle: 'För kallt just nu',
    tooColdMessage: 'För kallt för svamptillväxt. Vänta på mildare väder.',
    speciesOffSeasonTitle: 'Utanför artens säsong',
    speciesOffSeasonMessage:
      'Den här arten fruktifierar vanligtvis inte den här tiden på året. Prova en annan art eller kom tillbaka i säsong.',
    fruitingTitle: 'Nu är det läge för svamp 🍄',
    fruitingMessage: 'Fuktig mark och milt väder — svampen kommer nu. Ut i skogen!',
    buildingTitle: 'Svampen är på väg',
    buildingMessage: 'Det regnade nyligen — om några dagar bör förhållandena vara bra.',
    soonTitle: (daysUntil) => `Regn på väg — svamp om ~${daysUntil} dagar`,
    soonMessage: (rainInDays) =>
      `Regn väntas om ${rainInDays} dag${rainInDays === 1 ? '' : 'ar'}. Svampen följer ofta ~1 vecka efter.`,
    dryTitle: 'Torrt — svampen väntar på regn',
    dryMessage: 'Lite fukt och inget regn i sikte. Chanserna är små tills det kommer nederbörd.'
  }
};

export function assessFlush(
  input: FlushInput,
  species?: FlushSpeciesContext,
  locale: Locale = DEFAULT_LOCALE
): FlushAssessment {
  const copy = COPY[locale] ?? COPY[DEFAULT_LOCALE];
  const { month, soilMoistureIndex, rain7dMm, currentTempC, forecast } = input;

  // Per-species season gate FIRST. When we have an empirical phenology curve for
  // this species at this latitude, that curve — not the generic month window —
  // is the authority on whether it fruits now.
  //
  // Rekkefølgen er ny og den er poenget: sto den generelle månedsporten først,
  // ville en art med egen kurve aldri fått uttale seg utenfor den generelle
  // sesongen. Morkler fruktifiserer i mai, som er utenfor den generelle
  // sesongen, og ville blitt meldt «utenom soppsesongen» selv om kurven deres
  // sier at det er nettopp nå.
  const speciesCurve =
    species?.speciesId != null && species.lat != null
      ? phenologyFactor(species.speciesId, species.lat, dayOfYearFromMonth(month))
      : null;

  if (speciesCurve != null && speciesCurve < PHENOLOGY_DORMANT_FACTOR) {
    return {
      status: 'dormant',
      daysUntil: null,
      title: copy.speciesOffSeasonTitle,
      message: copy.speciesOffSeasonMessage
    };
  }

  // Generell sesongport — bare når vi IKKE har en artskurve å gå på.
  //
  // Porten var `month < 5 || month > 11` her og `month >= 6` i mushroom-day.ts,
  // og de to rendres rett over hverandre i det samme kortet. Målt over 2 212
  // maidager: 540 (24,4 %) fikk det grønne «Forholdene er modne nå 🍄», og
  // 100 % av dem hadde en gul ring over seg som sa det motsatte — `optimal`
  // forekommer i 0,0 % av maidagene. Kortet motsa seg selv en hel måned i året.
  //
  // Nå leser begge fra isInMushroomSeason, som er UTLEDET av vekttabellen, så de
  // ikke kan skille lag igjen.
  if (speciesCurve == null && !isInMushroomSeason(month)) {
    return {
      status: 'dormant',
      daysUntil: null,
      title: copy.offSeasonTitle,
      message: copy.offSeasonMessage
    };
  }

  // Hard cold gate — nothing fruits in a freeze.
  if (currentTempC < 2) {
    return {
      status: 'dormant',
      daysUntil: null,
      title: copy.tooColdTitle,
      message: copy.tooColdMessage
    };
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
      title: copy.fruitingTitle,
      message: copy.fruitingMessage
    };
  }

  // It rained recently but the ground is drying / not yet peaked → on the way.
  if (rain7dMm >= 12 && mildNow) {
    return {
      status: 'building',
      daysUntil: 5,
      title: copy.buildingTitle,
      message: copy.buildingMessage
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
      title: copy.soonTitle(daysUntil),
      message: copy.soonMessage(rainDay)
    };
  }

  // Dry now and nothing meaningful coming.
  return {
    status: 'dry',
    daysUntil: null,
    title: copy.dryTitle,
    message: copy.dryMessage
  };
}
