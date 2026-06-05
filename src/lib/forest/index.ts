/**
 * Country-neutral forest-data entry point for the prediction engine.
 *
 * Routes a coordinate to the right national adapter by region — the same
 * pattern src/lib/weather/index.ts uses for weather:
 *
 *   NO    -> NIBIO SR16        (live, no account)   [src/lib/nibio]
 *   SE    -> CORINE Land Cover (live, no account)   [src/lib/corine]
 *   other -> null (prediction falls back to the climate signal)
 *
 * Callers should treat null as "no forest signal here" and lean on weather
 * + observations, never as "score zero".
 */

import { getRegion } from '@/lib/utils/region';
import { getForestProperties as getNorwegianForestProperties } from '@/lib/nibio';
import { getCorineForest } from '@/lib/corine';
import type {
  ForestProperties,
  ForestType,
  HabitatQuery,
  SpeciesHabitatPreferences
} from '@/lib/nibio/types';

export async function getForestProperties(query: HabitatQuery): Promise<ForestProperties | null> {
  const region = getRegion(query.lat, query.lon);
  if (region === 'NO') return getNorwegianForestProperties(query);
  // Sweden: CORINE Land Cover (forest type only).
  if (region === 'SE') return getCorineForest(query);
  return null;
}

/** Minimal shape from a mushroom_species row needed to score habitat. */
export interface SpeciesHabitatRow {
  mycorrhizalPartners: string[] | null;
  habitat: string[] | null;
}

/**
 * Fold Norwegian tree names to the ASCII ForestType vocabulary. The DB stores
 * mycorrhizal partners in real orthography ("bjørk", "bøk", "gråor") while
 * ForestType / habitat scoring use ASCII ("bjork", "bok"). Without this,
 * birch/beech-loving species silently miss the deciduous-forest match.
 */
function normalizeTreeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'a')
    .replace(/å/g, 'a')
    .trim();
}

/**
 * Build SpeciesHabitatPreferences from a mushroom_species row's habitat
 * columns. No age window — the DB has no stand-age column and SR16 exposes
 * none either, so habitat scoring leans on tree-species match + soil
 * richness rather than age.
 */
export function buildSpeciesHabitatPreferences(row: SpeciesHabitatRow): SpeciesHabitatPreferences {
  return {
    preferredPartners: (row.mycorrhizalPartners ?? []).map(normalizeTreeName) as ForestType[],
    habitat: row.habitat ?? []
  };
}

export { computeHabitatScore } from '@/lib/nibio';
export type {
  ForestProperties,
  ForestType,
  HabitatQuery,
  HabitatScore,
  SpeciesHabitatPreferences
} from '@/lib/nibio/types';
