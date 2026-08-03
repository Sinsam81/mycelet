import { describe, expect, it } from 'vitest';
import { forecastBarHeights, isFlatWeek } from '../forecast-bars';

/**
 * Søylehøyden var `Math.max(10, score)%` — en absolutt skala i en 48 px-boks.
 * Målt aug–okt (ERA5, 14 steder NO+SE, 2014–2024, n = 14 168 uker): spennet
 * innenfor ÉN uke har median 17 poeng, som ble 8,2 piksler. Under det øyet leser
 * som forskjell.
 */
describe('forecastBarHeights', () => {
  it('gjør ukas beste dag synlig høyest', () => {
    // Kristiansand, ekte tall fra målingen. Onsdag/torsdag på 96 ble tegnet
    // nesten like høyt som dagens 78.
    const uke = [78, 78, 95, 96, 96, 90, 80];
    const h = forecastBarHeights(uke);
    const beste = Math.max(...h);
    const idag = h[0];
    expect(beste - idag).toBeGreaterThan(50); // var ~18 prosentpoeng før
    expect(beste).toBe(100);
  });

  it('bruker hele boksen selv når spennet er lite', () => {
    const h = forecastBarHeights([70, 74, 78, 82, 76, 72, 71]);
    expect(Math.min(...h)).toBeLessThanOrEqual(15);
    expect(Math.max(...h)).toBe(100);
  });

  it('lar ingen søyle forsvinne', () => {
    for (const uke of [[10, 100], [0, 50, 100], [95, 96, 97, 98, 99, 100, 40]]) {
      for (const v of forecastBarHeights(uke)) expect(v).toBeGreaterThanOrEqual(14);
    }
  });

  it('blåser ikke opp støy til fjell på en jevn uke', () => {
    // 2 poengs forskjell er ikke «dagen å dra ut». Å tegne den dobbelt så høy
    // ville vært en påstand modellen ikke bærer.
    const h = forecastBarHeights([80, 81, 82, 80, 79, 81, 80]);
    expect(new Set(h).size).toBe(1);
  });

  it('takler tom og enkelt-dags uke', () => {
    expect(forecastBarHeights([])).toEqual([]);
    expect(forecastBarHeights([70])).toHaveLength(1);
    expect(forecastBarHeights([70])[0]).toBeGreaterThan(0);
  });

  it('isFlatWeek skiller jevn fra ujevn', () => {
    expect(isFlatWeek([80, 81, 82])).toBe(true);
    expect(isFlatWeek([70, 85, 90])).toBe(false);
    expect(isFlatWeek([])).toBe(true);
  });
});
