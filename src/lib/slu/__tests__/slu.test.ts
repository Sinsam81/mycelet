import { describe, expect, it } from 'vitest';
import { getSwedishForestProperties, isWithinSweden } from '../skogskarta';

describe('isWithinSweden', () => {
  it('returns true for Stockholm', () => {
    expect(isWithinSweden({ lat: 59.33, lon: 18.07 })).toBe(true);
  });

  it('returns false for Oslo', () => {
    expect(isWithinSweden({ lat: 59.9, lon: 10.75 })).toBe(false);
  });
});

describe('getSwedishForestProperties (stub)', () => {
  it('returns null until SLU Forest Map is wired', async () => {
    expect(await getSwedishForestProperties({ lat: 59.33, lon: 18.07 })).toBeNull();
  });
});
