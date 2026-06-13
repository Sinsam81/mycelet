import { describe, expect, it } from 'vitest';
import {
  countWithinKm,
  occurrenceHaversineKm,
  weightedOccurrenceDensity,
  OCCURRENCE_KERNEL_BANDWIDTH_KM
} from '@/lib/prediction/occurrences';

// ~1 km north of the origin point (0.009° latitude ≈ 1 km).
const ORIGIN = { lat: 60.0, lng: 10.0 };
function pointKmNorth(km: number) {
  return { latitude: ORIGIN.lat + (km * 0.009), longitude: ORIGIN.lng };
}

describe('weightedOccurrenceDensity', () => {
  it('weighs a find ON the cell at ~1.0', () => {
    const d = weightedOccurrenceDensity([{ latitude: ORIGIN.lat, longitude: ORIGIN.lng }], ORIGIN.lat, ORIGIN.lng);
    expect(d).toBeCloseTo(1, 2);
  });

  it('decays a find at the bandwidth distance to ~e^-1 (0.37)', () => {
    const d = weightedOccurrenceDensity([pointKmNorth(OCCURRENCE_KERNEL_BANDWIDTH_KM)], ORIGIN.lat, ORIGIN.lng);
    expect(d).toBeGreaterThan(0.3);
    expect(d).toBeLessThan(0.45);
  });

  it('a close cluster outweighs the same number of far finds — the whole point', () => {
    const near = Array.from({ length: 5 }, () => pointKmNorth(0.3));
    const far = Array.from({ length: 5 }, () => pointKmNorth(3.5));
    const dNear = weightedOccurrenceDensity(near, ORIGIN.lat, ORIGIN.lng);
    const dFar = weightedOccurrenceDensity(far, ORIGIN.lat, ORIGIN.lng);
    expect(dNear).toBeGreaterThan(dFar * 5); // close finds dominate
  });

  it('ignores points beyond the cutoff (negligible weight, skipped)', () => {
    const d = weightedOccurrenceDensity([pointKmNorth(20)], ORIGIN.lat, ORIGIN.lng);
    expect(d).toBe(0);
  });

  it('a tight cluster of N finds approaches the raw count N (drops into the existing boost unchanged)', () => {
    const cluster = Array.from({ length: 12 }, () => pointKmNorth(0.2));
    const d = weightedOccurrenceDensity(cluster, ORIGIN.lat, ORIGIN.lng);
    expect(d).toBeGreaterThan(11); // ~12, so 1+min(0.6, d·0.05) still saturates the cap
  });

  it('still credits spread-out finds, just less than the old hard count', () => {
    const spread = [pointKmNorth(0.5), pointKmNorth(2), pointKmNorth(3.8)];
    const kernel = weightedOccurrenceDensity(spread, ORIGIN.lat, ORIGIN.lng);
    const hardCount = countWithinKm(spread.map((p) => ({ latitude: p.latitude, longitude: p.longitude })), ORIGIN.lat, ORIGIN.lng, 4);
    expect(hardCount).toBe(3);
    expect(kernel).toBeGreaterThan(0);
    expect(kernel).toBeLessThan(3); // distance-discounted vs the flat count
  });
});

describe('occurrenceHaversineKm (sanity)', () => {
  it('measures ~1 km for a 0.009° latitude step', () => {
    expect(occurrenceHaversineKm(60, 10, 60.009, 10)).toBeCloseTo(1, 1);
  });
});
