import { describe, expect, it } from 'vitest';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import type { ExplanationWeather } from '@/lib/utils/prediction-explanation';

const base: ExplanationWeather = {
  temperatureC: 14,
  humidityPct: 85,
  rain3dMm: 10,
  rain7dMm: 30,
  rain14dMm: 60,
  minTemp7dC: 8,
  maxTemp7dC: 18
};

describe('assessMushroomDay', () => {
  it('flags a peak-season day with a wet base, mild temp and high humidity as optimal', () => {
    const result = assessMushroomDay(base, 9); // September
    expect(result.optimal).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.title).toContain('Perfekt soppdag');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('never marks deep winter optimal, even with otherwise great weather', () => {
    const result = assessMushroomDay(base, 1); // January
    expect(result.optimal).toBe(false);
    expect(result.title).toBe('Soppforhold i dag');
  });

  it('is not optimal in season when it has been dry', () => {
    const dry: ExplanationWeather = { ...base, rain3dMm: 0, rain7dMm: 2, rain14dMm: 4 };
    const result = assessMushroomDay(dry, 9);
    expect(result.optimal).toBe(false);
  });

  it('rewards more cumulative rain with a higher score', () => {
    const wet = assessMushroomDay(base, 9).score;
    const drier = assessMushroomDay({ ...base, rain14dMm: 12 }, 9).score;
    expect(wet).toBeGreaterThan(drier);
  });

  it('clamps the score to 0–100', () => {
    const result = assessMushroomDay(base, 9);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('treats the shoulder months (July/November) as in-season but harder', () => {
    const july = assessMushroomDay(base, 7);
    expect(july.score).toBeLessThan(assessMushroomDay(base, 9).score);
  });
});

describe('assessMushroomDay — language', () => {
  it('returns Swedish copy for a Swedish reader', () => {
    const result = assessMushroomDay(base, 9, 'sv');
    expect(result.title).toContain('Perfekt svampdag');
    expect(result.message).toContain('Förhållandena');
    // The data-backed reasons must be translated too — they render on the same card.
    expect(result.reasons.join(' ')).not.toMatch(/regn siste|luftfuktighet — høyt/);
  });

  it('says "Svampförhållanden i dag" in Swedish when the day is not optimal', () => {
    const result = assessMushroomDay(base, 1, 'sv');
    expect(result.title).toBe('Svampförhållanden i dag');
    expect(result.message).toContain('Kolla kartan');
  });

  it('defaults to Norwegian when no locale is given', () => {
    expect(assessMushroomDay(base, 1).title).toBe('Soppforhold i dag');
  });
});

describe('assessMushroomDay — the moisture veto', () => {
  // A 14-day rain sum stays high long after the ground has dried. Without the
  // bucket model the card would celebrate a day the flush banner calls dry.
  const septemberDrought: ExplanationWeather = {
    temperatureC: 15,
    humidityPct: 85,
    rain3dMm: 0,
    rain7dMm: 0,
    rain14dMm: 71,
    minTemp7dC: 8,
    maxTemp7dC: 18
  };

  it('refuses to celebrate when the ground has dried out', () => {
    const dry = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.2 }, 9);
    expect(dry.optimal).toBe(false);
    expect(dry.title).toBe('Soppforhold i dag');
    // …and must not still list the old rain as a reason to go.
    expect(dry.reasons.join(' ')).not.toMatch(/regn|fuktet/i);
  });

  it('still celebrates when the ground is actually wet', () => {
    const wet = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.8 }, 9);
    expect(wet.optimal).toBe(true);
    expect(wet.title).toContain('Perfekt soppdag');
  });

  it('uses the same 0.55 gate as the flush banner, so the two cannot disagree', () => {
    expect(assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.54 }, 9).optimal).toBe(false);
    expect(assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 0.55 }, 9).optimal).toBe(true);
  });

  it('is inert when no moisture index is available', () => {
    // OpenWeather and forecast days have no bucket. Behaviour must be unchanged.
    const withoutField = assessMushroomDay(septemberDrought, 9);
    const explicitlyNull = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: null }, 9);
    expect(withoutField.optimal).toBe(true);
    expect(explicitlyNull).toEqual(withoutField);
  });

  it('can only veto, never promote', () => {
    // A soaked but out-of-season day stays un-celebrated.
    const january = assessMushroomDay({ ...septemberDrought, soilMoistureIndex: 1 }, 1);
    expect(january.optimal).toBe(false);
  });
});
