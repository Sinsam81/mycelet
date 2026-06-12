import { describe, expect, it } from 'vitest';
import { assessFlush } from '@/lib/prediction/flush';
import type { DailyForecast } from '@/lib/weather/forecast';

function fc(precipPerDay: number[], tempC = 12): DailyForecast[] {
  return precipPerDay.map((precipMm, i) => ({
    date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    tempC,
    precipMm,
    humidityPct: 80
  }));
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
