import { describe, expect, it } from 'vitest';
import { assessFlush } from '@/lib/prediction/flush';
import { dayOfYearFromMonth, phenologyFactor } from '@/lib/prediction/phenology';
import { PHENOLOGY } from '@/lib/prediction/phenology-data';
import type { DailyForecast } from '@/lib/weather/forecast';

function fc(precipPerDay: number[], tempC = 12): DailyForecast[] {
  return precipPerDay.map((precipMm, i) => ({
    date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    tempC,
    precipMm,
    humidityPct: 80
  }));
}

// Data-robust species pickers: scan the generated curves for a species that is
// in / out of its fruiting window at a given month + latitude, instead of
// hardcoding ids that could shift when phenology-data is regenerated.
const TEST_LAT = 60; // southern band
function findSpeciesId(month: number, predicate: (factor: number) => boolean): number | null {
  const doy = dayOfYearFromMonth(month);
  for (const key of Object.keys(PHENOLOGY)) {
    const id = Number(key);
    const f = phenologyFactor(id, TEST_LAT, doy);
    if (f != null && predicate(f)) return id;
  }
  return null;
}

describe('assessFlush', () => {
  it('is dormant out of season', () => {
    const r = assessFlush({ month: 1, soilMoistureIndex: 0.9, rain7dMm: 30, currentTempC: 10, forecast: [] });
    expect(r.status).toBe('dormant');
  });

  it('is dormant in a freeze even in season', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.9, rain7dMm: 30, currentTempC: -1, forecast: [] });
    expect(r.status).toBe('dormant');
  });

  it('says fruiting now when soil is wet and temps mild', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.7, rain7dMm: 20, currentTempC: 13, forecast: [] });
    expect(r.status).toBe('fruiting');
    expect(r.daysUntil).toBe(0);
  });

  it('says building when it rained recently but ground is drying', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.4, rain7dMm: 18, currentTempC: 13, forecast: fc([0, 0, 0]) });
    expect(r.status).toBe('building');
    expect(r.daysUntil).toBeGreaterThan(0);
  });

  it('projects a flush from forecast rain when currently dry', () => {
    // dry now, but a soak arrives on forecast day 2
    const r = assessFlush({
      month: 9,
      soilMoistureIndex: 0.2,
      rain7dMm: 2,
      currentTempC: 12,
      forecast: fc([1, 10, 0, 0])
    });
    expect(r.status).toBe('soon');
    expect(r.daysUntil).toBeGreaterThan(2); // rain day + lag
  });

  it('says dry when there is no moisture and nothing coming', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: 0.15, rain7dMm: 1, currentTempC: 14, forecast: fc([0, 0, 1]) });
    expect(r.status).toBe('dry');
    expect(r.daysUntil).toBeNull();
  });

  it('falls back to a rain proxy when soil index is unavailable', () => {
    const r = assessFlush({ month: 9, soilMoistureIndex: null, rain7dMm: 24, currentTempC: 12, forecast: [] });
    expect(r.status).toBe('fruiting'); // rain7d/25 ≈ 0.96 → wet
  });
});

describe('assessFlush — species-aware flush lag', () => {
  // Dry now, but a soak (≥8 mm cumulative) lands on forecast day 2. Both species
  // therefore project a 'soon' flush; only the genus lag should differ.
  const dryWithRainComing = {
    month: 9,
    soilMoistureIndex: 0.2,
    rain7dMm: 2,
    currentTempC: 14,
    forecast: fc([1, 10, 0, 0])
  };

  it('projects a shorter lag for Boletus than for Cantharellus on the same forecast', () => {
    const boletus = assessFlush(dryWithRainComing, { genus: 'Boletus' });
    const cantharellus = assessFlush(dryWithRainComing, { genus: 'Cantharellus' });

    expect(boletus.status).toBe('soon');
    expect(cantharellus.status).toBe('soon');
    // Boletes flush fast (~5 d), chanterelles are slow responders (~13 d).
    expect(boletus.daysUntil).toBeLessThan(cantharellus.daysUntil!);
  });

  it('matches the no-arg projection for an unknown genus (backwards compatible)', () => {
    const generic = assessFlush(dryWithRainComing);
    const unknown = assessFlush(dryWithRainComing, { genus: 'Nonexistentus' });
    expect(unknown.daysUntil).toBe(generic.daysUntil);
  });
});

describe('assessFlush — per-species phenology gate', () => {
  // Identical, genuinely good weather: wet soil + mild temps, well inside the
  // generic September season. Only the species' own phenology should decide
  // whether it reads as fruiting or dormant.
  const goodWeather = { month: 9, soilMoistureIndex: 0.7, rain7dMm: 20, currentTempC: 13, forecast: [] };

  const inSeasonId = findSpeciesId(9, (f) => f > 0.6); // peak-ish in September
  const outOfSeasonId = findSpeciesId(9, (f) => f < 0.05); // e.g. a spring/early-summer species

  it('a generically-good day is fruiting for an in-season species', () => {
    expect(inSeasonId).not.toBeNull();
    const r = assessFlush(goodWeather, { genus: 'Cantharellus', speciesId: inSeasonId!, lat: TEST_LAT });
    expect(r.status).toBe('fruiting');
    expect(r.daysUntil).toBe(0);
  });

  it('the same day is dormant for a species out of its own season', () => {
    expect(outOfSeasonId).not.toBeNull();
    const r = assessFlush(goodWeather, { genus: 'Morchella', speciesId: outOfSeasonId!, lat: TEST_LAT });
    expect(r.status).toBe('dormant');
    expect(r.daysUntil).toBeNull();
  });

  it('skips the gate when no phenology curve exists (keeps generic behaviour)', () => {
    const r = assessFlush(goodWeather, { genus: 'Cantharellus', speciesId: 999999, lat: TEST_LAT });
    expect(r.status).toBe('fruiting');
  });
});
