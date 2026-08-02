import { describe, expect, it } from 'vitest';
import { SEARCH_AREA_RADIUS_M, searchAreaKm2 } from '../spot-area';

/**
 * Denne fila hadde tidligere tester for en radius avledet av samplingscellen.
 * Den koden er borte — cellen kunne bli 10 km bred, og områdene dekket da hele
 * landskapet. Testene ble stående og testet en funksjon ingenting kalte lenger:
 * kulisse, akkurat den feilklassen vi har jaktet på ellers.
 *
 * Det som står igjen er det ene tallet som faktisk styrer hva brukeren ser.
 */
describe('søkeområdet er én kvadratkilometer', () => {
  it('dekker ~1 km²', () => {
    expect(searchAreaKm2()).toBeGreaterThan(0.95);
    expect(searchAreaKm2()).toBeLessThan(1.05);
  });

  it('er lite nok til å skille steder fra hverandre', () => {
    // Forsøk 2 tegnet hele cellen, opptil 5 000 m radius. På Nesodden dekket
    // det halvøya. Grensa her er satt godt under det som gjorde kartet ubrukelig.
    expect(SEARCH_AREA_RADIUS_M).toBeLessThan(1000);
  });

  it('er stort nok til å ikke bli et punkt igjen', () => {
    // Forsøk 1 var en nål. En sirkel under ~200 m leses som det samme.
    expect(SEARCH_AREA_RADIUS_M).toBeGreaterThan(300);
  });
});
