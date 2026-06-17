/**
 * Data-driven score calibration helper.
 *
 * Production scoring still returns a 0-100 "raw" score. Once
 * scripts/fit-score-calibration.mjs has enough spot_feedback rows, its monotone
 * table can be applied here to map raw score -> observed probability.
 *
 * Empty table = identity. That makes the helper safe to import before a
 * calibration artifact is accepted.
 */

export interface ScoreCalibrationBin {
  minScore: number;
  maxScore: number;
  /** Probability in [0,1], from fit-score-calibration.mjs. */
  calibratedProbability: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function midpoint(bin: ScoreCalibrationBin) {
  return (bin.minScore + bin.maxScore) / 2;
}

function normalizedProbability(bin: ScoreCalibrationBin) {
  return clamp(Number(bin.calibratedProbability), 0, 1);
}

function cleanTable(table: ScoreCalibrationBin[]) {
  return table
    .filter(
      (b) =>
        Number.isFinite(b.minScore) &&
        Number.isFinite(b.maxScore) &&
        b.maxScore > b.minScore &&
        Number.isFinite(b.calibratedProbability)
    )
    .sort((a, b) => a.minScore - b.minScore);
}

/**
 * Apply a monotone calibration table to a raw 0-100 score.
 *
 * Returns a calibrated 0-100 score. Between bin midpoints it linearly
 * interpolates; outside the covered range it holds the nearest bin value.
 */
export function applyScoreCalibration(rawScore: number, table: ScoreCalibrationBin[]): number {
  const score = clamp(rawScore, 0, 100);
  const bins = cleanTable(table);
  if (bins.length === 0) return Math.round(score);

  if (bins.length === 1) return Math.round(normalizedProbability(bins[0]) * 100);

  const first = bins[0];
  const last = bins[bins.length - 1];
  if (score <= midpoint(first)) return Math.round(normalizedProbability(first) * 100);
  if (score >= midpoint(last)) return Math.round(normalizedProbability(last) * 100);

  for (let i = 0; i < bins.length - 1; i++) {
    const left = bins[i];
    const right = bins[i + 1];
    const x0 = midpoint(left);
    const x1 = midpoint(right);
    if (score < x0 || score > x1) continue;
    const t = (score - x0) / (x1 - x0);
    const p0 = normalizedProbability(left);
    const p1 = normalizedProbability(right);
    return Math.round((p0 + (p1 - p0) * t) * 100);
  }

  return Math.round(score);
}
