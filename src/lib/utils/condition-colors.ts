import { scoreToCondition } from '@/lib/utils/prediction';

/**
 * One colour table for everything on the map that is coloured by score.
 *
 * Before this existed the map used two contradictory scales at once. The pills
 * and rings ran green-for-good, while `getHeatColor` ran dark red at 80+ and
 * lime green below 40 — a heat ramp, borrowed from temperature maps, where the
 * hottest colour means the highest value. On a mushroom map that reads as
 * "green = go here", so the best ground was painted with the colour users take
 * to mean "nothing here", right next to green pills meaning the opposite.
 *
 * Keyed to the same buckets as scoreToCondition, so a green pin, a green ring
 * and a green circle always mean the same thing.
 *
 * `hex` is for Leaflet, which cannot take Tailwind classes. `dot` and `text` are
 * for React. `ink` is the readable foreground on top of `hex`.
 */
export const CONDITION_COLORS = {
  poor: { hex: '#9CA3AF', dot: 'bg-gray-400', text: 'text-gray-700', ink: '#1F2937' },
  moderate: { hex: '#FBBF24', dot: 'bg-amber-400', text: 'text-amber-700', ink: '#1F2937' },
  good: { hex: '#5E9440', dot: 'bg-forest-500', text: 'text-forest-800', ink: '#FFFFFF' },
  excellent: { hex: '#4A7C2E', dot: 'bg-forest-600', text: 'text-forest-900', ink: '#FFFFFF' }
} as const;

export type ConditionKey = keyof typeof CONDITION_COLORS;

export function colorForScore(score: number) {
  return CONDITION_COLORS[scoreToCondition(score)];
}

/** Dekkevnen den svakest scorende ruta i utsnittet tegnes med. Aldri 0 — se under. */
const MIN_FILL_OPACITY = 0.12;
/** Dekkevnen den best scorende ruta i utsnittet tegnes med. */
const MAX_FILL_OPACITY = 0.55;
/** Brukes når alle rutene i utsnittet har samme score, og det ikke finnes noe å gradere. */
const FLAT_FILL_OPACITY = 0.22;

/**
 * FARGEN ER ABSOLUTT, DEKKEVNEN ER RELATIV TIL UTSNITTET.
 *
 * To forsøk før dette bommet, begge fordi de brukte samme absolutte skala til
 * begge deler:
 *
 *  1. Flate 0,13 for alt. Ingen kontrast i det hele tatt.
 *  2. Fast dekkevne per bøtte (0,05/0,15/0,38/0,52). Verre: dekkevnen ble slått
 *     opp med scoreToCondition, altså NØYAKTIG SAMME fire bøtter som fargen.
 *     Er fargen konstant, er dekkevnen konstant — den andre kanalen kan per
 *     konstruksjon ikke gi oppløsning der den første mangler den.
 *
 * Og fargen ER konstant, fordi bøttene er bredere enn variasjonen på én skjerm.
 * Målt mot ekte fliser 2026-08-02, med den kollapsen kartet faktisk tegner
 * (beste art per rute, top-80): score-spennet INNE i ett utsnitt har median
 * 7 poeng, mens den smaleste bøtta er 10 poeng bred. Følgen er at 68 % av
 * dagens utsnitt er ensfargede ved standard zoom, og 85 % ved den zoomen kartet
 * lander på etter posisjonsbestemmelse — altså mobilbruk. All variasjonen ligger
 * MELLOM dager og regioner, som brukeren aldri ser side om side.
 *
 * Forsøk 2 hadde i tillegg en egen feil: med terskel 50 er 78 % av de tegnede
 * rutene «poor», og de ble malt på 0,05. I 64 % av utsnittene var HVER rute
 * poor, så hele laget forsvant — fra «alt ser likt ut» til «det er ingenting
 * der». (Kommentaren her påsto 47/42/7/4 %; det var målt på alle artsrader, ikke
 * på beste-art-per-rute som kartet tegner. Riktig er 78/15/5/2 %.)
 *
 * Derfor: normaliser mot rutene som faktisk er på skjermen. Da finnes det alltid
 * kontrast å se, uansett hvor smalt spennet er — og ingenting forsvinner, fordi
 * bunnen er 0,12 og ikke 0.
 *
 * Ærligheten ligger i FARGEN, som fortsatt er absolutt: et utsnitt der alt er
 * svakt blir helgrått med de minst dårlige rutene tydeligst. Vi sier ikke at de
 * er gode — dommen over ruta sier «Lite kantarell i skogen nå» — vi sier bare
 * hvilke av dem som er minst dårlige. Det er en rangering, ikke en spådom, og
 * det er den eneste romlige påstanden valideringen bærer (AUC ~0,52).
 */
export function fillOpacitiesForScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => FLAT_FILL_OPACITY);
  const span = MAX_FILL_OPACITY - MIN_FILL_OPACITY;
  return scores.map((s) => MIN_FILL_OPACITY + ((s - min) / (max - min)) * span);
}

/**
 * Dekkevnen for ÉN score, uten et utsnitt å måle mot. Brukes av kodeveier som
 * tegner et enkelt punkt (reservesirkelen), der det ikke finnes noe sett å
 * normalisere i. Kartlaget skal bruke fillOpacitiesForScores i stedet — en
 * absolutt skala per rute var nettopp feilen som gjorde laget usynlig.
 */
export function fillOpacityForScore(score: number): number {
  const condition = scoreToCondition(score);
  if (condition === 'excellent') return MAX_FILL_OPACITY;
  if (condition === 'good') return 0.4;
  if (condition === 'moderate') return 0.26;
  return MIN_FILL_OPACITY;
}
