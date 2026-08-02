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

/**
 * Hvor sterkt hver bøtte males på kartet.
 *
 * Alle fire lå på flate 0,13. Den verdien ble valgt ved å se på ETT lag med
 * omtrent én farge — den gang tersklene var ukalibrerte og 71 % av rasteret
 * havnet i samme bøtte, så det fantes i praksis ikke fire farger å skille.
 *
 * Etter kalibreringen (se CONDITION_THRESHOLDS) er fordelingen reell, og da
 * holder ikke flat dekkevne: fire farger på 0,13 over et detaljert topokart er
 * fortsatt fire nesten usynlige farger. Målt på prøvekartet mot ekte fliser i
 * Oslofjord-utsnittet var «før» og «etter» ikke til å skille fra hverandre med
 * øyet, selv om klassifiseringen hadde endret seg fra 0/88/10/2 % til
 * 47/42/7/4 %.
 *
 * Graderingen løser det: svake ruter trekker seg tilbake mot bakgrunnskartet, og
 * de gode blir det man ser først. Det er hele poenget med laget — å vise hvor det
 * er verdt å lete, ikke å farge alt likt.
 *
 * De svake TEGNES fortsatt (0,05), slik at de kan trykkes på og har tooltip. Å
 * utelate dem ville gjort dem uleselige for brukeren som lurer på «hva med her?».
 */
export const CONDITION_FILL_OPACITY: Record<ConditionKey, number> = {
  poor: 0.05,
  moderate: 0.15,
  good: 0.38,
  excellent: 0.52
};

export function colorForScore(score: number) {
  return CONDITION_COLORS[scoreToCondition(score)];
}

/** Dekkevnen for en score — se CONDITION_FILL_OPACITY. */
export function fillOpacityForScore(score: number): number {
  return CONDITION_FILL_OPACITY[scoreToCondition(score)];
}
