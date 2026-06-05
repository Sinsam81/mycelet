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
