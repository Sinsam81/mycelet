/**
 * Søylehøydene i 7-dagersstripen på forsiden.
 *
 * Stripen skal svare på ÉN ting: hvilken dag denne uka skal jeg gå? Det er et
 * relativt spørsmål — brukeren sammenligner de sju søylene med hverandre, ikke
 * med en tenkt nasjonal skala.
 *
 * Høyden var `Math.max(10, score)%` av en 48 px-boks, altså en absolutt skala.
 * Det gjør de samme feilen som kartet gjorde: scoren i sesong lever i et smalt
 * bånd høyt oppe, så søylene ble nesten like høye.
 *
 * Målt over aug–okt (ERA5, 14 steder i NO+SE, 2014–2024, n = 14 168 uker):
 * spennet maks−min innenfor ÉN uke har median 17 poeng. På den gamle skalaen ble
 * det 8,2 piksler i en 48 px-boks — under det øyet leser som forskjell.
 * Et virkelig eksempel: Kristiansand med søylene [78, 78, 95, 96, 96, 90, 80]
 * tegnet onsdagens 96 og dagens 78 nesten like høye.
 *
 * Normalisert mot uka blir de 17 poengene hele boksen i stedet, og den beste
 * dagen er synlig den beste.
 *
 * Fargen er FORTSATT absolutt (se colorFor i MushroomDayCard) — den sier om uka
 * er verdt noe i det hele tatt. Høyden sier hvilken dag. Samme arbeidsdeling som
 * på kartet: absolutt for ærlighet, relativ for lesbarhet.
 */

/** Laveste søyle, i prosent av boksen. Aldri 0 — en dag som mangler er ikke det samme som en dårlig dag. */
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
/** Høyden alle søylene får når uka er jevn. */
const FLAT_BAR_PERCENT = 55;

export function forecastBarHeights(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;

  if (spread < MIN_MEANINGFUL_SPREAD) return scores.map(() => FLAT_BAR_PERCENT);

  const span = MAX_BAR_PERCENT - MIN_BAR_PERCENT;
  return scores.map((s) => MIN_BAR_PERCENT + ((s - min) / spread) * span);
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
