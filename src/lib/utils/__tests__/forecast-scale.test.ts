import { describe, expect, it } from 'vitest';
import { FORECAST_AMBER_MIN, FORECAST_GREEN_MIN, forecastBand } from '../forecast-scale';
import { seasonWeight } from '@/lib/prediction/mushroom-day';

/**
 * Det fantes FIRE terskelsett for «hvor bra er en dag» på samme skjerm. Dette
 * er det ene de to stripene nå deler.
 *
 * De gamle var 40 og 65 — begge under 25-persentilen av sesongfordelingen
 * (p05 55, p25 73, median 86, ERA5, 14 steder, n = 99 176 dagscorer).
 */
describe('forecastBand', () => {
  it('kan si «dårlig dag» innenfor det som er nåbart i høysesongen', () => {
    // Uttømmende oppregning viste at grått traff 1 av 36 værkombinasjoner i
    // aug–okt, fordi sesongvekten alene er 35 og terskelen var 40. Med 55 er
    // båndet nåbart uten at været må være absurd.
    expect(seasonWeight(9)).toBe(35); // sesongleddet alene
    expect(forecastBand(35, false)).toBe('grey');
    expect(forecastBand(54, false)).toBe('grey');
    expect(forecastBand(55, false)).toBe('amber');
  });

  it('holder grønt bak optimal-porten', () => {
    // En mild våt januardag kan score høyt uten å være en soppdag.
    expect(forecastBand(95, false)).toBe('amber');
    expect(forecastBand(95, true)).toBe('green');
  });

  it('bruker alle tre båndene', () => {
    const bånd = new Set([
      forecastBand(40, false),
      forecastBand(70, false),
      forecastBand(90, true)
    ]);
    expect(bånd).toEqual(new Set(['grey', 'amber', 'green']));
  });

  it('har terskler innenfor det verdiområdet som forekommer', () => {
    // Sesongfordelingen er 27–100. En terskel utenfor den er en død bøtte.
    expect(FORECAST_AMBER_MIN).toBeGreaterThan(27);
    expect(FORECAST_GREEN_MIN).toBeLessThan(100);
    expect(FORECAST_GREEN_MIN).toBeGreaterThan(FORECAST_AMBER_MIN);
  });
});
