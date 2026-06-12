/**
 * Shared phenology math — used by BOTH generate-phenology.mjs (builds the
 * production curves on 100% of the data) and backtest-phenology.mjs (builds on
 * a train split, measures AUC on a test split). Keeping the bucketing,
 * smoothing and lookup in one place is what makes the backtest an honest
 * estimate of the production curves.
 *
 * A "curve" is 52 weekly values in [0,1], normalized so the peak week = 1.0,
 * smoothed with a circular moving average (fruiting is smooth; weekly raw
 * counts from sparse data are noisy).
 */

export const WEEKS = 52;

// Latitude bands. Norway+Sweden span ~55°N (south Sweden) to ~71°N (north
// Norway); fruiting shifts visibly later + shorter going north (proven from
// the data). Three bands balance signal vs sample size.
export const BANDS = ['south', 'central', 'north'];
export function latBand(lat) {
  if (lat < 61) return 'south';
  if (lat < 64) return 'central';
  return 'north';
}

// A (species, band) curve needs this many dated finds to be trusted on its
// own; below it we fall back to the species' all-latitude curve, and below
// MIN_SAMPLE_ALL we emit nothing (caller keeps the hand-coded season months).
export const MIN_SAMPLE_BAND = 150;
export const MIN_SAMPLE_ALL = 40;
const SMOOTH_RADIUS = 2; // ±2 weeks → 5-week circular window

// Real Nordic fruiting window. Winter finds (Dec–Mar) are dropped: there is
// essentially no fruiting under snow/frost, and GBIF year-only records use
// sentinel dates (01-01) that pile up an artificial January spike — verified,
// e.g. Skogsjampinjong was 76% January before this filter. April is kept so
// spring morels (Morchella) survive.
export const FRUITING_MONTH_MIN = 4;
export const FRUITING_MONTH_MAX = 11;

/**
 * ISO date "YYYY-MM-DD" → week index 0..51 (week 53 folds into 51).
 * Returns null outside the fruiting window so callers skip untrustworthy
 * winter timing data.
 */
export function weekIndexFromISO(iso) {
  if (!iso || iso.length < 10) return null;
  const month = Number(iso.slice(5, 7));
  if (!(month >= FRUITING_MONTH_MIN && month <= FRUITING_MONTH_MAX)) return null;
  const doy = dayOfYearFromISO(iso);
  if (doy == null) return null;
  return Math.min(WEEKS - 1, Math.floor((doy - 1) / 7));
}

export function dayOfYearFromISO(iso) {
  if (!iso || iso.length < 10) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const cumulative = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cumulative[m - 1] + d;
}

/** Empty weekly count accumulator. */
export function emptyCounts() {
  return new Array(WEEKS).fill(0);
}

/** Smooth (circular moving average) then normalize so peak week = 1.0. */
export function finalizeCurve(counts) {
  const smoothed = new Array(WEEKS).fill(0);
  for (let w = 0; w < WEEKS; w++) {
    let sum = 0;
    let n = 0;
    for (let k = -SMOOTH_RADIUS; k <= SMOOTH_RADIUS; k++) {
      sum += counts[(w + k + WEEKS) % WEEKS];
      n++;
    }
    smoothed[w] = sum / n;
  }
  const peak = Math.max(...smoothed);
  if (peak <= 0) return smoothed; // no data → all zeros
  return smoothed.map((v) => Math.round((v / peak) * 1000) / 1000);
}

/** Look up the seasonal weight 0..1 for a week index, with safe bounds. */
export function curveLookup(curve, weekIndex) {
  if (!curve || curve.length !== WEEKS) return null;
  const w = Math.max(0, Math.min(WEEKS - 1, weekIndex));
  return curve[w];
}

// --- The OLD (hand-coded month) season model, ported faithfully so the
// backtest can compare apples to apples. Returns a monotone seasonal signal:
// off-season 0.05, in-season 1.0, peak month 1.2 (the ×1.2 in the live model).
export function inMonth(month, start, end) {
  if (start == null || end == null) return false;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export function monthFromWeekIndex(weekIndex) {
  const doy = weekIndex * 7 + 4; // mid-week day-of-year
  const cumulative = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  for (let m = 0; m < 12; m++) if (doy <= cumulative[m]) return m + 1;
  return 12;
}

export function oldSeasonScore(weekIndex, season) {
  const month = monthFromWeekIndex(weekIndex);
  if (!inMonth(month, season.seasonStart, season.seasonEnd)) return 0.05;
  if (inMonth(month, season.peakSeasonStart, season.peakSeasonEnd)) return 1.2;
  return 1.0;
}
