/**
 * ÉN skala for alle 7-dagersstripene.
 *
 * Det fantes fire ulike terskelsett for «hvor bra er en dag» på samme skjerm:
 * dommene (prediction-explanation), kartfargene (condition-colors), forsidens
 * strip (MushroomDayCard) og stedsstripen (PlaceForecastStrip). Alle fire var
 * satt for et verdiområde som ikke finnes, og alle fire kunne drive fra
 * hverandre uten at noen test merket det.
 *
 * Tersklene her er kalibrert mot fordelingen som FAKTISK forekommer i sesong.
 * Målt aug–okt (ERA5, 14 steder NO+SE, 2014–2024, n = 99 176 dagscorer):
 *
 *     min 27 · p01 45 · p05 55 · p25 73 · median 86 · p95 100
 *
 * De gamle var 40 og 65 — begge under 25-persentilen. Uttømmende oppregning av
 * alle 36 nåbare værkombinasjoner viser hvor ille: i aug/sep/okt er sesongvekten
 * 35, så laveste nåbare score er 35, og grått krever < 40. Grått traff da
 * **1 av 36 kombinasjoner (2,8 %)** — og den ene krever døgnmiddel utenfor
 * 6–22 °C *og* under 10 mm regn på 14 dager *og* luftfuktighet under 65 %
 * samtidig. Stripen kunne altså ikke si «ikke bry deg med å dra ut denne uka» i
 * den ene perioden det betyr noe. (Til sammenligning: i juni traff grått 41,7 %.)
 *
 * NB — SKALAEN ER ABSOLUTT, OG SKAL VÆRE DET. Den svarer «er denne dagen bra i
 * seg selv». Hvilken DAG i uka som er best er et relativt spørsmål, og det
 * besvares av søylehøyden — se forecast-bars.ts. Samme arbeidsdeling som på
 * kartet: absolutt for ærlighet, relativ for lesbarhet.
 */

/** Grønt krever i tillegg at dagen passerer optimal-porten i mushroom-day. */
export const FORECAST_GREEN_MIN = 85; // rundt medianen i sesong
/** Under dette er dagen reelt svak — p05 i sesongfordelingen. */
export const FORECAST_AMBER_MIN = 55;

export type ForecastBand = 'green' | 'amber' | 'grey';

export function forecastBand(score: number, optimal: boolean): ForecastBand {
  if (score >= FORECAST_GREEN_MIN && optimal) return 'green';
  if (score >= FORECAST_AMBER_MIN) return 'amber';
  return 'grey';
}
