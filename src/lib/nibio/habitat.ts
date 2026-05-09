/**
 * Per-species habitat scoring against NIBIO-derived forest properties.
 *
 * This is the rules-based v1 of habitat scoring. v2 (post-GBIF backfill)
 * will fit weights from real observation data, but the rules-based form
 * is deliberately the entry point — "forklarbart, forsvarbart, iterabelt"
 * (see docs/roadmap.md).
 *
 * The score is a multiplier in [0.2, 1.3] that the prediction layer
 * combines with the climate score. 0.5 is neutral (no signal — fallback
 * data or shrug-shaped match). Below 0.5 actively discourages the cell
 * (e.g. kantarell in apent landskap).
 */

import type { ForestProperties, HabitatScore, SpeciesHabitatPreferences } from './types';

/**
 * Compute the habitat-fit multiplier for a given (forest, species) pair.
 *
 * Returns a neutral score with a single "no data" reason when forest is
 * null or fallback-sourced — the prediction layer then leans entirely on
 * climate + observation signals for that cell.
 */
export function computeHabitatScore(
  forest: ForestProperties | null,
  preferences: SpeciesHabitatPreferences
): HabitatScore {
  if (!forest || forest.source === 'fallback') {
    return {
      score: 0.5,
      reasons: ['Ingen NIBIO-data tilgjengelig — bruker værsignal alene.']
    };
  }

  const reasons: string[] = [];
  let score = 0.5;

  // ---- Tree-species match ----------------------------------------------
  // Mycorrhizal partner overlap is the single strongest habitat signal
  // for ectomycorrhizal mushrooms (kantarell, steinsopp, traktkantarell,
  // piggsopp, svart trompetsopp — i.e. our entire v1).
  if (preferences.preferredPartners.includes(forest.forestType)) {
    score += 0.4;
    reasons.push(`Treslag (${forest.forestType}) matcher artens partnere.`);
  } else if (forest.forestType === 'blandet') {
    score += 0.2;
    reasons.push('Blandingsskog — sannsynlig overlapp med foretrukket treslag.');
  } else if (forest.forestType === 'apent') {
    score -= 0.3;
    reasons.push('Åpent landskap — sopp-arten foretrekker skog.');
  } else if (forest.forestType !== 'ukjent') {
    score -= 0.15;
    reasons.push(`Treslag (${forest.forestType}) er ikke artens favoritt.`);
  }

  // ---- Stand age --------------------------------------------------------
  // Most edibles favor older stands (better mycorrhizal networks, deeper
  // moss, more dead wood). Apply only when the species has a preference.
  if (preferences.preferredAgeYearsMin != null && forest.ageYears != null) {
    const min = preferences.preferredAgeYearsMin;
    const max = preferences.preferredAgeYearsMax ?? Infinity;
    if (forest.ageYears >= min && forest.ageYears <= max) {
      score += 0.15;
      reasons.push(`Bestandsalder (${forest.ageYears} år) er innenfor foretrukket vindu.`);
    } else if (forest.ageYears < min) {
      score -= 0.1;
      reasons.push(`Bestandet er for ungt (${forest.ageYears} år, ønsker ≥${min}).`);
    }
  }

  // ---- Productivity -----------------------------------------------------
  // Bonitet (H40) above ~14 indicates rich soil — kalkrik, varierte arter.
  // Some species (piggsopp, svart trompetsopp) explicitly like this; we
  // detect that via the 'kalkrik' habitat tag.
  if (forest.productivity != null && forest.productivity >= 14) {
    if (preferences.habitat.includes('kalkrik') || preferences.habitat.includes('næringsrik')) {
      score += 0.1;
      reasons.push('Høy bonitet — næringsrik mark som arten trives i.');
    }
  }

  // Clamp to [0.2, 1.3] — extreme down-weights still allow the cell to
  // surface if climate is exceptional, and extreme up-weights don't
  // single-handedly determine the prediction.
  const clamped = Math.max(0.2, Math.min(1.3, score));

  return {
    score: clamped,
    reasons
  };
}
