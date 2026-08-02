import { describe, expect, it } from 'vitest';
import {
  advanceSoilMoistureIndex,
  computeSoilMoistureIndex,
  evapotranspirationMmPerDay,
  SOIL_CAPACITY_MM
} from '@/lib/weather/soil-moisture';

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

describe('advanceSoilMoistureIndex', () => {
  // Prognosedagene i 7-dagersstripen bedømmes på denne. Er den ikke det samme
  // regnestykket som løkka over, får dag 1 en annen målestokk enn dag 0 — og da
  // er vi tilbake til «samme poengsum, motsatt farge på nabodager».
  it('is the same bucket as running the whole series again', () => {
    const observedSeries = [0, 0, 0, 12, 0, 0, 6, 0, 0, 0, 0, 3, 0, 0];
    const tomorrowRain = 9;
    const stepped = advanceSoilMoistureIndex(computeSoilMoistureIndex(observedSeries, 14), tomorrowRain, 14)!;
    const recomputed = computeSoilMoistureIndex([...observedSeries, tomorrowRain], 14)!;
    expect(stepped).toBeCloseTo(recomputed, 3);
  });

  it('dries the ground on a rainless day', () => {
    expect(advanceSoilMoistureIndex(0.5, 0, 18)!).toBeLessThan(0.5);
  });

  it('wets it on a rainy one, and never past saturation', () => {
    expect(advanceSoilMoistureIndex(0.5, 10, 12)!).toBeGreaterThan(0.5);
    expect(advanceSoilMoistureIndex(0.9, 80, 12)!).toBe(1);
  });

  it('never goes below empty, however long the drought', () => {
    let v: number | null = 0.1;
    for (let i = 0; i < 30; i += 1) v = advanceSoilMoistureIndex(v, 0, 25);
    expect(v).toBe(0);
  });

  it('stays null when there is nothing to carry forward', () => {
    // Ingen døgnnedbør fra leverandøren → vi later ikke som om vi vet fukten.
    expect(advanceSoilMoistureIndex(null, 20, 12)).toBeNull();
  });
});
