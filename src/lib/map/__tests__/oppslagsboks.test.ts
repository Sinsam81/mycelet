import { describe, expect, it } from 'vitest';
import { PROVIDER_DECIMALS } from '@/lib/privacy/provider-precision';
import { festBoksTilOppslagspresisjon, type Oppslagsboks } from '../oppslagsboks';

/** En enhetsposisjon med flere desimaler enn noe oppslag trenger. */
const ENHET = { lat: 59.123456789, lng: 10.987654321 };

/** Boksen kartet legger rundt et punkt: ±radius i km, som i generateTopSpots. */
function boksRundt(punkt: { lat: number; lng: number }, radiusKm: number): Oppslagsboks {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((punkt.lat * Math.PI) / 180));
  return {
    minLat: punkt.lat - latDelta,
    maxLat: punkt.lat + latDelta,
    minLng: punkt.lng - lngDelta,
    maxLng: punkt.lng + lngDelta
  };
}

const midt = (b: Oppslagsboks) => ({ lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 });
const TRINN = 10 ** -PROVIDER_DECIMALS;

describe('festBoksTilOppslagspresisjon', () => {
  it('midtpunktet — enhetens posisjon — får tre desimaler', () => {
    const fast = festBoksTilOppslagspresisjon(boksRundt(ENHET, 5));
    expect(midt(fast).lat).toBeCloseTo(59.123, 9);
    expect(midt(fast).lng).toBeCloseTo(10.988, 9);
  });

  it('boksen beholder størrelsen sin, så rutenettet inni er det samme', () => {
    for (const radius of [5, 10, 20, 35]) {
      const inn = boksRundt(ENHET, radius);
      const ut = festBoksTilOppslagspresisjon(inn);
      expect(ut.maxLat - ut.minLat).toBeCloseTo(inn.maxLat - inn.minLat, 10);
      expect(ut.maxLng - ut.minLng).toBeCloseTo(inn.maxLng - inn.minLng, 10);
    }
  });

  it('flytter boksen høyst et halvt trinn i hver retning', () => {
    const inn = boksRundt(ENHET, 5);
    const ut = festBoksTilOppslagspresisjon(inn);
    expect(Math.abs(ut.minLat - inn.minLat)).toBeLessThanOrEqual(TRINN / 2 + 1e-12);
    expect(Math.abs(ut.minLng - inn.minLng)).toBeLessThanOrEqual(TRINN / 2 + 1e-12);
    // … og flytter den faktisk, når posisjonen har flere desimaler.
    expect(Math.abs(ut.minLat - inn.minLat)).toBeGreaterThan(1e-4);
  });

  it('en boks som alt ligger rundt et avrundet punkt, står der den sto', () => {
    const inn = boksRundt({ lat: 59.123, lng: 10.988 }, 10);
    const ut = festBoksTilOppslagspresisjon(inn);
    expect(ut.minLat).toBeCloseTo(inn.minLat, 10);
    expect(ut.maxLat).toBeCloseTo(inn.maxLat, 10);
    expect(ut.minLng).toBeCloseTo(inn.minLng, 10);
    expect(ut.maxLng).toBeCloseTo(inn.maxLng, 10);
  });

  it('gir samme boks om den brukes to ganger', () => {
    const en = festBoksTilOppslagspresisjon(boksRundt(ENHET, 20));
    const to = festBoksTilOppslagspresisjon(en);
    for (const kant of ['minLat', 'minLng', 'maxLat', 'maxLng'] as const) {
      expect(to[kant]).toBeCloseTo(en[kant], 10);
    }
  });

  it('to posisjoner noen meter fra hverandre gir samme boks — den finkornede posisjonen er borte', () => {
    const a = festBoksTilOppslagspresisjon(boksRundt({ lat: 59.12341, lng: 10.98761 }, 5));
    const b = festBoksTilOppslagspresisjon(boksRundt({ lat: 59.12338, lng: 10.98774 }, 5));
    expect(midt(a).lat).toBeCloseTo(midt(b).lat, 9);
    expect(midt(a).lng).toBeCloseTo(midt(b).lng, 9);
  });

  it('virker også for et kartutsnitt som ikke er kvadratisk, og på sørlige og vestlige grader', () => {
    const ut = festBoksTilOppslagspresisjon({ minLat: -33.87654321, maxLat: -33.80123456, minLng: -70.71234567, maxLng: -70.55555555 });
    expect(ut.maxLat).toBeGreaterThan(ut.minLat);
    expect(ut.maxLng).toBeGreaterThan(ut.minLng);
    const m = midt(ut);
    expect(Math.abs(m.lat * 1000 - Math.round(m.lat * 1000))).toBeLessThan(1e-6);
    expect(Math.abs(m.lng * 1000 - Math.round(m.lng * 1000))).toBeLessThan(1e-6);
  });
});
