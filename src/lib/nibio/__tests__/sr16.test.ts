import { describe, expect, it } from 'vitest';
import { isWithinNorway, getForestProperties } from '../sr16';

describe('isWithinNorway', () => {
  it('returns true for Oslo', () => {
    expect(isWithinNorway({ lat: 59.9, lon: 10.75 })).toBe(true);
  });

  it('returns true for Tromsø', () => {
    expect(isWithinNorway({ lat: 69.65, lon: 18.95 })).toBe(true);
  });

  it('returns false for Stockholm', () => {
    expect(isWithinNorway({ lat: 59.33, lon: 18.07 })).toBe(false);
  });

  it('returns false for Copenhagen', () => {
    expect(isWithinNorway({ lat: 55.68, lon: 12.57 })).toBe(false);
  });

  it('returns false for far-north Svalbard', () => {
    expect(isWithinNorway({ lat: 78.2, lon: 15.6 })).toBe(false);
  });
});

describe('getForestProperties (stub)', () => {
  it('returns null for Norwegian coordinates while stub is in place', async () => {
    const result = await getForestProperties({ lat: 59.9, lon: 10.75 });
    expect(result).toBeNull();
  });

  it('returns null for non-Norwegian coordinates', async () => {
    const result = await getForestProperties({ lat: 59.33, lon: 18.07 });
    expect(result).toBeNull();
  });
});
