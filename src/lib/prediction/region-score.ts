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

/**
 * Dommestigen for REGIONENS dagstall — en annen fordeling enn rutenes.
 *
 * ⚠️ IKKE bruk CONDITION_THRESHOLDS her, og ikke bruk denne på ruter.
 *
 * Feilen som gjorde dette nødvendig: regionsendepunktet ble lagt til dagen
 * etter at CONDITION_THRESHOLDS ble kalibrert (7f5d601 → 8cc2ade, 3.–4. august
 * 2026) og gjenbrukte `scoreVerdict` uendret. Men de tersklene er målt på
 * ENKELTRUTER (spenn 43–85, median 55, p95 80), og regionstallet er
 * 90-persentilen OVER ruter — en ordensstatistikk fra den øvre halen av
 * nettopp den fordelingen. En terskel satt ved rutenes p95 lander da et sted
 * rundt p75 blant regionstallene.
 *
 * Utslaget var målbart: kommentaren lovet «topp ~10 %», men 22,5 % av
 * regiondøgnene fikk topp-dommen. Fire områder kunne dele «Nå er det
 * piggsopp 🍄» med 26 poengs spenn mellom seg.
 *
 * MÅLEGRUNNLAG: alle 374 rader i `region_daily_scores`, 22 regioner × 17 dager
 * (2026-08-11 → 2026-08-27), lest 2026-08-27:
 *
 *   min 25 · p05 41 · p10 45 · p25 53 · median 61 · p75 70 · p90 81 · p95 87 · maks 100
 *
 * ⚠️ GRUNNLAGET ER ET SMALT VINDU — sytten dager i slutten av august. Kjør
 * `node --env-file=.env.local scripts/kalibrer-regionterskler.mjs` på nytt når
 * sesongen er over, og flytt tallene under hvis fordelingen har flyttet seg.
 * Samme etterprøving som CONDITION_THRESHOLDS ber om for rutene.
 */
export const REGION_CONDITION_THRESHOLDS = {
  excellent: 81, // p90 — topp 10 % av regiondøgnene
  good: 70, // p75 — topp 25 %
  moderate: 61 // medianen
} as const;

export type RegionCondition = 'poor' | 'moderate' | 'good' | 'excellent';

export function regionScoreToCondition(score: number): RegionCondition {
  if (score >= REGION_CONDITION_THRESHOLDS.excellent) return 'excellent';
  if (score >= REGION_CONDITION_THRESHOLDS.good) return 'good';
  if (score >= REGION_CONDITION_THRESHOLDS.moderate) return 'moderate';
  return 'poor';
}

/**
 * Fargebåndet for et regionstall.
 *
 * Utledes AV dommen, ikke ved siden av den. Fargen kom tidligere fra
 * `forecastBand`, som er kalibrert på 99 176 punkt-dagscorer fra mushroom-day
 * (median 86) — en tredje fordeling bak samme 0-100-etikett. Resultatet var at
 * samme tall kunne få topp-dommen i tekst og gul prikk i farge samtidig.
 */
export function regionBand(score: number): 'green' | 'amber' | 'grey' {
  const condition = regionScoreToCondition(score);
  if (condition === 'excellent') return 'green';
  if (condition === 'poor') return 'grey';
  return 'amber';
}
