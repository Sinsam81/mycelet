import { describe, expect, it } from 'vitest';
import {
  monthInWindow,
  seasonFit,
  seasonFitForSpecies,
  nearbyBoost,
  rankOrder
} from '@/lib/utils/identify-ranking';
import { SEASON_WINDOWS } from '@/lib/utils/season-window-data';
import { isMonthInMask } from '@/lib/utils/season-region';

describe('monthInWindow', () => {
  it('handles a normal window', () => {
    expect(monthInWindow(8, 7, 10)).toBe(true);
    expect(monthInWindow(6, 7, 10)).toBe(false);
  });
  it('handles a year-end wrap window', () => {
    expect(monthInWindow(1, 11, 2)).toBe(true);
    expect(monthInWindow(6, 11, 2)).toBe(false);
  });
});

describe('seasonFit', () => {
  it('marks peak season with the highest factor', () => {
    const fit = seasonFit(9, 7, 10, 8, 9);
    expect(fit).toMatchObject({ inSeason: true, peakSeason: true });
    expect(fit.factor).toBeGreaterThan(1);
  });
  it('marks in-season (non-peak) as neutral', () => {
    expect(seasonFit(7, 7, 10, 8, 9)).toMatchObject({ inSeason: true, peakSeason: false, factor: 1 });
  });
  it('gives shoulder months a milder penalty than deep off-season', () => {
    const shoulder = seasonFit(6, 7, 10, 8, 9); // June, just before July start
    const deepOff = seasonFit(1, 7, 10, 8, 9); // January, far off
    expect(shoulder.inSeason).toBe(false);
    expect(shoulder.factor).toBeGreaterThan(deepOff.factor);
  });
  it('is neutral when the season is unknown', () => {
    expect(seasonFit(1, null, null, null, null)).toMatchObject({ inSeason: true, factor: 1 });
  });
});

describe('seasonFitForSpecies — samme vindu som kalenderen', () => {
  // Piggsopp (id 7). Katalogvinduet er sep–nov, men det empiriske vinduet fra
  // 4305 daterte funn er jul–okt: 1219 av funnene er gjort i august.
  const piggsopp = {
    id: 7,
    edibility: 'edible',
    season_start: 9,
    season_end: 11,
    peak_season_start: 9,
    peak_season_end: 10
  };
  const AUGUST = 8;

  it('katalogvinduet alene sier august = utenom sesong', () => {
    // Regresjonsvakt: dette var oppførselen ruta hadde, og grunnen til fiksen.
    const raw = seasonFit(AUGUST, piggsopp.season_start, piggsopp.season_end, 9, 10);
    expect(raw.inSeason).toBe(false);
    expect(raw.factor).toBeLessThan(1);
  });

  it('et korrekt piggsoppforslag i august merkes IKKE «utenom sesong»', () => {
    const fit = seasonFitForSpecies(AUGUST, piggsopp);
    expect(fit.inSeason).toBe(true);
    expect(fit.factor).toBeGreaterThanOrEqual(1);
  });

  it('det empiriske vinduet dekker faktisk august for piggsopp', () => {
    // Beviser at testen over hviler på data, ikke på et tall vi fant på.
    expect(isMonthInMask(SEASON_WINDOWS['7'].all, AUGUST)).toBe(true);
  });

  it('vinteren er fortsatt utenfor sesong for en høstsopp', () => {
    const fit = seasonFitForSpecies(2, piggsopp);
    expect(fit.inSeason).toBe(false);
    expect(fit.factor).toBeLessThan(1);
  });

  it('topp-sesong slår fortsatt gjennom', () => {
    const fit = seasonFitForSpecies(9, piggsopp);
    expect(fit).toMatchObject({ inSeason: true, peakSeason: true });
    expect(fit.factor).toBeGreaterThan(1);
  });

  it('ukjent sesong er nøytral', () => {
    expect(
      seasonFitForSpecies(1, {
        id: 999999,
        edibility: 'edible',
        season_start: null,
        season_end: null,
        peak_season_start: null,
        peak_season_end: null
      })
    ).toMatchObject({ inSeason: true, factor: 1 });
  });

  it('en art uten empirisk kurve faller tilbake på katalogvinduet', () => {
    const ukjent = {
      id: 999999,
      edibility: 'edible',
      season_start: 7,
      season_end: 9,
      peak_season_start: null,
      peak_season_end: null
    };
    expect(seasonFitForSpecies(8, ukjent).inSeason).toBe(true);
    expect(seasonFitForSpecies(1, ukjent).inSeason).toBe(false);
  });

  it('vinduet blir aldri smalere enn katalogvinduet', () => {
    for (const id of Object.keys(SEASON_WINDOWS)) {
      const species = {
        id: Number(id),
        edibility: 'edible',
        season_start: 8,
        season_end: 9,
        peak_season_start: null,
        peak_season_end: null
      };
      expect(seasonFitForSpecies(8, species).inSeason).toBe(true);
      expect(seasonFitForSpecies(9, species).inSeason).toBe(true);
    }
  });
});

describe('nearbyBoost', () => {
  it('is 1 with no nearby finds and caps the boost', () => {
    expect(nearbyBoost(0)).toBe(1);
    expect(nearbyBoost(3)).toBeCloseTo(1.18);
    expect(nearbyBoost(50)).toBe(nearbyBoost(5)); // capped at 5
  });
});

describe('rankOrder', () => {
  it('floats an in-season match above an out-of-season one', () => {
    const order = rankOrder([
      { probability: 60, edibility: 'edible', seasonFactor: 0.45, nearbyFindings: 0 }, // off-season
      { probability: 50, edibility: 'edible', seasonFactor: 1.25, nearbyFindings: 0 } // peak
    ]);
    expect(order).toEqual([1, 0]);
  });

  it('SAFETY: a deadly match never sinks below where the model placed it', () => {
    // Model put deadly first (idx 0); an in-season edible would otherwise outscore it.
    const order = rankOrder([
      { probability: 50, edibility: 'deadly', seasonFactor: 0.45, nearbyFindings: 0 },
      { probability: 48, edibility: 'edible', seasonFactor: 1.25, nearbyFindings: 5 }
    ]);
    expect(order[0]).toBe(0); // deadly stays on top
  });

  it('SAFETY: local context never reduces a toxic match (only boosts)', () => {
    // toxic is off-season but must not be penalised below an edible of similar prob.
    const order = rankOrder([
      { probability: 55, edibility: 'edible', seasonFactor: 1.0, nearbyFindings: 0 },
      { probability: 52, edibility: 'toxic', seasonFactor: 0.45, nearbyFindings: 0 }
    ]);
    // toxic factor floored at 1.0 -> 52 vs edible 55 -> edible first but toxic kept at its rank
    expect(order).toEqual([0, 1]);
  });

  it('keeps a high-probability deadly match first regardless of season', () => {
    const order = rankOrder([
      { probability: 70, edibility: 'deadly', seasonFactor: 0.45, nearbyFindings: 0 },
      { probability: 40, edibility: 'edible', seasonFactor: 1.25, nearbyFindings: 5 }
    ]);
    expect(order[0]).toBe(0);
  });
});
