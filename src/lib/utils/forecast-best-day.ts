export interface BestDayPick {
  /** Indeks til dagen med høyest score, eller null når ingen dag skiller seg ut. */
  index: number | null;
  /** Alle indeksene som deler toppscoren. */
  tiedIndexes: number[];
  /** Toppscoren, eller null for en tom liste. */
  score: number | null;
}

/**
 * Hvilken dag i uka er best — og er det i det hele tatt en?
 *
 * Den gamle regelen var `days.reduce((top, d, i) => d.score > days[top].score ? i : top, 0)`.
 * Streng `>` betyr at uavgjort alltid faller på indeks 0, altså «i dag». På en
 * flat uke — Bergen 1. august hadde [100,100,100,100,100,100,100] — skrev stripa
 * «Best I dag: 100/100», som er en påstand om hvilken dag som er best på en uke
 * der ingen dag skiller seg ut. Brukeren planlegger turen etter et artefakt av
 * sorteringsregelen.
 *
 * Her returneres derfor uavgjort som uavgjort, så UI-et kan si «jevnt hele uka»
 * i stedet for å peke på en tilfeldig dag.
 */
export function pickBestForecastDay(days: readonly { score: number }[]): BestDayPick {
  if (days.length === 0) return { index: null, tiedIndexes: [], score: null };

  const top = days.reduce((max, day) => (day.score > max ? day.score : max), days[0].score);
  const tiedIndexes = days.reduce<number[]>((acc, day, index) => {
    if (day.score === top) acc.push(index);
    return acc;
  }, []);

  return {
    index: tiedIndexes.length === 1 ? tiedIndexes[0] : null,
    tiedIndexes,
    score: top
  };
}
