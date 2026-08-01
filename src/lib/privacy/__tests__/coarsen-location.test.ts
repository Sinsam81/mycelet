import { describe, it, expect } from 'vitest';
import { coarsenLocation, COARSE_GRID_DEGREES } from '../coarsen-location';

/** Grov avstand i meter mellom to punkter. Godt nok til å resonnere om km. */
function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat = toRad((aLat + bLat) / 2);
  const x = dLon * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

describe('coarsenLocation', () => {
  it('avviser manglende koordinater', () => {
    expect(coarsenLocation(null, null)).toBeNull();
    expect(coarsenLocation(undefined, undefined)).toBeNull();
    expect(coarsenLocation(59.9, null)).toBeNull();
    expect(coarsenLocation(null, 10.7)).toBeNull();
  });

  it('avviser ugyldige tall', () => {
    expect(coarsenLocation(NaN, 10)).toBeNull();
    expect(coarsenLocation(59, Infinity)).toBeNull();
    expect(coarsenLocation(91, 10)).toBeNull();
    expect(coarsenLocation(-91, 10)).toBeNull();
    expect(coarsenLocation(59, 181)).toBeNull();
    expect(coarsenLocation(59, -181)).toBeNull();
  });

  it('gir samme svar for alle punkter i samme rute', () => {
    // To steder ~2 km fra hverandre inne i én rute skal bli identiske.
    const a = coarsenLocation(59.9139, 10.7522); // Oslo sentrum
    const b = coarsenLocation(59.9201, 10.7388); // et par kvartaler unna
    expect(a).toEqual(b);
  });

  it('skiller naboruter fra hverandre', () => {
    const a = coarsenLocation(59.94, 10.75);
    const b = coarsenLocation(60.04, 10.75);
    expect(a).not.toEqual(b);
  });

  it('er deterministisk', () => {
    expect(coarsenLocation(63.4305, 10.3951)).toEqual(coarsenLocation(63.4305, 10.3951));
  });

  describe('skjuler det eksakte punktet', () => {
    // Et hemmelig soppsted er meter-presist. Kravet er at det som sendes ut
    // aldri er nærme nok til å lede noen dit.
    const spots = [
      ['Oslo', 59.9139, 10.7522],
      ['Bergen', 60.3913, 5.3221],
      ['Tromsø', 69.6492, 18.9553],
      ['Stockholm', 59.3293, 18.0686],
      ['Göteborg', 57.7089, 11.9746],
      ['Kiruna', 67.8558, 20.2253],
      ['ved ekvator', 0.0004, 0.0004],
      ['sørlig halvkule', -33.8688, 151.2093]
    ] as const;

    it.each(spots)('%s grovkornes vekk fra punktet', (_navn, lat, lon) => {
      const coarse = coarsenLocation(lat, lon)!;
      expect(coarse).not.toBeNull();
      // Aldri identisk med det ekte punktet …
      expect(coarse.latitude === lat && coarse.longitude === lon).toBe(false);
      // … og aldri innenfor 200 m, som ville vært «samme lysning».
      expect(metresBetween(lat, lon, coarse.latitude, coarse.longitude)).toBeGreaterThan(200);
    });

    it.each(spots)('%s havner likevel i riktig landsdel', (_navn, lat, lon) => {
      const coarse = coarsenLocation(lat, lon)!;
      // Under 15 km: fortsatt riktig region for artsutbredelse.
      expect(metresBetween(lat, lon, coarse.latitude, coarse.longitude)).toBeLessThan(15000);
    });
  });

  it('havner alltid inne i ruta det ble regnet fra', () => {
    const step = COARSE_GRID_DEGREES;
    for (const lat of [59.9139, 60.0, 60.0999, -33.8688, 0]) {
      const coarse = coarsenLocation(lat, 10.5)!;
      expect(Math.abs(coarse.latitude - lat)).toBeLessThanOrEqual(step);
    }
  });

  it('lekker ikke flere desimaler enn ruta rettferdiggjør', () => {
    const coarse = coarsenLocation(59.913912345, 10.752298765)!;
    expect(String(coarse.latitude).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    expect(String(coarse.longitude).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});
