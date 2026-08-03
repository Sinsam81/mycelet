export interface PredictionTileRegion {
  name: string;
  /**
   * Landet regionen ligger i. Finnes for å kunne kjøre generatoren ETT LAND OM
   * GANGEN — se kommentaren over PREDICTION_TILE_REGIONS om kjøretid.
   */
  country: 'NO' | 'SE';
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  step: number;
}

/**
 * Hvor rasteret forhåndsberegnes.
 *
 * ⚠️ DETTE ER HELE DEKNINGEN. Utenfor disse rutene faller /api/prediction til
 * `computed_fallback`, som svarer — men returnerer NULL søkeområder. Målt
 * 2026-08-02: Oslo og Trondheim ga 3 områder hver, Göteborg og Tromsø ga 0.
 *
 * Lista sto med fem norske byregioner og ingen svenske, selv om appen selger i
 * Sverige og databasen har **227 496 svenske funn**. En svensk bruker åpnet altså
 * kartet og fikk ingenting — ikke fordi dataene manglet, men fordi denne lista
 * ikke nevnte landet.
 *
 * De svenske regionene er valgt ETTER FUNNTETTHET, ikke etter folketall: antall
 * soppfunn innen 40 km av bysenteret i species_occurrences (n = 40 000 svenske
 * funn lest 2026-08-03). Rekkefølgen var Stockholm 1721, Uppsala 1320,
 * Örebro 1026, Umeå 1005, Linköping 942, Växjö 740, Göteborg 655, Malmö 491.
 *
 * Skogoppslaget er verifisert for Sverige før dette ble lagt inn: 12 av 20 ekte
 * svenske kantarellkoordinater fikk skogdata via CORINE — bedre treffrate enn
 * de 6 av 20 SR16 ga i det norske kontrollutvalget. NB at CORINE ikke gir
 * bonitet (`productivity: null`), så svenske ruter har grovere habitatdetalj enn
 * de norske. Skogtypen, som er det arts-habitatkoblingen faktisk bruker, er der.
 *
 * ⏱️ KJØRETID — DERFOR KJØRES LANDENE HVER FOR SEG.
 * Målt 2026-08-03 med 5 samtidige oppslag, samme som generatoren bruker:
 * det svenske skogoppslaget (CORINE) tar **329 ms per rute**, det norske
 * (SR16) **29 ms** — elleve ganger raskere. 312 svenske ruter er dermed
 * ~103 sekunder alene, mot en `maxDuration` på 300.
 *
 * Regionene skrives inne i løkka, så en timeout tar bare regionene som ikke
 * rakk å kjøre — og siden de svenske står sist, ville det systematisk vært DE
 * som røk. Derfor har hver region et `country`, og cron-en kjører NO og SE i
 * hver sin planlagte kjøring (se vercel.json).
 *
 * Legger du til en region: hver rute koster ett skogoppslag mot en ekstern WMS
 * ved hver nattlige kjøring, så voks i steg og se på generatorloggen.
 */
export const PREDICTION_TILE_REGIONS: readonly PredictionTileRegion[] = [
  // Norge
  { name: 'Oslo', country: 'NO', minLat: 59.72, maxLat: 60.05, minLng: 10.35, maxLng: 11.15, step: 0.06 },
  { name: 'Trondheim', country: 'NO', minLat: 63.28, maxLat: 63.52, minLng: 10.2, maxLng: 10.65, step: 0.07 },
  { name: 'Bergen', country: 'NO', minLat: 60.2, maxLat: 60.52, minLng: 5.05, maxLng: 5.6, step: 0.07 },
  { name: 'Stavanger', country: 'NO', minLat: 58.85, maxLat: 59.05, minLng: 5.6, maxLng: 6.1, step: 0.07 },
  { name: 'Innlandet', country: 'NO', minLat: 60.7, maxLat: 61.0, minLng: 11.0, maxLng: 11.6, step: 0.07 },
  // Sverige — sortert etter funntetthet, se kommentaren over
  { name: 'Stockholm', country: 'SE', minLat: 59.2, maxLat: 59.55, minLng: 17.7, maxLng: 18.4, step: 0.07 },
  { name: 'Uppsala', country: 'SE', minLat: 59.75, maxLat: 60.0, minLng: 17.35, maxLng: 17.95, step: 0.07 },
  { name: 'Örebro', country: 'SE', minLat: 59.15, maxLat: 59.45, minLng: 14.9, maxLng: 15.5, step: 0.07 },
  { name: 'Umeå', country: 'SE', minLat: 63.7, maxLat: 63.95, minLng: 20.0, maxLng: 20.6, step: 0.07 },
  { name: 'Linköping', country: 'SE', minLat: 58.3, maxLat: 58.55, minLng: 15.35, maxLng: 15.95, step: 0.07 },
  { name: 'Växjö', country: 'SE', minLat: 56.75, maxLat: 57.0, minLng: 14.55, maxLng: 15.1, step: 0.07 },
  { name: 'Göteborg', country: 'SE', minLat: 57.6, maxLat: 57.85, minLng: 11.75, maxLng: 12.3, step: 0.07 },
  { name: 'Malmö', country: 'SE', minLat: 55.5, maxLat: 55.8, minLng: 13.0, maxLng: 13.6, step: 0.07 }
];

export function predictionTileGridCells(
  region: PredictionTileRegion
): Array<{ lat: number; lng: number }> {
  const cells: Array<{ lat: number; lng: number }> = [];
  for (let lat = region.minLat; lat <= region.maxLat; lat += region.step) {
    for (let lng = region.minLng; lng <= region.maxLng; lng += region.step) {
      cells.push({ lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) });
    }
  }
  return cells;
}
