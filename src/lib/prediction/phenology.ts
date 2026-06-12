/**
 * Runtime lookup into the empirical fruiting-phenology curves generated from
 * 315k dated Nordic finds (see scripts/generate-phenology.mjs). Returns a
 * smooth, latitude-aware seasonal weight in [0,1] (peak week = 1) for a
 * species, replacing the hand-coded season_start/end months in scoring.
 *
 * Pure lookup — the heavy bucketing/smoothing happens at build time, so this
 * is cheap enough for the per-cell grid loop.
 */
import { PHENOLOGY, type SpeciesPhenology } from './phenology-data';

const WEEKS = 52;
// Cumulative days before the start of each month (non-leap; good enough for weeks).
const CUM_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

// Must match scripts/phenology-core.mjs latBand().
function bandKey(lat: number): 'south' | 'central' | 'north' {
  if (lat < 61) return 'south';
  if (lat < 64) return 'central';
  return 'north';
}

function weekIndex(dayOfYear: number): number {
  return Math.max(0, Math.min(WEEKS - 1, Math.floor((dayOfYear - 1) / 7)));
}

/** Mid-month day-of-year, for callers that only know the month (1-12). */
export function dayOfYearFromMonth(month: number): number {
  const m = Math.max(1, Math.min(12, Math.round(month)));
  return CUM_DAYS[m - 1] + 15;
}

/** Day-of-year (1-366) for a Date. */
export function dayOfYearOf(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000) + 1;
}

/**
 * Empirical seasonal weight 0..1 (peak week = 1) for a species at a latitude
 * and day-of-year. Uses the latitude-band curve when present, else the
 * species' all-Nordic curve. Returns null when we have no curve for this
 * species — the caller then keeps the hand-coded month logic.
 */
export function phenologyFactor(
  speciesId: number | null | undefined,
  lat: number,
  dayOfYear: number
): number | null {
  if (speciesId == null) return null;
  const entry: SpeciesPhenology | undefined = PHENOLOGY[String(speciesId)];
  if (!entry) return null;
  const curve = entry[bandKey(lat)] ?? entry.all;
  if (!curve || curve.length !== WEEKS) return null;
  const value = curve[weekIndex(dayOfYear)];
  return typeof value === 'number' ? value : null;
}
