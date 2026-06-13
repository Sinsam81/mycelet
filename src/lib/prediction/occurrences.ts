/**
 * Helpers for the "observasjoner nær her" signal — counting real GBIF/
 * Artsdatabanken occurrence points near a coordinate. Pure functions; the
 * callers fetch the points (via get_occurrences_in_bounds) and bucket per cell.
 */

export interface OccurrencePoint {
  latitude: number;
  longitude: number;
  species_id: number | null;
}

export function occurrenceHaversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Count occurrence points within `km` of (lat, lng). */
export function countWithinKm(
  points: { latitude: number; longitude: number }[],
  lat: number,
  lng: number,
  km: number
): number {
  let count = 0;
  for (const p of points) {
    if (occurrenceHaversineKm(lat, lng, p.latitude, p.longitude) <= km) count++;
  }
  return count;
}

/** Default kernel bandwidth (km) — a find at this distance counts ~37% (e^-1). */
export const OCCURRENCE_KERNEL_BANDWIDTH_KM = 1.5;
/** Beyond this the Gaussian weight is negligible (~0.001) — skip for speed. */
export const OCCURRENCE_KERNEL_CUTOFF_KM = 5;

/**
 * Distance-decayed occurrence density at (lat, lng): a Gaussian kernel sum
 * `Σ exp(-(d/bw)²)` over nearby points. Replaces the hard `countWithinKm`
 * circle for the prediction boost — a find 150 m away should weigh far more
 * than one 3.9 km away, which a hard radius treats identically. The returned
 * value is an "effective nearby-finds" count (a tight cluster on the cell
 * approaches the raw count; spread-out finds sum to much less), so it drops
 * straight into the existing `1 + min(0.6, x·0.05)` boost without rescaling.
 */
export function weightedOccurrenceDensity(
  points: { latitude: number; longitude: number }[],
  lat: number,
  lng: number,
  bandwidthKm: number = OCCURRENCE_KERNEL_BANDWIDTH_KM,
  cutoffKm: number = OCCURRENCE_KERNEL_CUTOFF_KM
): number {
  let sum = 0;
  for (const p of points) {
    const d = occurrenceHaversineKm(lat, lng, p.latitude, p.longitude);
    if (d > cutoffKm) continue;
    const r = d / bandwidthKm;
    sum += Math.exp(-(r * r));
  }
  return sum;
}
