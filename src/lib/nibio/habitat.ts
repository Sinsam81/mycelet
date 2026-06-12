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
 * Deciduous tree species (ASCII-normalized — see normalizeTreeName in
 * src/lib/forest). SR16 collapses all of these into a single coarse 'lauv'
 * class, so a species that names any of them as a partner counts as a
 * (partial) match when the cell is 'lauv'.
 */
const DECIDUOUS_PARTNERS: string[] = [
  'bjork',
  'eik',
  'bok',
  'osp',
  'or',
  'alm',
  'ask',
  'selje',
  'rogn',
  'hassel',
  'lind'
];

/**
 * Coniferous tree species. CORINE Land Cover (the Swedish source) collapses
 * spruce and pine into a single coarse 'bar' (class 312, coniferous forest),
 * so a species naming gran OR furu as a partner counts as a (partial) match
 * when the cell is 'bar' — the conifer mirror of the 'lauv' rule above.
 */
const CONIFEROUS_PARTNERS: string[] = ['gran', 'furu', 'contorta'];

/**
 * Raw Norwegian habitat tags (as stored in mushroom_species.habitat) that mark
 * a species as comfortable in OPEN ground — meadow saprotrophs like
 * parasollsopp and sjampinjong. For these, 'apent' is good, not a mismatch.
 */
const OPEN_HABITAT_TAGS: string[] = [
  'eng',
  'beite',
  'beitemark',
  'gress',
  'gressplen',
  'gressmark',
  'plen',
  'park',
  'hage',
  'lysninger',
  'kantsoner',
  'sti',
  'veikant',
  'sandig mark',
  'sandgrunn'
];

/**
 * Raw Norwegian habitat tags that mark a species as forest-dependent. Combined
 * with a non-empty mycorrhizal-partner list, these identify species that
 * genuinely cannot fruit in open landscape → eligible for the host gate.
 */
const FOREST_HABITAT_TAGS: string[] = [
  'skog',
  'barskog',
  'granskog',
  'furuskog',
  'lovskog',
  'løvskog',
  'lauvskog',
  'blandingsskog',
  'eikeskog',
  'fjellbjorkeskog',
  'fjellbjørkeskog',
  'lerkeskog',
  'fuktig skog',
  'moserik',
  'mose',
  'brannfelt',
  'myr',
  'myr-kant',
  'elvebredder'
];

function hasTag(habitat: string[], tags: string[]): boolean {
  return habitat.some((h) => tags.includes(h.toLowerCase().trim()));
}

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
      hostGate: 1,
      reasons: ['Ingen NIBIO-data tilgjengelig — bruker værsignal alene.']
    };
  }

  const reasons: string[] = [];
  let score = 0.5;
  let hostGate = 1;

  // Open-ground tolerance vs forest-dependence drive the host gate below.
  const opensTolerant = hasTag(preferences.habitat, OPEN_HABITAT_TAGS);
  const forestDependent =
    preferences.preferredPartners.length > 0 || hasTag(preferences.habitat, FOREST_HABITAT_TAGS);

  // ---- Tree-species match ----------------------------------------------
  // Mycorrhizal partner overlap is the single strongest habitat signal
  // for ectomycorrhizal mushrooms (kantarell, steinsopp, traktkantarell,
  // piggsopp, svart trompetsopp — i.e. our entire v1).
  if (preferences.preferredPartners.includes(forest.forestType)) {
    score += 0.4;
    reasons.push(`Treslag (${forest.forestType}) matcher artens partnere.`);
  } else if (
    forest.forestType === 'lauv' &&
    preferences.preferredPartners.some((partner) => DECIDUOUS_PARTNERS.includes(partner))
  ) {
    // SR16 lumps all deciduous into one 'lauv' class — we know it's
    // deciduous but not the exact tree. Reward species that like any
    // deciduous partner, a notch below an exact-species match.
    score += 0.3;
    reasons.push('Lauvskog matcher artens lauvtre-partnere (eksakt treslag ukjent i SR16).');
  } else if (
    forest.forestType === 'bar' &&
    preferences.preferredPartners.some((partner) => CONIFEROUS_PARTNERS.includes(partner))
  ) {
    // CORINE collapses spruce + pine into one 'bar' (coniferous) class — we
    // know it's conifer but not gran vs furu. Reward species that like any
    // conifer partner, a notch below an exact-species match (mirror of lauv).
    score += 0.3;
    reasons.push('Barskog matcher artens bartre-partnere (eksakt treslag ukjent i CORINE).');
  } else if (forest.forestType === 'blandet') {
    score += 0.2;
    reasons.push('Blandingsskog — sannsynlig overlapp med foretrukket treslag.');
  } else if (forest.forestType === 'apent') {
    // Host gate. Open landscape is GOOD for meadow species (eng/beite) but a
    // hard "cannot grow here" for forest/ectomycorrhizal species — a steinsopp
    // in a field should score ~0, not a soft 0.2.
    if (opensTolerant) {
      score += 0.3;
      reasons.push('Åpen mark (eng/beite) — akkurat denne artens habitat.');
    } else if (forestDependent) {
      hostGate = 0.12;
      reasons.push('Åpent landskap uten vertstrær — arten er skogsavhengig og finnes praktisk talt ikke her.');
    } else {
      score -= 0.1;
      reasons.push('Åpent landskap — usikkert habitat for arten.');
    }
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
    hostGate,
    reasons
  };
}
