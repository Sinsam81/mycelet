import { describe, expect, it } from 'vitest';
import {
  buildTargetGroupIndex,
  chooseTargetGroupBackgrounds,
  circularMonthDistance,
  spatialBlock
} from '../spatial-validation.mjs';

const regionOf = (_lat, lng) => (lng < 15 ? 'NO' : 'SE');
const distanceKm = (aLat, aLng, bLat, bLng) => Math.hypot(aLat - bLat, aLng - bLng) * 100;
const rng = () => 0;

describe('spatial validation matching', () => {
  it('handles the season boundary as a circular month window', () => {
    expect(circularMonthDistance(12, 1)).toBe(1);
    expect(circularMonthDistance(1, 11)).toBe(2);
  });

  it('prefers nearby same-season observations from another species and region', () => {
    const train = [
      { id: 'same-species', sid: 1, lat: 60, lng: 10, iso: '2020-08-10' },
      { id: 'best', sid: 2, lat: 60.1, lng: 10.1, iso: '2020-08-11' },
      { id: 'far', sid: 3, lat: 65, lng: 10, iso: '2020-08-12' },
      { id: 'wrong-region', sid: 4, lat: 60, lng: 18, iso: '2020-08-13' }
    ];
    const index = buildTargetGroupIndex(train, regionOf);
    const result = chooseTargetGroupBackgrounds({
      presence: { id: 'presence', sid: 1, lat: 60, lng: 10, iso: '2024-08-15' },
      index,
      count: 1,
      rng,
      regionOf,
      distanceKm,
      radiusKm: 50,
      monthWindow: 1
    });

    expect(result.tier).toBe('local_seasonal');
    expect(result.rows.map((row) => row.id)).toEqual(['best']);
  });

  it('falls back within the same region without using the target species', () => {
    const train = [
      { id: 'same-species', sid: 1, lat: 60, lng: 10, iso: '2020-08-10' },
      { id: 'fallback', sid: 2, lat: 66, lng: 10, iso: '2020-02-10' }
    ];
    const index = buildTargetGroupIndex(train, regionOf);
    const result = chooseTargetGroupBackgrounds({
      presence: { id: 'presence', sid: 1, lat: 60, lng: 10, iso: '2024-08-15' },
      index,
      count: 1,
      rng,
      regionOf,
      distanceKm,
      radiusKm: 50,
      monthWindow: 1
    });

    expect(result.tier).toBe('regional_any_season');
    expect(result.rows[0].id).toBe('fallback');
  });

  it('creates stable half-degree spatial CV blocks', () => {
    expect(spatialBlock(59.91, 10.75)).toBe(spatialBlock(59.99, 10.99));
    expect(spatialBlock(59.91, 10.75)).not.toBe(spatialBlock(60.51, 10.75));
  });
});
