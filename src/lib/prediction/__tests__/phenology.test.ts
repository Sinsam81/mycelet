import { describe, expect, it } from 'vitest';
import { dayOfYearFromMonth, dayOfYearOf, phenologyFactor } from '@/lib/prediction/phenology';
import { PHENOLOGY } from '@/lib/prediction/phenology-data';
import { computeSpeciesAdjustment, type SpeciesContext } from '@/lib/utils/species-scoring';

// A species id that exists in the generated curves (most-observed species are
// always present). Falls back to the first key so the test is data-robust.
const KNOWN_ID = PHENOLOGY['1'] ? 1 : Number(Object.keys(PHENOLOGY)[0]);

describe('phenologyFactor', () => {
  it('returns null for an unknown species (caller keeps month logic)', () => {
    expect(phenologyFactor(999999, 60, 250)).toBeNull();
    expect(phenologyFactor(null, 60, 250)).toBeNull();
    expect(phenologyFactor(undefined, 60, 250)).toBeNull();
  });

  it('returns a normalized weight in [0,1] for a known species', () => {
    const v = phenologyFactor(KNOWN_ID, 60, 250); // early September, southern lat
    expect(v).not.toBeNull();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('peaks near 1.0 somewhere in the year for a known species', () => {
    let max = 0;
    for (let doy = 1; doy <= 365; doy += 7) {
      const v = phenologyFactor(KNOWN_ID, 60, doy) ?? 0;
      if (v > max) max = v;
    }
    expect(max).toBeCloseTo(1, 1); // curves are normalized so peak week = 1.0
  });

  it('is ~zero deep in winter for autumn species (fruiting-window filter)', () => {
    // mid-January, day ~15 — outside the Nordic fruiting window
    const v = phenologyFactor(KNOWN_ID, 60, 15) ?? 0;
    expect(v).toBeLessThan(0.2);
  });
});

describe('day-of-year helpers', () => {
  it('dayOfYearFromMonth lands mid-month', () => {
    expect(dayOfYearFromMonth(1)).toBe(15);
    expect(dayOfYearFromMonth(7)).toBe(181 + 15);
  });

  it('dayOfYearOf matches known dates', () => {
    expect(dayOfYearOf(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(dayOfYearOf(new Date(Date.UTC(2026, 11, 31)))).toBe(365);
  });
});

describe('computeSpeciesAdjustment with empirical seasonality', () => {
  const species: SpeciesContext = {
    speciesId: KNOWN_ID,
    latinName: 'Cantharellus cibarius',
    genus: 'Cantharellus',
    seasonStart: 7,
    seasonEnd: 10,
    peakSeasonStart: 8,
    peakSeasonEnd: 9
  };
  const goodWeather = { temperature: 16, humidity: 85, rain3dMm: 10 };

  it('collapses off-season (seasonality 0) regardless of weather', () => {
    const m = computeSpeciesAdjustment(species, goodWeather, 8, 0);
    expect(m).toBeLessThan(0.1);
  });

  it('reaches the top of the range at peak week with optimal weather', () => {
    const m = computeSpeciesAdjustment(species, goodWeather, 8, 1);
    expect(m).toBeGreaterThan(1.2);
    expect(m).toBeLessThanOrEqual(1.3);
  });

  it('a peak week never fully collapses on mediocre weather', () => {
    const poorWeather = { temperature: 16, humidity: 55, rain3dMm: 0 };
    const m = computeSpeciesAdjustment(species, poorWeather, 8, 1);
    expect(m).toBeGreaterThan(0.4); // season holds the floor up
  });

  it('falls back to month logic when seasonality is null', () => {
    // null → legacy path: out-of-month gate returns 0.05
    const outOfSeason = computeSpeciesAdjustment(species, goodWeather, 2, null);
    expect(outOfSeason).toBeCloseTo(0.05, 2);
    // in-season month with good weather lifts above baseline
    const inSeason = computeSpeciesAdjustment(species, goodWeather, 8, null);
    expect(inSeason).toBeGreaterThan(0.5);
  });
});
