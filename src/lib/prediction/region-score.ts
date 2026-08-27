/**
 * Regionens publiserte dagstall: «der det er best i regionen», ikke snittet.
 *
 * Lå tidligere som to ORDRETTE kopier — én i /api/prediction/regions og én i
 * soppvarsel-cronen — med kommentaren «hold dem i takt» som eneste vern. De to
 * leser samme fliser og må gi samme tall: nettsiden viser det, og e-posten
 * varsler på det. Driver de fra hverandre, varsler vi på ett tall og viser et
 * annet.
 *
 * ⚠️ FOR SMÅ REGIONER ER DETTE MAKSIMUM, IKKE EN PERSENTIL.
 * Nærmeste-rang-persentilen plukker `sorted[min(n-1, floor(0.9n))]`. Klammen
 * binder når `floor(0.9n) >= n-1`, altså for n ≤ 10 — da er svaret alltid
 * siste element. Første n som gir en ekte persentil er 11.
 *
 * Målt i produksjon 2026-08-27 har fem av 22 regioner n ≤ 10 (Bodø 9,
 * Tromsø 6, Stavanger 5, Jönköping 9, Kalmar 9), mens Oslo har 51. Estimatoren
 * er altså en glidende skala: småregioner publiserer beste rute, Oslo den
 * sjette beste.
 *
 * Kostnaden er likevel liten, og det er verdt å vite HVORFOR før noen «fikser»
 * det: alle ruter i en region deler vær og sesong, så bare skog og habitat
 * varierer innad. Fordelingen er derfor nesten flat, og ordensstatistikkene
 * kollapser mot samme tall. Samme dag var maks − p90 lik 0 i 17 av 22
 * regioner, snitt 0,76, største avvik 5 (Ålesund) — mot et spenn topp–bunn på
 * 55 poeng i det publiserte tallet.
 *
 * Motprøven på at små regioner IKKE får gratis poeng: Stavanger har færrest
 * ruter av alle (5) og lå likevel som nummer 19 av 22.
 *
 * Bytter du estimator, husk at tallet allerede er sendt ut i soppvarsel-
 * e-poster og lagret i `region_daily_scores`. Historikken blir da ikke
 * sammenlignbar med nye tall.
 */

/** Ved og under dette antallet ruter er `regionScore` identisk med maksimum. */
export const DEGENERERER_UNDER_ANTALL_RUTER = 10;

/**
 * @param sorted rutescorer i STIGENDE rekkefølge. Usortert input gir feil svar
 *   uten å feile — kalleren må sortere.
 */
export function regionScore(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
}

/**
 * Er tallet for denne regionen i praksis maksimum av rutene?
 *
 * Finnes for at rangeringer og feilsøking skal kunne si det høyt i stedet for
 * at «90-persentilen» later som en presisjon den ikke har for små regioner.
 */
export function erMaksimumIPraksis(antallRuter: number): boolean {
  return antallRuter > 0 && antallRuter <= DEGENERERER_UNDER_ANTALL_RUTER;
}
