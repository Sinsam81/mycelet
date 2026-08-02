import { describe, expect, it } from 'vitest';
import { computeTileDataCoverage } from '../tile-data-coverage';

const NORWAY_FULL = {
  forestSource: 'sr16' as const,
  productivity: 17,
  volumePerHa: 210,
  soilMoistureIndex: 0.62,
  precipDailyMm: [0, 2, 5, 1, 0, 0, 8]
};

const SWEDEN_TYPICAL = {
  forestSource: 'corine' as const,
  productivity: null,
  volumePerHa: null,
  soilMoistureIndex: 0.41,
  precipDailyMm: [1, 0, 3, 0, 0, 4, 2]
};

describe('computeTileDataCoverage', () => {
  it('gir full dekning når alle kildene svarte', () => {
    expect(computeTileDataCoverage(NORWAY_FULL)).toBe(100);
  });

  it('skiller en svensk CORINE-celle fra en norsk SR16-celle', () => {
    // Selve poenget med tallet: det skal VARIERE med datagrunnlaget.
    // Den gamle literalen 70 kunne aldri vise denne forskjellen.
    const sweden = computeTileDataCoverage(SWEDEN_TYPICAL);
    const norway = computeTileDataCoverage(NORWAY_FULL);
    expect(sweden).toBeLessThan(norway);
    expect(sweden).toBe(65);
  });

  it('trekker fra når SR16 mangler bonitet og volum for cellen', () => {
    const thin = computeTileDataCoverage({ ...NORWAY_FULL, productivity: null, volumePerHa: null });
    expect(thin).toBe(85);
  });

  it('trekker fra når værkilden ikke har daglig historikk', () => {
    // OpenWeather: ingen jordfuktighet, ingen dagsserie.
    const noHistory = computeTileDataCoverage({
      ...NORWAY_FULL,
      soilMoistureIndex: null,
      precipDailyMm: null
    });
    expect(noHistory).toBe(60);
  });

  it('gir 0 når ingen kilde svarte', () => {
    expect(
      computeTileDataCoverage({
        forestSource: 'fallback',
        productivity: null,
        volumePerHa: null,
        soilMoistureIndex: null,
        precipDailyMm: null
      })
    ).toBe(0);
  });

  it('teller ikke en tom nedbørserie som historikk', () => {
    const empty = computeTileDataCoverage({ ...NORWAY_FULL, precipDailyMm: [] });
    expect(empty).toBe(85);
  });

  it('holder seg i [0, 100]', () => {
    const value = computeTileDataCoverage(NORWAY_FULL);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});
