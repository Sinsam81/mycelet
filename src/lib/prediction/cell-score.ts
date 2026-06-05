/**
 * Shared per-cell prediction scoring.
 *
 * Single source of truth for "how good is this coordinate for this species
 * right now", composed from the primitives in src/lib/utils/prediction.ts
 * plus the real forest signal (NIBIO) and per-species climate/habitat fit.
 *
 * Used by BOTH the live /api/prediction fallback path and the tile generator
 * (/api/cron/generate-tiles) so the two never drift apart.
 */

import {
  computeAdvancedEnvironmentScore,
  computeAdvancedFactors,
  computeEnvironmentScore,
  computeHistoricalScore,
  computeSeasonalScore,
  computeTotalScore,
  type AdvancedPredictionFactors,
  type WeatherInput
} from '@/lib/utils/prediction';
import { computeSpeciesAdjustment, type SpeciesContext } from '@/lib/utils/species-scoring';
import {
  computeHabitatScore,
  type ForestProperties,
  type HabitatScore,
  type SpeciesHabitatPreferences
} from '@/lib/forest';
import { elevationToTerrainScore } from '@/lib/terrain';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Map NIBIO bonitet (site index H40, ~6 poor → ~26 rich) to a 0-100 soil-
// richness score — the real "jordsmonn" signal that replaces pseudo-noise.
export function bonitetToSoilScore(bonitet: number) {
  return clamp(((bonitet - 6) / (23 - 6)) * 100, 0, 100);
}

// Map stem volume (m³/ha) to a 0-100 vegetation/maturity score. ~400 m³/ha
// is a dense mature stand → 100.
export function volumeToVegetationScore(volumePerHa: number) {
  return clamp((volumePerHa / 400) * 100, 0, 100);
}

export interface CellPredictionInput {
  lat: number;
  lon: number;
  /** 1-12 */
  month: number;
  weather: WeatherInput;
  /** Real forest props (NIBIO), or null when unavailable. */
  forest: ForestProperties | null;
  /** Species climate context, or null for a generic prediction. */
  species: SpeciesContext | null;
  /** Species habitat preferences, or null when no species/forest. */
  speciesHabitat: SpeciesHabitatPreferences | null;
  /** Historical finding counts in the area (optional; default 0). */
  recent30d?: number;
  recent365d?: number;
  /** Real terrain elevation (m) at the cell, from Kartverket. */
  elevation?: number | null;
  /** Count of real GBIF occurrences of this species near the cell (boost-only). */
  nearbyOccurrences?: number;
}

export interface CellPrediction {
  score: number;
  baseScore: number;
  speciesFit: number | null;
  habitatFit: number;
  habitat: HabitatScore | null;
  occurrenceBoost: number;
  nearbyOccurrences: number;
  components: { environment: number; historical: number; seasonal: number };
  factors: AdvancedPredictionFactors;
}

/**
 * Compute the final 0-100 prediction for one coordinate.
 *
 * Pipeline: environment (legacy weather + advanced factors, with real
 * soil/vegetation when forest is present) + historical + seasonal → baseScore,
 * then × per-species climate fit × per-species habitat fit.
 */
export function computeCellPrediction(input: CellPredictionInput): CellPrediction {
  const { lat, lon, month, weather, forest, species, speciesHabitat } = input;
  const recent30d = input.recent30d ?? 0;
  const recent365d = input.recent365d ?? 0;

  const legacyEnvironment = computeEnvironmentScore(weather);
  const historical = computeHistoricalScore(recent30d, recent365d);
  const seasonal = computeSeasonalScore(month);

  const factors = computeAdvancedFactors({ latitude: lat, longitude: lon, month, weather });

  // Real NIBIO signal replaces the pseudo-noise soil/vegetation proxies.
  if (forest) {
    if (forest.productivity != null) factors.soil = bonitetToSoilScore(forest.productivity);
    if (forest.volumePerHa != null) factors.vegetation = volumeToVegetationScore(forest.volumePerHa);
  }

  // Real Kartverket elevation replaces the pseudo-noise terrain proxy; neutral
  // 50 when unavailable (never fabricate).
  factors.terrain = input.elevation != null ? elevationToTerrainScore(input.elevation) : 50;

  const advancedEnvironment100 = computeAdvancedEnvironmentScore(factors);
  const environment = clamp(legacyEnvironment * 0.6 + (advancedEnvironment100 / 2) * 0.4, 0, 50);

  const baseScore = computeTotalScore({ environment, historical, seasonal });

  const speciesFit = species ? computeSpeciesAdjustment(species, weather, month) : null;

  const habitat = forest && speciesHabitat ? computeHabitatScore(forest, speciesHabitat) : null;
  // Recenter on 1.0: computeHabitatScore is centered on 0.5 (= neutral / no
  // signal), but here it's a SCORE MULTIPLIER where 1.0 must be neutral.
  // Without this, a matching habitat (e.g. 0.8) would *reduce* the score.
  // 0.5+score maps neutral 0.5→1.0, a good match (0.8-1.3)→1.3-1.8 (boost),
  // a mismatch (0.2-0.35)→0.7-0.85 (penalty). No forest data → 1.0 (unchanged).
  const habitatFit = habitat ? 0.5 + habitat.score : 1;

  const baseSpeciesScore = speciesFit !== null ? baseScore * speciesFit : baseScore;

  // "Observasjoner nær her" (GBIF) — our strongest validated signal (AUC ~0.95
  // on spatial recurrence). Boost-only: real prior finds raise the score, but
  // absence never lowers it (presence-only data is sampling-biased, so 0
  // records ≠ no mushrooms). Capped so it complements, not dominates.
  const nearbyOccurrences = input.nearbyOccurrences ?? 0;
  const occurrenceBoost = 1 + Math.min(0.6, nearbyOccurrences * 0.05);

  const score = clamp(baseSpeciesScore * habitatFit * occurrenceBoost, 0, 100);

  return {
    score,
    baseScore,
    speciesFit,
    habitatFit,
    habitat,
    occurrenceBoost,
    nearbyOccurrences,
    components: { environment, historical, seasonal },
    factors
  };
}
