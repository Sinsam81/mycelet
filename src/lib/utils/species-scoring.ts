/**
 * Per-species adjustment to the generic prediction score.
 *
 * The base scoring in prediction.ts treats all species the same — it knows
 * "weather is good for mushrooms" but not "weather is good for kantarell
 * specifically". This module fixes that.
 *
 * Strategy: a multiplier in [0, 1.5] that callers can apply to the base
 * environment / weather-trend score before combining components. The
 * multiplier captures three things:
 *
 *  1. Season fit. Outside the species' season window, even perfect weather
 *     means almost no chance of finding it (multiplier collapses to ~0.05).
 *     Inside peak season, slight boost.
 *  2. Temperature fit. Each genus has its own optimal range — kantarell at
 *     12-20 °C, piggsopp tolerates colder, steinsopp wants warmer.
 *  3. Moisture fit. Genus-specific weighting on humidity + recent rain.
 *
 * For genera we don't have explicit profiles for, we fall back to a sensible
 * generic profile rather than failing closed.
 *
 * Out of scope (Phase 2 territory): mycorrhizal partner availability requires
 * terrain/tree-cover data we don't have yet.
 */

import type { WeatherInput } from '@/lib/utils/prediction';

export interface SpeciesContext {
  /**
   * Latin binomial — used for species-level overrides via SPECIES_PREFERENCES.
   * When two species share a genus but have meaningfully different ecology
   * (e.g. Craterellus tubaeformis vs Craterellus cornucopioides — both in
   * Craterellus, but one likes granskog and the other løvskog), the
   * species-level entry wins.
   */
  latinName?: string | null;
  genus: string | null;
  seasonStart: number; // 1-12
  seasonEnd: number; // 1-12
  peakSeasonStart: number | null;
  peakSeasonEnd: number | null;
}

export interface GenusPreferences {
  /** Optimal min temperature in °C (full score within range) */
  tempCMin: number;
  /** Optimal max temperature in °C */
  tempCMax: number;
  /** Tolerable absolute min temperature (zero score below) */
  tempCFloor: number;
  /** Tolerable absolute max temperature (zero score above) */
  tempCCeil: number;
  /** Mm of rain over last 3 days that hits optimal moisture */
  rainOptMm: number;
  /** How much this genus depends on recent rain (0 = doesn't care, 1 = critical) */
  rainWeight: number;
  /** How much this genus depends on humidity (0 = doesn't care, 1 = critical) */
  humidityWeight: number;
  /** Plain-Norwegian description of why this profile, useful for tests/debugging */
  description: string;
}

const GENERIC_PREFERENCES: GenusPreferences = {
  tempCMin: 10,
  tempCMax: 18,
  tempCFloor: 2,
  tempCCeil: 25,
  rainOptMm: 6,
  rainWeight: 0.7,
  humidityWeight: 0.6,
  description: 'Generisk profil for ukjente slekter — moderate krav til varme og fukt.'
};

/**
 * Genus-keyed preferences. Add a new entry whenever a relevant species is
 * seeded to mushroom_species. Keys are scientific genus names matching the
 * `genus` column in the DB (capitalized).
 */
export const GENUS_PREFERENCES: Readonly<Record<string, GenusPreferences>> = {
  // Kantarell — fukt-elsker, sensitiv til tørke
  Cantharellus: {
    tempCMin: 12,
    tempCMax: 20,
    tempCFloor: 5,
    tempCCeil: 26,
    rainOptMm: 8,
    rainWeight: 1.0,
    humidityWeight: 0.9,
    description: 'Kantarell trives etter regnvær, helst 12-20 °C, høy luftfuktighet.'
  },
  // Traktkantarell — likner kantarell men senere på året, tåler kjøligere
  Craterellus: {
    tempCMin: 8,
    tempCMax: 16,
    tempCFloor: 2,
    tempCCeil: 22,
    rainOptMm: 6,
    rainWeight: 0.8,
    humidityWeight: 0.85,
    description: 'Traktkantarell tåler kjølig vær, fortsatt fukt-avhengig.'
  },
  // Steinsopp og slekt — varme-elsker
  Boletus: {
    tempCMin: 15,
    tempCMax: 22,
    tempCFloor: 8,
    tempCCeil: 28,
    rainOptMm: 6,
    rainWeight: 0.9,
    humidityWeight: 0.6,
    description: 'Steinsopp foretrekker varm vær (15-22 °C), kommer 5-7 dager etter regn.'
  },
  // Brunskrubb — liknende steinsopp, litt mer tolerant
  Leccinum: {
    tempCMin: 13,
    tempCMax: 22,
    tempCFloor: 6,
    tempCCeil: 27,
    rainOptMm: 5,
    rainWeight: 0.8,
    humidityWeight: 0.6,
    description: 'Brunskrubb-slekten følger gjerne bjørk og er moderat fukt-avhengig.'
  },
  // Smørsopp — bartre-tilknyttet, tåler bredere temp
  Suillus: {
    tempCMin: 10,
    tempCMax: 20,
    tempCFloor: 3,
    tempCCeil: 25,
    rainOptMm: 5,
    rainWeight: 0.8,
    humidityWeight: 0.7,
    description: 'Smørsopp i furu/granskog, tåler kjølig høst, jevnt regn er bedre enn intenst.'
  },
  // Piggsopp — sen sesong, tåler kulde
  Hydnum: {
    tempCMin: 6,
    tempCMax: 15,
    tempCFloor: 0,
    tempCCeil: 20,
    rainOptMm: 5,
    rainWeight: 0.7,
    humidityWeight: 0.7,
    description: 'Piggsopp er en høst-art (sept-nov), tåler frostnetter, kalk-elsker.'
  },
  // Riske
  Lactarius: {
    tempCMin: 10,
    tempCMax: 18,
    tempCFloor: 4,
    tempCCeil: 24,
    rainOptMm: 6,
    rainWeight: 0.8,
    humidityWeight: 0.7,
    description: 'Riske-slekten er bredt utbredt, moderate krav.'
  },
  // Kremle
  Russula: {
    tempCMin: 11,
    tempCMax: 20,
    tempCFloor: 5,
    tempCCeil: 24,
    rainOptMm: 5,
    rainWeight: 0.7,
    humidityWeight: 0.7,
    description: 'Kremle er svært tilpasningsdyktig, moderate krav.'
  },
  // Sjampinjong (Agaricus) — åpne enger, mindre regn-avhengig
  Agaricus: {
    tempCMin: 12,
    tempCMax: 22,
    tempCFloor: 5,
    tempCCeil: 26,
    rainOptMm: 4,
    rainWeight: 0.5,
    humidityWeight: 0.5,
    description: 'Sjampinjong vokser på åpent gress og er mindre regn-avhengig enn skog-arter.'
  },
  // Fluesopp — sen sommer, mange giftige
  Amanita: {
    tempCMin: 12,
    tempCMax: 20,
    tempCFloor: 5,
    tempCCeil: 25,
    rainOptMm: 5,
    rainWeight: 0.7,
    humidityWeight: 0.6,
    description: 'Fluesopp-slekten kommer i sen-sommer/høst, moderate krav.'
  },
  // Slørsopp — utbredt og tilpasningsdyktig (mange giftige!)
  Cortinarius: {
    tempCMin: 8,
    tempCMax: 18,
    tempCFloor: 2,
    tempCCeil: 24,
    rainOptMm: 5,
    rainWeight: 0.7,
    humidityWeight: 0.7,
    description: 'Slørsopp-slekten er svært variabel, moderate krav. Mange dødelig giftige.'
  },
  // Pluggsopp — bjørk-tilknyttet
  Paxillus: {
    tempCMin: 10,
    tempCMax: 20,
    tempCFloor: 4,
    tempCCeil: 24,
    rainOptMm: 5,
    rainWeight: 0.7,
    humidityWeight: 0.7,
    description: 'Pluggsopp i bjørke-skog. NB: ble lenge ansett spiselig, men kan utløse dødelig immunreaksjon.'
  },
  // Parasoll-sjampinjong, sjampinjong-paraply
  Macrolepiota: {
    tempCMin: 13,
    tempCMax: 22,
    tempCFloor: 6,
    tempCCeil: 26,
    rainOptMm: 4,
    rainWeight: 0.5,
    humidityWeight: 0.5,
    description: 'Parasollsopp på enger og åpne områder, mindre regn-avhengig.'
  },
  // Østerssopp og familie
  Pleurotus: {
    tempCMin: 5,
    tempCMax: 18,
    tempCFloor: 0,
    tempCCeil: 22,
    rainOptMm: 4,
    rainWeight: 0.5,
    humidityWeight: 0.85,
    description: 'Østerssopp på død ved, tåler kjølig, høy fukt-tolerant.'
  }
};

/**
 * Species-level overrides keyed by exact Latin binomial. Used when two
 * species share a genus but have meaningfully different ecology — the
 * genus profile only gets you so far when the underlying preferences
 * actually diverge.
 *
 * The lookup chain in resolveSpeciesPreferences is:
 *   exact latinName match  →  genus default  →  GENERIC_PREFERENCES
 *
 * Adding a species override here is a one-stop edit; all callers pick
 * it up automatically.
 */
export const SPECIES_PREFERENCES: Readonly<Record<string, GenusPreferences>> = {
  // Svart trompetsopp — same genus as traktkantarell (Craterellus) but
  // very different habitat: fuktig løvskog (bøk/eik) instead of moserik
  // granskog. Stronger humidity dependence; warmer optimum (it fruits
  // mostly in september-oktober when løvskog is at its dampest).
  'Craterellus cornucopioides': {
    tempCMin: 12,
    tempCMax: 18,
    tempCFloor: 5,
    tempCCeil: 24,
    rainOptMm: 9,
    rainWeight: 0.9,
    humidityWeight: 1.0,
    description:
      'Svart trompetsopp i fuktig løvskog (bøk/eik). Sterk fukt-avhengighet, warmer optimum enn traktkantarell.'
  }
};

function inMonth(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  // Wrap-around year (e.g. start=11, end=2)
  return month >= start || month <= end;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Triangular fit: 1.0 within [optMin, optMax], linearly drops to 0.0 at
 * [floor, ceil]. Used for temperature where there's a clear sweet spot.
 */
function triangularFit(value: number, floor: number, optMin: number, optMax: number, ceil: number): number {
  if (value <= floor || value >= ceil) return 0;
  if (value >= optMin && value <= optMax) return 1;
  if (value < optMin) {
    return clamp01((value - floor) / (optMin - floor));
  }
  return clamp01((ceil - value) / (ceil - optMax));
}

/**
 * Saturating fit for cumulative rain. 0 mm = 0.1 (mushrooms still grow on
 * residual moisture), saturates to 1.0 at rainOptMm, gentle drop-off above
 * (too much rain is rarely worse for fruiting in 3d window).
 */
function rainFit(rain3dMm: number, optMm: number): number {
  if (rain3dMm <= 0) return 0.1;
  if (rain3dMm >= optMm) {
    // Past optimum, slight drop-off so 50mm doesn't beat 8mm by much
    const overshoot = (rain3dMm - optMm) / Math.max(1, optMm * 4);
    return clamp01(1 - overshoot * 0.2);
  }
  return clamp01(rain3dMm / optMm);
}

/**
 * Linear fit on humidity 50-90%. Below 50% essentially zero, 80%+ near max.
 */
function humidityFit(humidityPct: number): number {
  return clamp01((humidityPct - 50) / 35);
}

/**
 * Resolve genus preferences with sensible fallback.
 *
 * For species-aware lookups (with latinName) prefer resolveSpeciesPreferences
 * below — it checks species-level overrides first.
 */
export function resolveGenusPreferences(genus: string | null | undefined): GenusPreferences {
  if (!genus) return GENERIC_PREFERENCES;
  return GENUS_PREFERENCES[genus] ?? GENERIC_PREFERENCES;
}

/**
 * Resolve preferences for a specific species. Lookup chain:
 *   exact latinName match (SPECIES_PREFERENCES) → genus default (GENUS_PREFERENCES) → GENERIC_PREFERENCES
 *
 * Use this in callers that know the latin name; falls back transparently
 * for species that don't need an override.
 */
export function resolveSpeciesPreferences(species: SpeciesContext): GenusPreferences {
  if (species.latinName && SPECIES_PREFERENCES[species.latinName]) {
    return SPECIES_PREFERENCES[species.latinName];
  }
  return resolveGenusPreferences(species.genus);
}

/**
 * Compute a multiplier in [0, 1.3] expressing how well current weather +
 * month match this species. Multiply against the base environment / weather
 * score before combining.
 *
 *   < 0.2  : season window missed entirely
 *   0.5    : in season, average conditions
 *   1.0    : in season, near-optimal weather
 *   1.2-1.3: peak season + optimal weather
 */
export function computeSpeciesAdjustment(species: SpeciesContext, weather: WeatherInput, month: number): number {
  // Season gate first — outside the species' window, return very low multiplier
  // regardless of weather.
  if (!inMonth(month, species.seasonStart, species.seasonEnd)) {
    return 0.05;
  }

  const prefs = resolveSpeciesPreferences(species);

  const tempScore = triangularFit(weather.temperature, prefs.tempCFloor, prefs.tempCMin, prefs.tempCMax, prefs.tempCCeil);
  const rainScore = rainFit(weather.rain3dMm, prefs.rainOptMm);
  const humidScore = humidityFit(weather.humidity);

  // Weighted average of the three weather components.
  const totalWeight = 1.0 + prefs.rainWeight + prefs.humidityWeight;
  const weatherFit = (tempScore + rainScore * prefs.rainWeight + humidScore * prefs.humidityWeight) / totalWeight;

  // Baseline 0.5 for being in season, weather lifts it to 1.0
  let multiplier = 0.5 + weatherFit * 0.5;

  // Peak-season bonus
  if (
    species.peakSeasonStart != null &&
    species.peakSeasonEnd != null &&
    inMonth(month, species.peakSeasonStart, species.peakSeasonEnd)
  ) {
    multiplier *= 1.2;
  }

  return Math.min(1.3, multiplier);
}
