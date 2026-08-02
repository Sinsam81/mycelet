/** Storsirkelavstand i kilometer. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Kutt punkter som ligger utenfor radiusen vi lover brukeren.
 *
 * «Lovende steder» bygger søkeområdet som en lat/lng-BOKS med halvbredde
 * radiusKm, mens banneret sier «{count} lovende steder innen {km} km». Et
 * rutesenter i hjørnet av boksen ligger opptil √2 ganger radiusen unna, og
 * popupen på samme nål skriver ut sin egen haversine-avstand — så de to tallene
 * motsa hverandre på skjermen samtidig: «6 lovende steder innen 5 km» over en
 * nål som selv sa «~6,1 km». Å filtrere er ærligere enn å skrive om banneret:
 * det brukeren blir lovt, er det brukeren får se.
 */
export function filterWithinRadiusKm<T extends { lat: number; lng: number }>(
  origin: { lat: number; lng: number },
  points: readonly T[],
  radiusKm: number
): T[] {
  return points.filter((p) => haversineKm(origin.lat, origin.lng, p.lat, p.lng) <= radiusKm);
}
