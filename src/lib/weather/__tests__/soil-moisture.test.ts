import { describe, expect, it } from 'vitest';
import { computeSoilMoistureIndex, evapotranspirationMmPerDay, SOIL_CAPACITY_MM } from '@/lib/weather/soil-moisture';

describe('evapotranspirationMmPerDay', () => {
  it('is zero at/below freezing and rises with temperature', () => {
    expect(evapotranspirationMmPerDay(-2)).toBe(0);
    expect(evapotranspirationMmPerDay(0)).toBe(0);
    expect(evapotranspirationMmPerDay(15)).toBeCloseTo(2.7, 1);
  });

  it('caps at 5 mm/day for very hot days', () => {
    expect(evapotranspirationMmPerDay(40)).toBe(5);
  });
});

describe('computeSoilMoistureIndex', () => {
  it('returns null for an empty series', () => {
    expect(computeSoilMoistureIndex([], 15)).toBeNull();
  });

  it('rises toward saturation after sustained rain', () => {
    const wet = computeSoilMoistureIndex(Array(14).fill(8), 12)!; // 8mm/day for 2 weeks
    expect(wet).toBeGreaterThan(0.9);
  });

  it('decays through a dry warm spell — the key advantage over a raw rain sum', () => {
    // One big soak 14 days ago, then nothing, with warm (drying) temps.
    const series = [40, ...Array(13).fill(0)];
    const dried = computeSoilMoistureIndex(series, 18)!;
    expect(dried).toBeLessThan(0.3); // a raw 14-day SUM would still read 40mm "wet"
  });

  it('stays in [0,1]', () => {
    const v = computeSoilMoistureIndex(Array(30).fill(20), 10)!;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('a recent soak reads wetter than the same rain long ago', () => {
    const recentSoak = computeSoilMoistureIndex([...Array(13).fill(0), 30], 15)!;
    const oldSoak = computeSoilMoistureIndex([30, ...Array(13).fill(0)], 15)!;
    expect(recentSoak).toBeGreaterThan(oldSoak);
  });
});
