import { describe, expect, it } from 'vitest';
import { applyPositionOffset } from '../position-offset';

function bearingDeg(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((to.lat * Math.PI) / 180);
  const x =
    Math.cos((from.lat * Math.PI) / 180) * Math.sin((to.lat * Math.PI) / 180) -
    Math.sin((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const origin = { lat: 59.91, lng: 10.75 };

describe('applyPositionOffset', () => {
  it('flytter IKKE alltid nordøst', () => {
    // Kursen var låst til 45° — en konstant vektor, ikke støy. Ser noen flere
    // av samme brukers justerte funn, kan den trekkes fra.
    const bearings = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const moved = applyPositionOffset(origin.lat, origin.lng, 100);
      bearings.add(Math.round(bearingDeg(origin, moved)));
    }
    expect(bearings.size).toBeGreaterThan(20);
    // …og den skal ikke være hengt opp i nordøst-kvadranten heller.
    const nordost = [...bearings].filter((b) => b >= 30 && b <= 60).length;
    expect(nordost / bearings.size).toBeLessThan(0.5);
  });

  it('dekker hele kompasset', () => {
    const kvadranter = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const moved = applyPositionOffset(origin.lat, origin.lng, 250);
      kvadranter.add(Math.floor(bearingDeg(origin, moved) / 90));
    }
    expect(kvadranter.size).toBe(4);
  });

  it('holder avstanden brukeren valgte', () => {
    for (const meters of [50, 100, 500]) {
      for (let i = 0; i < 25; i++) {
        const moved = applyPositionOffset(origin.lat, origin.lng, meters);
        expect(distanceM(origin, moved)).toBeCloseTo(meters, -1);
      }
    }
  });

  it('lar punktet stå når forskyvningen er null', () => {
    expect(applyPositionOffset(origin.lat, origin.lng, 0)).toEqual(origin);
  });

  it('virker like langt nord — lengdegradene er smalere i Tromsø', () => {
    const tromso = { lat: 69.65, lng: 18.96 };
    const moved = applyPositionOffset(tromso.lat, tromso.lng, 100, () => 0.25); // rett øst
    expect(distanceM(tromso, moved)).toBeCloseTo(100, -1);
    expect(bearingDeg(tromso, moved)).toBeCloseTo(90, 0);
  });
});
