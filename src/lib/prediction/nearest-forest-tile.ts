/**
 * Hvilken flis' skogdata har vi lov til å vise for punktet brukeren peker på?
 *
 * `/api/prediction` henter alle fliser i en boks på ±radiusKm (15 km som
 * standard) og brukte til nå den HØYEST SCORENDE flisa med skogdata som
 * «skogen her». Det var galt på to måter:
 *
 *  1. Rasteret har 0,06–0,07 graders steg (se tile-regions.ts) — altså rundt
 *     7 km mellom flismidtpunktene. Ingen flis ligger «her» i noen praktisk
 *     forstand; den nærmeste ligger typisk et par kilometer unna.
 *  2. Å velge den best scorende er systematisk skjevt OPPOVER: av alle
 *     skogflekkene i en 30 km bred boks fikk brukeren beskrivelsen av den
 *     beste. En bruker i Oslo sentrum fikk «granskog, bonitet 20» — en ekte
 *     NIBIO-måling, fra en flis 15,5 km unna.
 *
 * Nærmeste flis er det beste estimatet vi faktisk har for punktet, og
 * avstanden følger med ut så teksten kan si den høyt. Presisjonen i «bonitet
 * 20» skal ikke lånes bort til et sted vi ikke har målt.
 *
 * Merk at dette ikke påstår noe mer om HVOR soppen står — den romlige delen av
 * modellen har ærlig AUC rundt 0,52. Det gjør bare den viste skogen til riktig
 * skog, med riktig avstand.
 */

import { occurrenceHaversineKm } from './occurrences';

/** Minste flis-form denne modulen trenger: posisjon + eventuelle skogdata. */
export interface ForestBearingTile {
  center_lat: number;
  center_lng: number;
  components?: { forest?: unknown } | null;
}

export interface NearestForestTile<T> {
  tile: T;
  /** Avstand i km fra punktet det ble spurt om til flisens midtpunkt. */
  distanceKm: number;
}

/**
 * Flisa med skogdata som ligger nærmest (lat, lon).
 *
 * Returnerer null når ingen flis i utvalget har skogdata (vann, by, utenfor
 * SR16/CORINE-dekning). Uavgjort brytes på først i lista, så samme utvalg gir
 * samme svar ved hver panorering.
 */
export function nearestForestTile<T extends ForestBearingTile>(
  tiles: readonly T[],
  lat: number,
  lon: number
): NearestForestTile<T> | null {
  let best: NearestForestTile<T> | null = null;

  for (const tile of tiles) {
    if (!tile.components?.forest) continue;
    const distanceKm = occurrenceHaversineKm(lat, lon, tile.center_lat, tile.center_lng);
    if (!best || distanceKm < best.distanceKm) best = { tile, distanceKm };
  }

  return best;
}
