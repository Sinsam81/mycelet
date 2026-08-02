/**
 * Real terrain elevation from Kartverket (Geonorge Høydedata), replacing the
 * old pseudo-noise terrain proxy. Free, no key. Norway only (DTM coverage).
 *
 * Point API: GET /hoydedata/v1/punkt?koordsys=4258&nord=<lat>&ost=<lon>
 *   → { punkter: [{ z: <elevation m>, terreng: "<class>", ... }] }
 */

import { getRegion } from '@/lib/utils/region';
import { PointCache } from '@/lib/cache/point-cache';

export interface ElevationResult {
  /** Metres above sea level, or null over sea / no DTM coverage. */
  elevationM: number | null;
  /** Kartverket terrain class (e.g. "Skog", "ÅpentOmråde", "Tettbebyggelse"). */
  terrainClass: string | null;
}

/**
 * Høyden i et punkt endrer seg aldri, men rutenettene slo den opp på nytt ved
 * hvert knappetrykk. Se src/lib/cache/point-cache.ts.
 */
const elevationCache = new PointCache<ElevationResult | null>({
  ttlMs: 24 * 60 * 60 * 1000,
  maxEntries: 5000
});
/** Kort levetid for «ingen data» — det kan være en tjeneste som var nede. */
const NULL_TTL_MS = 10 * 60 * 1000;

/** Kun for tester. */
export function clearElevationCache(): void {
  elevationCache.clear();
}

export async function getElevation({ lat, lon }: { lat: number; lon: number }): Promise<ElevationResult | null> {
  // Kartverkets DTM dekker bare Norge. Uten denne vakten sendte rutenettene
  // (49-196 celler per «Lovende steder»-trykk) like mange kall til Geonorge for
  // svenske koordinater — hvert med 3 sekunders timeout-budsjett — og fikk
  // garantert {z: null} tilbake. Ren ventetid for brukeren og ren belastning på
  // en offentlig norsk tjeneste. Samme mønster som getForestProperties, som
  // gjør regionsjekken selv, slik at kallstedene slipper å vite noe.
  if (getRegion(lat, lon) !== 'NO') return null;

  const cached = elevationCache.get(lat, lon);
  if (cached.hit) return cached.value;

  const result = await fetchElevation(lat, lon);
  // Et null-svar kan være ekte «ingen DTM-dekning», men det kan også være at
  // Geonorge var nede i det øyeblikket. Hold det kort, så et blaff ikke blir
  // stående som en sannhet et helt døgn.
  elevationCache.set(lat, lon, result, result == null ? NULL_TTL_MS : undefined);
  return result;
}

async function fetchElevation(lat: number, lon: number): Promise<ElevationResult | null> {
  try {
    const res = await fetch(
      `https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4258&nord=${lat}&ost=${lon}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { punkter?: { z?: number | null; terreng?: string }[] };
    const point = json?.punkter?.[0];
    if (!point || typeof point.z !== 'number') return null;
    return { elevationM: point.z, terrainClass: typeof point.terreng === 'string' ? point.terreng : null };
  } catch {
    return null;
  }
}

/**
 * Map real elevation (m) to a 0-100 terrain-suitability score. Hand-calibrated:
 * most Norwegian matsopp foraging is lowland–mid forest; suitability declines
 * toward and above the tree line (~900–1100 m in southern Norway).
 */
export function elevationToTerrainScore(elevationM: number): number {
  if (elevationM <= 500) return 90;
  if (elevationM >= 1100) return 15;
  return Math.round(90 - ((elevationM - 500) / 600) * 75);
}
