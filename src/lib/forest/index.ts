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
import { PointCache } from '@/lib/cache/point-cache';
import type {
  ForestProperties,
  ForestType,
  HabitatQuery,
  SpeciesHabitatPreferences
} from '@/lib/nibio/types';

/**
 * Skogtypen i et punkt endrer seg ikke mellom to knappetrykk, men rutenettene i
 * /api/prediction/grid og /api/prediction/species-spots slo den opp på nytt hver
 * gang: 49 kall per forsøk, og klienten prøver fire radier etter hverandre. Se
 * src/lib/cache/point-cache.ts for hvorfor og hva denne cachen IKKE er.
 *
 * Null caches også — en celle over sjø eller by svarer null hver gang, og det
 * er nettopp de cellene radius-utvidelsen tramper gjennom flest av.
 */
const forestCache = new PointCache<ForestProperties | null>({
  ttlMs: 24 * 60 * 60 * 1000,
  maxEntries: 5000
});
/**
 * Kort levetid for «ingen skogdata». Null kan være ekte (sjø, by, utenfor
 * Norden), men det kan også være NIBIO eller CORINE som var nede i det
 * øyeblikket — og et blaff skal ikke stå som en sannhet et helt døgn.
 */
const NULL_TTL_MS = 10 * 60 * 1000;

export async function getForestProperties(query: HabitatQuery): Promise<ForestProperties | null> {
  const cached = forestCache.get(query.lat, query.lon);
  if (cached.hit) return cached.value;

  const region = getRegion(query.lat, query.lon);
  let result: ForestProperties | null = null;
  if (region === 'NO') result = await getNorwegianForestProperties(query);
  // Sweden: CORINE Land Cover (forest type only).
  else if (region === 'SE') result = await getCorineForest(query);

  forestCache.set(query.lat, query.lon, result, result == null ? NULL_TTL_MS : undefined);
  return result;
}

/** Kun for tester. */
export function clearForestCache(): void {
  forestCache.clear();
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
