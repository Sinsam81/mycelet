/**
 * Type definitions for NIBIO-derived forest data.
 *
 * NIBIO Kilden serves Norwegian land/forest datasets via WMS/WFS:
 *   - AR5/AR50: arealressurs (land use — skog, åker, myr, etc.)
 *   - SR16:     treslag, alder, bonitet, volum per 16×16 m raster
 *
 * SR16 is what the prediction engine cares about most: knowing whether a
 * coordinate sits in old gran-skog vs young furu-plantasje vs løvskog
 * shifts the per-species habitat score dramatically.
 *
 * The values here are normalized to the vocabulary used by
 * `mushroom_species.mycorrhizal_partners` and `habitat` arrays (migration
 * 009) so habitat-scoring can compare apples to apples.
 */

/**
 * Tree species classes — matches the values used in
 * mushroom_species.mycorrhizal_partners (lower-case Norwegian).
 *
 * The SR16 WMS treslag raster only distinguishes three forest classes:
 * 'gran' (1), 'furu' (2) and 'lauv' (3 — all deciduous lumped together).
 * The granular deciduous types ('bjork', 'eik', 'bok', 'osp', 'or') exist
 * because species' mycorrhizal_partners name specific trees; habitat
 * scoring maps the coarse 'lauv' onto them as a deciduous-group match.
 *
 * 'blandet' (mixed) is not produced by SR16 treslag but kept for a future
 * AR5/landcover source. 'apent' covers non-forest cells; note SR16 returns
 * nodata (-9999) for water/urban/open land, which getForestProperties maps
 * to null (not 'apent') so callers fall back to the climate signal.
 * 'ukjent' is the explicit unknown for an unrecognized class code.
 */
export type ForestType =
  | 'gran'
  | 'furu'
  | 'lauv'
  | 'bjork'
  | 'eik'
  | 'bok'
  | 'osp'
  | 'or'
  | 'blandet'
  | 'apent'
  | 'ukjent';

/**
 * SR16 raster cell properties for a given coordinate.
 *
 * Numeric fields are nullable because SR16 doesn't have full coverage —
 * Finnmark/Svalbard are partial, urban areas are masked out, and small
 * gaps exist along the coast. Treat null as "no data, fall back to
 * climate/observation signal" rather than "score 0".
 */
export interface ForestProperties {
  forestType: ForestType;
  /** Tree-stand mean age in years. NULL when SR16 has no value for the cell. */
  ageYears: number | null;
  /**
   * Bonitet (site index, H40) — height in meters that the dominant trees
   * reach at age 40. Norwegian forestry standard. Higher = more productive.
   * Practical range: 6 (poor) to 26 (rich).
   */
  productivity: number | null;
  /** Stem volume in m³/ha. */
  volumePerHa: number | null;
  /** Where the values came from. 'fallback' = no SR16 cell, neutral defaults. */
  source: 'sr16' | 'fallback';
}

export interface HabitatQuery {
  lat: number;
  lon: number;
}

/**
 * Per-species habitat preferences. Compared against ForestProperties to
 * compute a habitat score in [0, 1].
 *
 * Lives separately from the genus/species scoring profiles in
 * src/lib/utils/species-scoring.ts because that file is climate-only —
 * habitat-score is an independent multiplier composed at the prediction
 * layer.
 */
export interface SpeciesHabitatPreferences {
  /** Mycorrhizal partners in the species' database row. */
  preferredPartners: ForestType[];
  /** Free-form habitat tags ('granskog', 'lauvskog', 'kalkrik', etc.). */
  habitat: string[];
  /** Preferred age window in years. Most edible mushrooms favor older stands. */
  preferredAgeYearsMin?: number;
  preferredAgeYearsMax?: number;
}

export interface HabitatScore {
  /** Score in [0, 1]. 0.5 means "neutral / no signal". */
  score: number;
  /** Human-readable reasons — shown via PredictionExplanation. */
  reasons: string[];
}
