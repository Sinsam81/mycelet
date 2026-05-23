/**
 * SLU Forest Map (Skogskarta / kNN-Sverige) adapter — Sweden's counterpart
 * to NIBIO SR16.
 *
 * STUB for now: returns null so the region dispatcher (src/lib/forest) falls
 * back to the climate-only signal for Swedish coordinates. The architecture
 * is in place; only the data connection is missing.
 *
 * Why a stub and not live like NIBIO: SLU's data is free ("anyone may
 * download and use it") and actually richer on tree species than NIBIO —
 * per-species volume for tall, gran, contorta, björk, ek, bok and other
 * deciduous. But unlike NIBIO there is no anonymous live point-query WMS.
 * Activating it needs one of:
 *   1. A free SLU account → live WMS/REST point queries (like the MET Frost
 *      key pattern for weather).
 *   2. Bulk raster download (ftp://salix.slu.se/download/skogskarta) loaded
 *      into a local PostGIS table (like NIBIO "Vei 2").
 *
 * When activated, derive the dominant species (max per-species volume) →
 * ForestType, plus a productivity/volume estimate, and return the same
 * ForestProperties shape NIBIO returns so habitat scoring is unchanged.
 */

import { getRegion } from '@/lib/utils/region';
import type { ForestProperties, HabitatQuery } from '@/lib/nibio/types';

/** SLU Forest Map covers Sweden. Shares region.ts so NO/SE split is one source of truth. */
export function isWithinSweden(query: HabitatQuery): boolean {
  return getRegion(query.lat, query.lon) === 'SE';
}

/**
 * Fetch Swedish forest properties for a coordinate.
 *
 * STUB: returns null until SLU Forest Map is wired (account WMS/REST or
 * local PostGIS). Callers fall back to the climate signal.
 */
export async function getSwedishForestProperties(_query: HabitatQuery): Promise<ForestProperties | null> {
  return null;
}
