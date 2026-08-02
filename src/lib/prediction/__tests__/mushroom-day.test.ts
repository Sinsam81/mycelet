import { describe, expect, it } from 'vitest';
import { assessMushroomDay, seasonWeight } from '@/lib/prediction/mushroom-day';
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

/**
 * Sesongleddet var en trapp: 35 for aug-okt, 22 for jul/nov, 10 for juni, 0
 * ellers. Med IDENTISK vær ga det et sprang på 13-22 poeng ved midnatt hver 1. i
 * måneden — 31. okt 100, 1. nov 87; 30. nov 87, 1. des 65, og overskriften byttet
 * fra «Perfekt soppdag i dag!» til «Soppforhold i dag». Sju-dagersstripen krysser
 * et månedsskifte seks dager i måneden.
 */
describe('sesongleddet over månedsskiftet', () => {
  it('gir de gamle tallene midt i måneden', () => {
    expect(seasonWeight(9, 15)).toBe(35);
    expect(seasonWeight(7, 15)).toBe(22);
    expect(seasonWeight(6, 15)).toBe(10);
    expect(seasonWeight(2, 15)).toBe(0);
  });

  it('gir de gamle tallene når dagen ikke oppgis (uendret for gamle kallere)', () => {
    for (let m = 1; m <= 12; m++) {
      expect(seasonWeight(m)).toBe(seasonWeight(m, 15));
    }
  });

  it('holder nivået gjennom hele høysesongen', () => {
    // Midten av august til midten av oktober er 35 hele veien.
    expect(seasonWeight(8, 15)).toBe(35);
    expect(seasonWeight(8, 31)).toBe(35);
    expect(seasonWeight(9, 1)).toBe(35);
    expect(seasonWeight(9, 30)).toBe(35);
    expect(seasonWeight(10, 1)).toBe(35);
    expect(seasonWeight(10, 15)).toBe(35);
  });

  it('har ikke lenger et sprang ved midnatt 31. okt → 1. nov', () => {
    const step = Math.abs(seasonWeight(11, 1) - seasonWeight(10, 31));
    expect(step).toBeLessThan(1);
  });

  it('har ikke lenger et sprang ved noe månedsskifte', () => {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let m = 1; m <= 12; m++) {
      const next = (m % 12) + 1;
      const step = Math.abs(seasonWeight(next, 1) - seasonWeight(m, daysInMonth[m - 1]));
      expect(step, `månedsskiftet ${m} → ${next}`).toBeLessThan(1.5);
    }
  });

  it('stiger monotont inn i høysesongen og faller monotont ut av den', () => {
    // 1. juli → 15. august: bare oppover.
    const rising = [
      seasonWeight(7, 1),
      seasonWeight(7, 20),
      seasonWeight(8, 1),
      seasonWeight(8, 15)
    ];
    for (let i = 1; i < rising.length; i++) expect(rising[i]).toBeGreaterThan(rising[i - 1]);

    // 15. oktober → 15. desember: bare nedover.
    const falling = [
      seasonWeight(10, 15),
      seasonWeight(11, 1),
      seasonWeight(11, 20),
      seasonWeight(12, 15)
    ];
    for (let i = 1; i < falling.length; i++) expect(falling[i]).toBeLessThan(falling[i - 1]);
  });

  it('fjerner det synlige spranget i selve dagvurderingen', () => {
    const oct31 = assessMushroomDay(base, 10, 'nb', 31).score;
    const nov1 = assessMushroomDay(base, 11, 'nb', 1).score;
    expect(Math.abs(oct31 - nov1)).toBeLessThanOrEqual(1);
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
