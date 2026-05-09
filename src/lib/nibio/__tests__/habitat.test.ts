import { describe, expect, it } from 'vitest';
import { computeHabitatScore, fallbackProperties } from '../index';
import type { ForestProperties, SpeciesHabitatPreferences } from '../types';

const KANTARELL_PREFS: SpeciesHabitatPreferences = {
  preferredPartners: ['gran', 'furu', 'bjork', 'eik'],
  habitat: ['barskog', 'blandingsskog', 'mose'],
  preferredAgeYearsMin: 40
};

const PIGGSOPP_PREFS: SpeciesHabitatPreferences = {
  preferredPartners: ['gran', 'eik'],
  habitat: ['granskog', 'blandingsskog', 'kalkrik'],
  preferredAgeYearsMin: 50
};

function forest(overrides: Partial<ForestProperties> = {}): ForestProperties {
  return {
    forestType: 'gran',
    ageYears: 80,
    productivity: 15,
    volumePerHa: 200,
    source: 'sr16',
    ...overrides
  };
}

describe('computeHabitatScore', () => {
  it('returns neutral score when forest data is missing', () => {
    const result = computeHabitatScore(null, KANTARELL_PREFS);
    expect(result.score).toBe(0.5);
    expect(result.reasons[0]).toMatch(/ingen NIBIO-data/i);
  });

  it('returns neutral score for fallback-sourced data', () => {
    const result = computeHabitatScore(fallbackProperties(), KANTARELL_PREFS);
    expect(result.score).toBe(0.5);
  });

  it('rewards matching tree species + age window for kantarell in old gran', () => {
    const result = computeHabitatScore(
      forest({ forestType: 'gran', ageYears: 80 }),
      KANTARELL_PREFS
    );
    // Base 0.5 + 0.4 (tree match) + 0.15 (age window) = 1.05
    expect(result.score).toBeCloseTo(1.05, 2);
    expect(result.reasons.some((r) => r.toLowerCase().includes('treslag'))).toBe(true);
    expect(result.reasons.some((r) => r.toLowerCase().includes('bestandsalder'))).toBe(true);
  });

  it('penalizes apent landskap for forest-loving species', () => {
    const result = computeHabitatScore(
      forest({ forestType: 'apent', ageYears: null }),
      KANTARELL_PREFS
    );
    expect(result.score).toBeLessThan(0.5);
    expect(result.reasons.some((r) => r.toLowerCase().includes('åpent'))).toBe(true);
  });

  it('gives partial credit to mixed forest', () => {
    const result = computeHabitatScore(
      forest({ forestType: 'blandet', ageYears: 80 }),
      KANTARELL_PREFS
    );
    // Base 0.5 + 0.2 (blandet) + 0.15 (age window) = 0.85
    expect(result.score).toBeCloseTo(0.85, 2);
  });

  it('rewards high productivity for kalkrik-loving species (piggsopp)', () => {
    const result = computeHabitatScore(
      forest({ forestType: 'gran', ageYears: 80, productivity: 18 }),
      PIGGSOPP_PREFS
    );
    // Base 0.5 + 0.4 (gran match) + 0.15 (age) + 0.1 (kalkrik bonus) = 1.15
    expect(result.score).toBeCloseTo(1.15, 2);
    expect(result.reasons.some((r) => r.toLowerCase().includes('bonitet'))).toBe(true);
  });

  it('does not give kalkrik bonus to species that do not want it', () => {
    const result = computeHabitatScore(
      forest({ forestType: 'gran', ageYears: 80, productivity: 18 }),
      KANTARELL_PREFS
    );
    // Kantarell prefs don't have 'kalkrik' tag — no productivity bonus.
    expect(result.score).toBeCloseTo(1.05, 2);
    expect(result.reasons.some((r) => r.toLowerCase().includes('bonitet'))).toBe(false);
  });

  it('penalizes too-young stand for species with min-age preference', () => {
    const result = computeHabitatScore(
      forest({ forestType: 'gran', ageYears: 15 }),
      KANTARELL_PREFS
    );
    // Base 0.5 + 0.4 (gran) - 0.1 (too young) = 0.8
    expect(result.score).toBeCloseTo(0.8, 2);
    expect(result.reasons.some((r) => r.toLowerCase().includes('ungt'))).toBe(true);
  });

  it('clamps very poor matches to 0.2 floor', () => {
    const veryNegativePrefs: SpeciesHabitatPreferences = {
      preferredPartners: ['eik'],
      habitat: ['lauvskog'],
      preferredAgeYearsMin: 100
    };
    const result = computeHabitatScore(
      forest({ forestType: 'apent', ageYears: 5 }),
      veryNegativePrefs
    );
    expect(result.score).toBeGreaterThanOrEqual(0.2);
  });

  it('clamps very strong matches to 1.3 ceiling', () => {
    // Hypothetical species that loves everything about a perfect cell.
    const idealPrefs: SpeciesHabitatPreferences = {
      preferredPartners: ['gran'],
      habitat: ['kalkrik', 'næringsrik'],
      preferredAgeYearsMin: 50
    };
    const result = computeHabitatScore(
      forest({ forestType: 'gran', ageYears: 100, productivity: 22 }),
      idealPrefs
    );
    expect(result.score).toBeLessThanOrEqual(1.3);
  });
});
