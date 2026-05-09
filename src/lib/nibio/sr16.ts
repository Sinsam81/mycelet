/**
 * SR16 forest-raster data adapter.
 *
 * Currently a STUB — returns null so callers can wire up habitat scoring
 * with the right shape, then drop in real SR16 fetching later. See
 * `docs/nibio-setup.md` for the planned implementation paths:
 *
 *   1. Live WFS query against NIBIO Kilden (simplest, depends on
 *      kilden.nibio.no uptime + adds a network hop per cell).
 *   2. Local PostGIS table populated from the SR16 raster GeoTIFF
 *      (recommended for production — single spatial query, deterministic
 *      latency, works offline).
 *
 * This stub is intentionally synchronous-shaped (returns Promise<>) so the
 * real implementation can be dropped in without changing call sites.
 *
 * Coverage caveat: SR16 covers mainland Norway. Returns null for queries
 * outside the bounding box (southern: ~57.9°N, northern: ~71.2°N,
 * western: ~4.5°E, eastern: ~31.1°E) so callers can short-circuit to
 * fallback. Sweden/Finland get a separate adapter (TODO).
 */

import { getRegion } from '@/lib/utils/region';
import type { ForestProperties, HabitatQuery } from './types';

/**
 * SR16 dekker Fastlands-Norge. Bruker `getRegion` fra region.ts så vi
 * deler bounding-box-logikken med vær-adapterne — én sannhet om hva
 * som er Norge vs Sverige vs annet.
 */
export function isWithinNorway(query: HabitatQuery): boolean {
  return getRegion(query.lat, query.lon) === 'NO';
}

/**
 * Fetch SR16 forest properties for a single coordinate.
 *
 * STUB: returns null. Real implementation will fetch from NIBIO Kilden
 * WFS or query a local PostGIS sr16 table populated from the GeoTIFF.
 *
 * Returns null in three cases the caller must handle:
 *   - Outside Norway bounding box → use Sweden adapter or fallback
 *   - SR16 has no cell value at the coordinate (water, urban, mask)
 *   - Network/DB error reaching the adapter
 */
export async function getForestProperties(query: HabitatQuery): Promise<ForestProperties | null> {
  if (!isWithinNorway(query)) {
    return null;
  }
  // Wire up to nibio.kilden WFS or local PostGIS sr16 table here.
  // See docs/nibio-setup.md for the chosen implementation.
  return null;
}

/**
 * Fallback ForestProperties for when SR16 has no data. All-null fields
 * with source='fallback' signal "no signal — score neutrally".
 *
 * Exported for tests and for the prediction-tile generator (which can
 * choose to skip cells without data instead of scoring them neutrally).
 */
export function fallbackProperties(): ForestProperties {
  return {
    forestType: 'ukjent',
    ageYears: null,
    productivity: null,
    volumePerHa: null,
    source: 'fallback'
  };
}
