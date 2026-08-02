import { describe, expect, it } from 'vitest';
import { pickBestForecastDay } from '../forecast-best-day';

describe('pickBestForecastDay', () => {
  it('peker IKKE på en dag når hele uka ligger likt', () => {
    // Ekte svar fra /api/mushroom-forecast for Bergen 1. august 2026.
    const flat = [100, 100, 100, 100, 100, 100, 100].map((score) => ({ score }));
    const pick = pickBestForecastDay(flat);
    expect(pick.index).toBeNull();
    expect(pick.tiedIndexes).toHaveLength(7);
    expect(pick.score).toBe(100);
  });

  it('peker heller ikke på i dag når fem dager deler toppen', () => {
    // Trondheim samme dag: fire andre dager har identisk toppscore.
    const pick = pickBestForecastDay([100, 100, 93, 93, 100, 100, 100].map((score) => ({ score })));
    expect(pick.index).toBeNull();
    expect(pick.tiedIndexes).toEqual([0, 1, 4, 5, 6]);
  });

  it('peker på dagen når den faktisk skiller seg ut', () => {
    const pick = pickBestForecastDay([40, 55, 91, 60, 40, 30, 20].map((score) => ({ score })));
    expect(pick.index).toBe(2);
    expect(pick.score).toBe(91);
  });

  it('peker på i dag når i dag er alene på toppen', () => {
    const pick = pickBestForecastDay([80, 40, 40, 40, 40, 40, 40].map((score) => ({ score })));
    expect(pick.index).toBe(0);
  });

  it('tåler tom liste', () => {
    expect(pickBestForecastDay([])).toEqual({ index: null, tiedIndexes: [], score: null });
  });

  it('en enkelt dag er sin egen beste dag', () => {
    expect(pickBestForecastDay([{ score: 12 }]).index).toBe(0);
  });
});
