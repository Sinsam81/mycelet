import { describe, expect, it } from 'vitest';
import {
  COMPONENT_MAX,
  computeAdvancedEnvironmentScore,
  computeAdvancedFactors,
  computeEnvironmentScore,
  computeHistoricalScore,
  computeSeasonalScore,
  scoreToCondition
} from '../prediction';
import { computeCellPrediction } from '@/lib/prediction/cell-score';

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

  it('keeps unknown spatial factors neutral instead of inventing coordinate gradients', () => {
    const weather = { temperature: 11, humidity: 82, rain3dMm: 9 };
    const oslo = computeAdvancedFactors({ latitude: 59.91, longitude: 10.75, month: 9, weather });
    const gothenburg = computeAdvancedFactors({ latitude: 57.71, longitude: 11.97, month: 9, weather });

    expect(oslo.vegetation).toBe(50);
    expect(oslo.terrain).toBe(50);
    expect(oslo.soil).toBe(50);
    expect(gothenburg).toEqual(oslo);
  });

  // Tersklene ble flyttet 2026-08-02 fra 75/55/35 til 72/60/50, fordi de gamle
  // var satt som om scoren brukte hele 0–100. Målt spenn i produksjon er 43–85
  // med median 55, så «poor» (under 35) var uoppnåelig og 71 % av rasteret
  // havnet i «moderate». Se docs/kalibrering-av-dommene.md.
  it('maps total score to condition on the calibrated ladder', () => {
    expect(scoreToCondition(15)).toBe('poor');
    expect(scoreToCondition(49)).toBe('poor'); // var 'moderate' før kalibreringen
    expect(scoreToCondition(50)).toBe('moderate');
    expect(scoreToCondition(59)).toBe('moderate');
    expect(scoreToCondition(60)).toBe('good');
    expect(scoreToCondition(71)).toBe('good');
    expect(scoreToCondition(72)).toBe('excellent');
    expect(scoreToCondition(90)).toBe('excellent');
  });

  it('bruker alle fire bøttene innenfor spennet som faktisk forekommer', () => {
    // Selve poenget med kalibreringen: med de gamle tersklene kunne ingen rute
    // i produksjon bli 'poor', så ingenting på kartet kunne skille seg ut.
    const maltSpenn = Array.from({ length: 85 - 43 + 1 }, (_, i) => 43 + i);
    expect(new Set(maltSpenn.map(scoreToCondition))).toEqual(
      new Set(['poor', 'moderate', 'good', 'excellent'])
    );
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

/**
 * Panelet skriver «Miljø: {value}/{max}», og nevneren hentes fra COMPONENT_MAX.
 * Da MÅ tallene faktisk holde seg innenfor den — ellers er nevneren en ny løgn i
 * stedet for en oppklaring. Testene under låser de tre takene mot koden som
 * produserer verdiene, i BEGGE retninger: maksverdien skal være nåbar (ellers
 * er «Sesong: 15/15» ikke maks likevel) og ikke overskrides.
 */
describe('COMPONENT_MAX er den ekte nevneren', () => {
  it('sesong når nøyaktig taket i høysesongen', () => {
    expect(computeSeasonalScore(9)).toBe(COMPONENT_MAX.seasonal);
    // …og faller aldri utenfor det, uansett måned.
    for (let month = 1; month <= 12; month++) {
      expect(computeSeasonalScore(month)).toBeLessThanOrEqual(COMPONENT_MAX.seasonal);
    }
  });

  it('historikk når taket med nok funn, og ikke mer', () => {
    expect(computeHistoricalScore(1000, 100000)).toBe(COMPONENT_MAX.historical);
  });

  it('miljø holder seg innenfor taket på fallback-banen', () => {
    const best = computeEnvironmentScore({ temperature: 12, humidity: 95, rain3dMm: 40 });
    expect(best).toBeLessThanOrEqual(COMPONENT_MAX.environment);
  });

  it('computeCellPrediction gir aldri et miljøledd over taket', () => {
    // Dette er skalaen flisgeneratoren og fallback-banen deler. Flisbanen i
    // /api/prediction klampet før til 0-100, så «Miljø 64» var umulig her —
    // to skalaer bak samme etikett.
    const worstCase = computeCellPrediction({
      lat: 60,
      lon: 10,
      month: 9,
      weather: { temperature: 12, humidity: 100, rain3dMm: 60, soilMoistureIndex: 1 },
      forest: { forestType: 'gran', productivity: 20, volumePerHa: 400, ageYears: 80, source: 'sr16' },
      elevation: 300,
      species: null,
      speciesHabitat: null
    });
    expect(worstCase.components.environment).toBeLessThanOrEqual(COMPONENT_MAX.environment);
    expect(worstCase.components.historical).toBeLessThanOrEqual(COMPONENT_MAX.historical);
    expect(worstCase.components.seasonal).toBeLessThanOrEqual(COMPONENT_MAX.seasonal);
  });
});
