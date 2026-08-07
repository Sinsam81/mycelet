import { FORECAST_AMBER_MIN, FORECAST_GREEN_MIN } from './forecast-scale';

/**
 * Søylehøydene i 7-dagersstripene (forsiden og stedsstripen på kartet).
 *
 * Stripen skal svare på ÉN ting: hvilken dag denne uka skal jeg gå? Det er et
 * relativt spørsmål — brukeren sammenligner de sju søylene med hverandre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TO FEIL, I HVER SIN RETNING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FØRST var høyden `Math.max(10, score)%` — helt absolutt. Scoren i sesong
 * lever i et smalt bånd høyt oppe, så alle søylene ble nesten like høye.
 * Målt aug–okt (ERA5, 14 steder NO+SE, 2014–2024, n = 14 168 uker): spennet
 * innenfor ÉN uke har median 17 poeng, som ble 8,2 piksler i en 48 px-boks —
 * under det øyet leser som forskjell.
 *
 * SÅ ble den normalisert mot ukas egen min og maks, med fast bunn på 14 %. Det
 * løste lesbarheten og skapte en verre feil: ukas SVAKESTE dag fikk alltid
 * bunnhøyde, uansett hvor god den var i seg selv.
 *
 * Sett i produksjon 2026-08-07, Oslo: [90, 72, 80, 81, 83, 84, 82].
 * Lørdagens 72 — over 25-persentilen i sesong, altså en helt grei soppdag —
 * ble tegnet som 14 %. Nesten ingenting. Eieren så det og sa: «det virker
 * veldig ulogisk og da ville jeg mistet all tiltro til appen.» Han hadde rett:
 * forsiden sa «Høysesong!» og tegnet samtidig en tom søyle i morgen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LØSNINGEN: BUNNEN ER ABSOLUTT, RESTEN ER RELATIV
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ukas svakeste dag får en høyde som svarer til hvor god den FAKTISK er.
 * Derfra strekkes de andre opp til full boks. Da leser man fortsatt av hvilken
 * dag som er best — men en 72 kan aldri se ut som en 20.
 *
 * Fargen er og blir absolutt (forecast-scale.ts). Arbeidsdelingen er nå:
 * fargen sier om uka er verdt noe, bunnhøyden sier hvor dårlig verste dag er,
 * og forskjellen mellom søylene sier hvilken dag du skal gå.
 */

/** Absolutt gulv. Aldri 0 — en dag som mangler er ikke det samme som en dårlig dag. */
const MIN_BAR_PERCENT = 14;
/** Høyeste søyle. */
const MAX_BAR_PERCENT = 100;
/**
 * Under dette spennet regner vi uka som jevn og lar søylene stå like høye i
 * stedet for å blåse opp støy til fjell. En dag som er 2 poeng bedre enn resten
 * er ikke «dagen å dra ut» — å tegne den dobbelt så høy ville vært en påstand
 * modellen ikke bærer.
 */
const MIN_MEANINGFUL_SPREAD = 6;

/**
 * Hvor høy en søyle skal være ut fra scoren ALENE, uten hensyn til uka rundt.
 *
 * Knekkpunktene er de samme som fargen bruker, slik at de to ikke kan gli fra
 * hverandre: under 55 er dagen reelt svak (p05 i sesongfordelingen), fra 85 er
 * den god (rundt medianen på 86).
 *
 * Taket her er 78 og ikke 100 med vilje — selv en toppdag skal ha rom over seg
 * når den strekkes opp mot ukas beste.
 */
const WEAK_BAR_PERCENT = 34; // ved FORECAST_AMBER_MIN
const GOOD_BAR_PERCENT = 62; // ved FORECAST_GREEN_MIN
const BEST_BAR_PERCENT = 78; // ved 100

export function absoluteBarHeight(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  if (s <= FORECAST_AMBER_MIN) {
    return MIN_BAR_PERCENT + (s / FORECAST_AMBER_MIN) * (WEAK_BAR_PERCENT - MIN_BAR_PERCENT);
  }
  if (s <= FORECAST_GREEN_MIN) {
    const t = (s - FORECAST_AMBER_MIN) / (FORECAST_GREEN_MIN - FORECAST_AMBER_MIN);
    return WEAK_BAR_PERCENT + t * (GOOD_BAR_PERCENT - WEAK_BAR_PERCENT);
  }
  const t = (s - FORECAST_GREEN_MIN) / (100 - FORECAST_GREEN_MIN);
  return GOOD_BAR_PERCENT + t * (BEST_BAR_PERCENT - GOOD_BAR_PERCENT);
}

export function forecastBarHeights(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;

  // Jevn uke: ingen dag er «dagen». Alle får høyden sin absolutte kvalitet
  // tilsier — en jevnt elendig uke skal se lav ut, en jevnt god uke høy.
  if (spread < MIN_MEANINGFUL_SPREAD) {
    const snitt = scores.reduce((a, b) => a + b, 0) / scores.length;
    const h = absoluteBarHeight(snitt);
    return scores.map(() => h);
  }

  // Bunnen forankres i hvor god ukas svakeste dag faktisk er; derfra strekkes
  // resten opp til full boks slik at den beste dagen er synlig best.
  const floor = absoluteBarHeight(min);
  const span = MAX_BAR_PERCENT - floor;
  return scores.map((s) => floor + ((s - min) / spread) * span);
}

/**
 * Er uka jevn nok til at det ikke finnes en «beste dag» å peke på?
 *
 * Brukes til å la være å utheve en vinner når det ikke er en. Målt: 62,8 % av
 * ukene i sesong har flere dager som deler maksverdien.
 */
export function isFlatWeek(scores: number[]): boolean {
  if (scores.length === 0) return true;
  return Math.max(...scores) - Math.min(...scores) < MIN_MEANINGFUL_SPREAD;
}
