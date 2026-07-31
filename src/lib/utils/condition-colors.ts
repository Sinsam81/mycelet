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
