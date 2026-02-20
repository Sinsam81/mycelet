import { describe, expect, it } from 'vitest';
import {
  computeAdvancedEnvironmentScore,
  computeAdvancedFactors,
  computeEnvironmentScore,
  computeHistoricalScore,
  computeSeasonalScore,
  scoreToCondition
} from '../prediction';

describe('prediction utils', () => {
  it('returns stable baseline environment score within range', () => {
    const score = computeEnvironmentScore({
      temperature: 12,
      humidity: 84,
      rain3dMm: 14
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(50);
    expect(score).toBeGreaterThan(30);
  });

  it('computes advanced factors in 0-100 interval', () => {
    const factors = computeAdvancedFactors({
      latitude: 59.91,
      longitude: 10.75,
      month: 9,
      weather: {
        temperature: 11,
        humidity: 82,
        rain3dMm: 9
      }
    });

    expect(factors.vegetation).toBeGreaterThanOrEqual(0);
    expect(factors.vegetation).toBeLessThanOrEqual(100);
    expect(factors.terrain).toBeGreaterThanOrEqual(0);
    expect(factors.terrain).toBeLessThanOrEqual(100);
    expect(factors.soil).toBeGreaterThanOrEqual(0);
    expect(factors.soil).toBeLessThanOrEqual(100);

    const advancedEnvironment = computeAdvancedEnvironmentScore(factors);
    expect(advancedEnvironment).toBeGreaterThanOrEqual(0);
    expect(advancedEnvironment).toBeLessThanOrEqual(100);
  });

  it('maps total score to condition', () => {
    expect(scoreToCondition(15)).toBe('poor');
    expect(scoreToCondition(40)).toBe('moderate');
    expect(scoreToCondition(60)).toBe('good');
    expect(scoreToCondition(90)).toBe('excellent');
  });

  it('keeps historical and seasonal score bounded', () => {
    const historical = computeHistoricalScore(100, 2000);
    const seasonal = computeSeasonalScore(9);

    expect(historical).toBeGreaterThanOrEqual(0);
    expect(historical).toBeLessThanOrEqual(35);
    expect(seasonal).toBeGreaterThanOrEqual(0);
    expect(seasonal).toBeLessThanOrEqual(15);
  });
});
