import { describe, expect, it } from 'vitest';
import { CONDITION_COLORS, colorForScore } from '../condition-colors';
import { scoreToCondition } from '../prediction';

describe('one colour scale, keyed to one condition ladder', () => {
  it('never paints a worse score greener than a better one', () => {
    // The old getHeatColor was a temperature ramp: dark red at 80+, lime below
    // 40. On a map where green pills mean "go here" that inverted the meaning.
    const rank = { poor: 0, moderate: 1, good: 2, excellent: 3 } as const;
    for (let score = 0; score <= 100; score += 1) {
      const here = rank[scoreToCondition(score)];
      const above = rank[scoreToCondition(Math.min(100, score + 1))];
      expect(above).toBeGreaterThanOrEqual(here);
    }
  });

  it('agrees with scoreToCondition at every boundary', () => {
    for (const score of [0, 34, 35, 54, 55, 74, 75, 100]) {
      expect(colorForScore(score)).toBe(CONDITION_COLORS[scoreToCondition(score)]);
    }
  });

  it('gives every band a readable foreground', () => {
    for (const band of Object.values(CONDITION_COLORS)) {
      expect(band.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(band.ink).toMatch(/^#[0-9A-F]{6}$/i);
      expect(band.ink).not.toBe(band.hex);
    }
  });
});
