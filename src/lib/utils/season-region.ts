/**
 * Region-aware season shift. Mushroom fruiting runs later the further north
 * (and higher) you are. This is a first-pass HEURISTIC keyed on latitude only
 * (baseline ~60°N = Sør-Norge / Oslo): ~4 days later per degree north, capped.
 * Pure + testable. Not validated against real phenology data — should be tuned
 * once we have enough dated findings across the country.
 */

// 0-indexed day-of-year for the first day of each month (1-indexed month → index-1).
const MONTH_FIRST_DOY = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const YEAR = 365;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function seasonShiftDays(latitude: number | null | undefined): number {
  if (latitude == null || Number.isNaN(latitude)) return 0;
  return Math.max(-14, Math.min(35, Math.round((latitude - 60) * 4)));
}

function dayOfYearZeroBased(date: Date): number {
  return Math.min(YEAR - 1, MONTH_FIRST_DOY[date.getMonth()] + (date.getDate() - 1));
}

/**
 * Is `date` within a species' season window (1-indexed months), shifted later by
 * `shiftDays`? Day-granular so the shift is visible at season edges; wraps the year.
 */
export function isInSeasonOn(
  date: Date,
  seasonStart: number,
  seasonEnd: number,
  shiftDays: number
): boolean {
  const startDoy = mod(MONTH_FIRST_DOY[seasonStart - 1] + shiftDays, YEAR);
  // First day of the month AFTER seasonEnd, minus one = last day of seasonEnd.
  const endExclusive = seasonEnd === 12 ? YEAR : MONTH_FIRST_DOY[seasonEnd];
  const endDoy = mod(endExclusive - 1 + shiftDays, YEAR);
  const doy = dayOfYearZeroBased(date);
  return startDoy <= endDoy ? doy >= startDoy && doy <= endDoy : doy >= startDoy || doy <= endDoy;
}

/** Human label for the shift, for surfacing in the UI (empty when negligible). */
export function shiftLabel(shiftDays: number): string {
  const weeks = Math.round(shiftDays / 7);
  if (weeks >= 1) return `~${weeks} uke${weeks > 1 ? 'r' : ''} senere enn Sør-Norge`;
  return '';
}
