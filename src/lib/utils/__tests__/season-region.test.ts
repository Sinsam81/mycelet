import { describe, expect, it } from 'vitest';
import { seasonShiftDays, isInSeasonOn, shiftLabel } from '@/lib/utils/season-region';

describe('seasonShiftDays', () => {
  it('is 0 at the baseline (~60°N)', () => {
    expect(seasonShiftDays(60)).toBe(0);
  });
  it('shifts later the further north, capped', () => {
    expect(seasonShiftDays(65)).toBe(20);
    expect(seasonShiftDays(69)).toBe(35); // capped
    expect(seasonShiftDays(75)).toBe(35);
  });
  it('shifts a little earlier in the far south, floored', () => {
    expect(seasonShiftDays(58)).toBe(-8);
    expect(seasonShiftDays(40)).toBe(-14); // floored
  });
  it('is neutral when latitude is missing', () => {
    expect(seasonShiftDays(null)).toBe(0);
    expect(seasonShiftDays(undefined)).toBe(0);
    expect(seasonShiftDays(NaN)).toBe(0);
  });
});

describe('isInSeasonOn', () => {
  it('matches a normal season at the baseline', () => {
    expect(isInSeasonOn(new Date(2026, 6, 15), 7, 9, 0)).toBe(true); // mid-July
    expect(isInSeasonOn(new Date(2026, 5, 15), 7, 9, 0)).toBe(false); // mid-June
  });

  it('pushes the season start later in the north', () => {
    // Jul-Sep, +20 days (~65°N): early July is NOT yet in season up north…
    expect(isInSeasonOn(new Date(2026, 6, 5), 7, 9, 20)).toBe(false);
    // …but late July is.
    expect(isInSeasonOn(new Date(2026, 6, 28), 7, 9, 20)).toBe(true);
  });

  it('handles a year-end wrap season', () => {
    expect(isInSeasonOn(new Date(2026, 0, 15), 11, 2, 0)).toBe(true); // January
    expect(isInSeasonOn(new Date(2026, 5, 15), 11, 2, 0)).toBe(false); // June
  });
});

describe('shiftLabel', () => {
  it('labels a northward shift in weeks', () => {
    expect(shiftLabel(20)).toContain('3 uker senere');
    expect(shiftLabel(7)).toContain('1 uke senere');
  });
  it('is empty when negligible or southward', () => {
    expect(shiftLabel(0)).toBe('');
    expect(shiftLabel(-8)).toBe('');
  });
});
