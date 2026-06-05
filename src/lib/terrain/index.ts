/**
 * Real terrain elevation from Kartverket (Geonorge Høydedata), replacing the
 * old pseudo-noise terrain proxy. Free, no key. Norway only (DTM coverage).
 *
 * Point API: GET /hoydedata/v1/punkt?koordsys=4258&nord=<lat>&ost=<lon>
 *   → { punkter: [{ z: <elevation m>, terreng: "<class>", ... }] }
 */

export interface ElevationResult {
  /** Metres above sea level, or null over sea / no DTM coverage. */
  elevationM: number | null;
  /** Kartverket terrain class (e.g. "Skog", "ÅpentOmråde", "Tettbebyggelse"). */
  terrainClass: string | null;
}

export async function getElevation({ lat, lon }: { lat: number; lon: number }): Promise<ElevationResult | null> {
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
