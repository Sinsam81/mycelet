import { describe, expect, it } from 'vitest';
import { observedRainWindows, rainWindowsFromSeries, sumLastN } from '../windows';
import type { WeatherSummary } from '../index';

const base: WeatherSummary = {
  source: 'met_frost',
  temperatureC: 15,
  humidityPct: 85,
  humidityEstimated: false,
  rain3dMm: 1,
  rain7dMm: 2,
  rain14dMm: 3,
  minTemp7dC: 8,
  maxTemp7dC: 18,
  soilMoistureIndex: 0.5,
  precipDailyMm: null
};

describe('trailing windows', () => {
  it('sums the last n entries', () => {
    expect(sumLastN([1, 2, 3, 4, 5], 3)).toBe(12);
  });

  it('sums the whole series when it is shorter than the window', () => {
    expect(sumLastN([1, 2], 14)).toBe(3);
  });

  it('is empty-safe', () => {
    expect(sumLastN([], 7)).toBe(0);
  });

  it('derives all three windows from one series', () => {
    const series = Array.from({ length: 14 }, (_, i) => i + 1); // 1..14
    expect(rainWindowsFromSeries(series)).toEqual({
      rain3dMm: 12 + 13 + 14,
      rain7dMm: 8 + 9 + 10 + 11 + 12 + 13 + 14,
      rain14dMm: 105
    });
  });
});

describe('every surface must measure today the same way', () => {
  it('prefers the daily series when the provider has one', () => {
    const withSeries = { ...base, precipDailyMm: [10, 0, 0, 5] };
    // Adapter fields say 1/2/3; the series must win, or the home card and the
    // push endpoint report different scores for the same day.
    expect(observedRainWindows(withSeries)).toEqual({ rain3dMm: 5, rain7dMm: 15, rain14dMm: 15 });
  });

  it('falls back to the adapter sums when there is no series', () => {
    expect(observedRainWindows(base)).toEqual({ rain3dMm: 1, rain7dMm: 2, rain14dMm: 3 });
  });

  it('treats an empty series as no series', () => {
    expect(observedRainWindows({ ...base, precipDailyMm: [] })).toEqual({
      rain3dMm: 1,
      rain7dMm: 2,
      rain14dMm: 3
    });
  });
});

describe('the day-0/day-1 cliff cannot come back', () => {
  // The bug: day 0 was scored on a 14-day window and day 1 on a 7-day window,
  // so the strip stepped down even when tomorrow's rainfall was identical.
  it('gives today and tomorrow the same windows when tomorrow is a repeat of today', () => {
    const observed = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    const today = rainWindowsFromSeries(observed);
    const tomorrow = rainWindowsFromSeries([...observed, 3]);
    expect(tomorrow).toEqual(today);
  });

  it('moves only when the weather moves', () => {
    const observed = Array.from({ length: 14 }, () => 3);
    const wetTomorrow = rainWindowsFromSeries([...observed, 20]);
    expect(wetTomorrow.rain3dMm).toBeGreaterThan(rainWindowsFromSeries(observed).rain3dMm);
  });
});
