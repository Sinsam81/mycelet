import type { WeatherSummary } from '@/lib/weather';

/**
 * Trailing rain windows computed from the daily series, so every consumer
 * measures rainfall the same way.
 *
 * WHY NOT JUST USE WeatherSummary.rain3dMm/rain7dMm/rain14dMm: those are summed
 * by the adapters from observation timestamps and are anchored to the observed
 * past. They cannot slide forward, so anything projecting into the forecast has
 * to compute its own — and the moment two surfaces compute rainfall differently
 * they disagree about the same day. That is what produced the home page's
 * 7-day strip stepping down between today and tomorrow under unchanged weather.
 *
 * The daily series is already the canonical record in this codebase:
 * computeSoilMoistureIndex runs the soil bucket on exactly this array.
 *
 * Windows are counted in ENTRIES, not calendar days. With a complete series the
 * two are the same; where a station has gaps the entry count is what the soil
 * bucket sees too, so at least everything is wrong in the same direction rather
 * than each surface being wrong differently.
 */

/** Trailing sum of the last n entries. A shorter series sums whole. */
export function sumLastN(series: number[], n: number): number {
  return series.slice(Math.max(0, series.length - n)).reduce((a, b) => a + b, 0);
}

export interface RainWindows {
  rain3dMm: number;
  rain7dMm: number;
  rain14dMm: number | null;
}

/**
 * The three windows from a daily series ending on the day being scored.
 * Pass the slice up to and including that day.
 */
export function rainWindowsFromSeries(series: number[]): RainWindows {
  return {
    rain3dMm: sumLastN(series, 3),
    rain7dMm: sumLastN(series, 7),
    rain14dMm: sumLastN(series, 14)
  };
}

/**
 * The windows for TODAY, preferring the daily series and falling back to the
 * adapter's own sums when the provider has no daily history (OpenWeather).
 *
 * Every surface that scores "today" must use this, or /api/mushroom-day and the
 * home card will report different numbers for the same day and place.
 */
export function observedRainWindows(observed: WeatherSummary): RainWindows {
  const series = observed.precipDailyMm;
  if (series && series.length > 0) return rainWindowsFromSeries(series);
  return {
    rain3dMm: observed.rain3dMm,
    rain7dMm: observed.rain7dMm,
    rain14dMm: observed.rain14dMm
  };
}
