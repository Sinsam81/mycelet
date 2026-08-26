import { describe, expect, it } from 'vitest';
import { formatUncertaintyMeters, occurrenceYearCutoff, passesYearCutoff } from '../occurrence-filters';

const NAA = new Date('2026-08-26T12:00:00Z');

describe('occurrenceYearCutoff', () => {
  it('inkluderer inneværende år i vinduet', () => {
    // «Siste 5 år» i 2026 = 2022, 2023, 2024, 2025, 2026.
    expect(occurrenceYearCutoff('last5', NAA)).toBe(2022);
    expect(occurrenceYearCutoff('last10', NAA)).toBe(2017);
    expect(occurrenceYearCutoff('all', NAA)).toBeNull();
  });
});

describe('passesYearCutoff', () => {
  it('slipper alt gjennom uten aktivt filter', () => {
    expect(passesYearCutoff('1803-01-01', null)).toBe(true);
    expect(passesYearCutoff(null, null)).toBe(true);
  });

  it('teller årstallet, også for år-bare-rader (YYYY-01-01)', () => {
    expect(passesYearCutoff('2023-01-01', 2022)).toBe(true);
    expect(passesYearCutoff('2021-09-15', 2022)).toBe(false);
    expect(passesYearCutoff('2022-01-01', 2022)).toBe(true);
  });

  it('ekskluderer udaterte rader når filteret er aktivt — ukjent dato beviser ikke ferskhet', () => {
    expect(passesYearCutoff(null, 2022)).toBe(false);
    expect(passesYearCutoff(undefined, 2022)).toBe(false);
    expect(passesYearCutoff('ukjent', 2022)).toBe(false);
  });
});

describe('formatUncertaintyMeters', () => {
  it('meter under 1000, km over — med norsk desimalkomma', () => {
    expect(formatUncertaintyMeters(120)).toBe('±120 m');
    expect(formatUncertaintyMeters(999.6)).toBe('±1000 m');
    expect(formatUncertaintyMeters(1500)).toBe('±1,5 km');
    expect(formatUncertaintyMeters(25000)).toBe('±25 km');
  });

  it('gir null for manglende eller ugyldige verdier — linja utelates, aldri «±NaN»', () => {
    expect(formatUncertaintyMeters(null)).toBeNull();
    expect(formatUncertaintyMeters(undefined)).toBeNull();
    expect(formatUncertaintyMeters(-5)).toBeNull();
    expect(formatUncertaintyMeters(Number.NaN)).toBeNull();
  });
});
