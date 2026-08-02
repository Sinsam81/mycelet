/**
 * Hvor mye ekte data en prediksjonsflis faktisk er bygget på.
 *
 * `prediction_tiles.confidence` var en LITERAL: hver eneste flis ble skrevet med
 * 70, uansett om cellen hadde full SR16-måling og fjorten dagers nedbørserie
 * eller bare en CORINE-arealklasse. Tallet så ut som en målt størrelse i
 * admin-flaten og ble brukt som vekt i /api/prediction, men kunne per
 * konstruksjon aldri avsløre at en region hadde tynt datagrunnlag — som er den
 * ENE tingen et slikt tall er verdt å ha.
 *
 * Dette er DATADEKNING, ikke treffsikkerhet. Det sier hvor mange av kildene vi
 * ønsker oss som faktisk svarte for denne cellen — ingenting om sannsynligheten
 * for å finne sopp der. Den ærlige romlige AUC-en er ~0,52, og ingenting her
 * har lov til å påstå mer om HVOR.
 *
 * Skalaen er derfor bevisst additiv og etterprøvbar: hvert ledd er «denne
 * kilden svarte» og har en fast vekt. Et tall på 65 betyr «to av fire kilder»,
 * ikke «65 % sjanse».
 */

export interface TileDataCoverageInput {
  /** Skogkilden for cellen. 'fallback' = ingen ekte måling. */
  forestSource: 'sr16' | 'corine' | 'fallback';
  /** Bonitet (H40) fra SR16 — null når rasteret ikke har verdi for cellen. */
  productivity: number | null;
  /** Stående volum m³/ha fra SR16. */
  volumePerHa: number | null;
  /** Jordfuktighetsindeks — krever daglig nedbørserie fra værkilden. */
  soilMoistureIndex: number | null;
  /** Selve nedbørserien. Null hos leverandører uten daglig historikk. */
  precipDailyMm: number[] | null;
}

/** Vektene, samlet ett sted så tallet kan leses baklengs. */
export const TILE_COVERAGE_WEIGHTS = {
  /** Full norsk skogmåling (treslag + bonitet + volum tilgjengelig). */
  forestSr16: 45,
  /** CORINE gir bare arealklasse — halv uttelling. */
  forestCorine: 25,
  /** Bonitet funnet for cellen. */
  productivity: 10,
  /** Volum funnet for cellen. */
  volume: 5,
  /** Værkilden ga nok historikk til å regne jordfuktighet. */
  soilMoisture: 25,
  /** … og selve dagsserien, som fenologi/flush leser. */
  precipSeries: 15
} as const;

/**
 * Returnerer datadekning i [0, 100].
 *
 * En norsk celle med full SR16 og Frost-historikk lander på 100. En svensk
 * celle med CORINE + SMHI lander på 65 — forskjellen er ekte, og det er hele
 * poenget: den viser at Sverige mangler treslagsdata, ikke at svenske
 * prognoser er dårligere gjetninger.
 */
export function computeTileDataCoverage(input: TileDataCoverageInput): number {
  let coverage = 0;

  if (input.forestSource === 'sr16') coverage += TILE_COVERAGE_WEIGHTS.forestSr16;
  else if (input.forestSource === 'corine') coverage += TILE_COVERAGE_WEIGHTS.forestCorine;

  // Detaljene finnes bare i SR16; CORINE lar dem alltid være null.
  if (input.productivity != null) coverage += TILE_COVERAGE_WEIGHTS.productivity;
  if (input.volumePerHa != null) coverage += TILE_COVERAGE_WEIGHTS.volume;

  if (input.soilMoistureIndex != null) coverage += TILE_COVERAGE_WEIGHTS.soilMoisture;
  if (input.precipDailyMm != null && input.precipDailyMm.length > 0) {
    coverage += TILE_COVERAGE_WEIGHTS.precipSeries;
  }

  return Math.max(0, Math.min(100, Math.round(coverage)));
}
