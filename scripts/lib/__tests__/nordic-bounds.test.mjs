import { describe, expect, it } from 'vitest';
import { insideNordicBox } from '../nordic-bounds.mjs';

/**
 * De 22 søppelradene i produksjon som denne vakten skal ha stoppet:
 * 21 på nøyaktig (0, 0) og én på (60,79533, 60,79533) — breddegraden kopiert
 * inn i lengdegraden, som lander i Uralfjellene.
 */
describe('insideNordicBox', () => {
  it('avviser Null Island', () => {
    expect(insideNordicBox(0, 0)).toBe(false);
  });

  it('avviser breddegrad kopiert inn i lengdegraden', () => {
    expect(insideNordicBox(60.79533, 60.79533)).toBe(false);
  });

  it('slipper gjennom ekte norske og svenske funnsteder', () => {
    expect(insideNordicBox(59.91, 10.75)).toBe(true); // Oslo
    expect(insideNordicBox(69.65, 18.96)).toBe(true); // Tromsø
    expect(insideNordicBox(57.71, 11.97)).toBe(true); // Göteborg
    expect(insideNordicBox(67.86, 20.23)).toBe(true); // Kiruna
    expect(insideNordicBox(55.6, 13.0)).toBe(true); // Malmö
    expect(insideNordicBox(70.66, 23.68)).toBe(true); // Hammerfest
  });

  it('avviser punkter langt utenfor Norden', () => {
    expect(insideNordicBox(48.85, 2.35)).toBe(false); // Paris
    expect(insideNordicBox(-33.87, 151.21)).toBe(false); // Sydney
    expect(insideNordicBox(64.15, -21.94)).toBe(false); // Reykjavík
  });

  it('avviser verdier som ikke er tall', () => {
    expect(insideNordicBox(Number.NaN, 10.75)).toBe(false);
    expect(insideNordicBox(59.91, Number.NaN)).toBe(false);
  });
});
