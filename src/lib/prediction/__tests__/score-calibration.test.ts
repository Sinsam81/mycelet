import { describe, expect, it } from 'vitest';
import { applyScoreCalibration, type ScoreCalibrationBin } from '../score-calibration';

const TABLE: ScoreCalibrationBin[] = [
  { minScore: 0, maxScore: 20, calibratedProbability: 0.05 },
  { minScore: 20, maxScore: 40, calibratedProbability: 0.18 },
  { minScore: 40, maxScore: 60, calibratedProbability: 0.38 },
  { minScore: 60, maxScore: 80, calibratedProbability: 0.62 },
  { minScore: 80, maxScore: 100, calibratedProbability: 0.78 }
];

describe('applyScoreCalibration', () => {
  it('is identity when no accepted calibration table exists', () => {
    expect(applyScoreCalibration(73.4, [])).toBe(73);
  });

  it('clamps raw scores to 0-100', () => {
    expect(applyScoreCalibration(-20, [])).toBe(0);
    expect(applyScoreCalibration(120, [])).toBe(100);
  });

  it('uses nearest calibrated edge outside the table midpoint range', () => {
    expect(applyScoreCalibration(0, TABLE)).toBe(5);
    expect(applyScoreCalibration(100, TABLE)).toBe(78);
  });

  it('linearly interpolates between bin midpoints', () => {
    // Midpoint between 50 (38%) and 70 (62%) should be ~50%.
    expect(applyScoreCalibration(60, TABLE)).toBe(50);
  });

  it('sorts and ignores malformed bins defensively', () => {
    const messy = [
      { minScore: 40, maxScore: 60, calibratedProbability: 0.5 },
      { minScore: 0, maxScore: 0, calibratedProbability: 0.2 },
      { minScore: 0, maxScore: 20, calibratedProbability: 0.1 }
    ];
    expect(applyScoreCalibration(10, messy)).toBe(10);
    expect(applyScoreCalibration(50, messy)).toBe(50);
  });
});
