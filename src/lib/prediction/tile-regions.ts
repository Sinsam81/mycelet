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
  // Lagt til 2026-08-04 etter funntetthet i områder som sto uten dekning:
  // Kristiansand 3297 funn, Tromsø 1470, Ålesund 1190, Bodø 762. Norske ruter
  // koster 29 ms hver, så disse fire er ~3 sekunder til sammen.
  { name: 'Kristiansand', country: 'NO', minLat: 58.05, maxLat: 58.35, minLng: 7.75, maxLng: 8.45, step: 0.07 },
  { name: 'Ålesund', country: 'NO', minLat: 62.35, maxLat: 62.6, minLng: 6.0, maxLng: 6.7, step: 0.07 },
  { name: 'Tromsø', country: 'NO', minLat: 69.5, maxLat: 69.75, minLng: 18.6, maxLng: 19.4, step: 0.07 },
  { name: 'Bodø', country: 'NO', minLat: 67.2, maxLat: 67.42, minLng: 14.3, maxLng: 15.0, step: 0.07 },
  // Sverige — sortert etter funntetthet, se kommentaren over
  { name: 'Stockholm', country: 'SE', minLat: 59.2, maxLat: 59.55, minLng: 17.7, maxLng: 18.4, step: 0.07 },
  { name: 'Uppsala', country: 'SE', minLat: 59.75, maxLat: 60.0, minLng: 17.35, maxLng: 17.95, step: 0.07 },
  { name: 'Örebro', country: 'SE', minLat: 59.15, maxLat: 59.45, minLng: 14.9, maxLng: 15.5, step: 0.07 },
  { name: 'Umeå', country: 'SE', minLat: 63.7, maxLat: 63.95, minLng: 20.0, maxLng: 20.6, step: 0.07 },
  { name: 'Linköping', country: 'SE', minLat: 58.3, maxLat: 58.55, minLng: 15.35, maxLng: 15.95, step: 0.07 },
  { name: 'Växjö', country: 'SE', minLat: 56.75, maxLat: 57.0, minLng: 14.55, maxLng: 15.1, step: 0.07 },
  { name: 'Göteborg', country: 'SE', minLat: 57.6, maxLat: 57.85, minLng: 11.75, maxLng: 12.3, step: 0.07 },
  // Flyttet østover 2026-08-04: den opprinnelige boksen startet på 13,0, som er
  // Øresund og Malmö sentrum. Målt etter første nattlige kjøring lå alle de 49
  // rutene som faktisk fikk skogdata mellom 13,35 og 13,56 — de fem vestligste
  // kolonnene ga null. Nå dekker den Romeleåsen og skogen øst for byen i stedet.
  { name: 'Malmö', country: 'SE', minLat: 55.5, maxLat: 55.85, minLng: 13.25, maxLng: 13.95, step: 0.07 },
  // Lagt til 2026-08-04, også etter funntetthet: Kalmar 6376, Falun 2682,
  // Jönköping 2560, Sundsvall 2553, Östersund 2299. Kiruna (191) er utelatt —
  // for få funn til å forsvare 329 ms per rute hver natt.
  //
  // Boksene er bevisst smalere enn de norske. Svenske ruter er elleve ganger
  // dyrere, og testen «lar hvert land kjøres for seg» vokter at landet holder
  // seg under kjøretidsbudsjettet. Vokser lista videre, krymp heller boksene
  // enn å heve grensen.
  { name: 'Kalmar', country: 'SE', minLat: 56.6, maxLat: 56.78, minLng: 16.0, maxLng: 16.42, step: 0.07 },
  { name: 'Falun', country: 'SE', minLat: 60.54, maxLat: 60.72, minLng: 15.4, maxLng: 15.82, step: 0.07 },
  { name: 'Jönköping', country: 'SE', minLat: 57.7, maxLat: 57.88, minLng: 13.95, maxLng: 14.37, step: 0.07 },
  { name: 'Sundsvall', country: 'SE', minLat: 62.32, maxLat: 62.48, minLng: 17.05, maxLng: 17.47, step: 0.07 },
  { name: 'Östersund', country: 'SE', minLat: 63.12, maxLat: 63.28, minLng: 14.45, maxLng: 14.87, step: 0.07 }
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
