import { describe, expect, it } from 'vitest';
import { getRegion, isNordic } from '../region';

// All cities checked against real coordinates so the tests double as a
// sanity table — if someone tweaks the bounding boxes and Oslo no longer
// resolves to NO, that's a real regression.

describe('getRegion — Norwegian cities', () => {
  it('Oslo resolves to NO', () => {
    expect(getRegion(59.9139, 10.7522)).toBe('NO');
  });

  it('Bergen resolves to NO', () => {
    expect(getRegion(60.3913, 5.3221)).toBe('NO');
  });

  it('Tromsø resolves to NO (high latitude)', () => {
    expect(getRegion(69.6492, 18.9553)).toBe('NO');
  });

  it('Stavanger resolves to NO', () => {
    expect(getRegion(58.969, 5.7331)).toBe('NO');
  });

  it('Trondheim resolves to NO', () => {
    expect(getRegion(63.4305, 10.3951)).toBe('NO');
  });
});

describe('getRegion — Swedish cities', () => {
  it('Stockholm resolves to SE', () => {
    expect(getRegion(59.3293, 18.0686)).toBe('SE');
  });

  // NB: Göteborg lives in the "known imprecisions" block — see bottom
  // of this file. The lon=12.5 overlap split routes it to NO, which is
  // wrong but documented.

  it('Malmö resolves to SE', () => {
    expect(getRegion(55.6049, 13.0038)).toBe('SE');
  });

  it('Umeå resolves to SE (north)', () => {
    expect(getRegion(63.8258, 20.263)).toBe('SE');
  });

  it('Kiruna resolves to SE (far north)', () => {
    expect(getRegion(67.8558, 20.2253)).toBe('SE');
  });
});

describe('getRegion — non-Nordic locations resolve to other', () => {
  it('London → other', () => {
    expect(getRegion(51.5074, -0.1278)).toBe('other');
  });

  it('Berlin → other (south of both boxes)', () => {
    expect(getRegion(52.52, 13.405)).toBe('other');
  });

  it('Reykjavik → other (west of both boxes)', () => {
    expect(getRegion(64.1466, -21.9426)).toBe('other');
  });

  it('New York → other', () => {
    expect(getRegion(40.7128, -74.006)).toBe('other');
  });
});

describe('getRegion — overlap zone (lon 12.5 split rule)', () => {
  // Coordinates inside BOTH bounding boxes (lat 58-69, lon 11-24).
  // Rule: lon < 12.5 → NO, lon >= 12.5 → SE.

  it('overlap with lon < 12.5 → NO', () => {
    expect(getRegion(60.0, 11.5)).toBe('NO');
  });

  it('overlap exactly at lon = 12.5 → SE (>= side)', () => {
    expect(getRegion(60.0, 12.5)).toBe('SE');
  });

  it('overlap with lon = 12.4 → NO (just below split)', () => {
    expect(getRegion(60.0, 12.4)).toBe('NO');
  });

  it('overlap with lon = 12.51 → SE (just above split)', () => {
    expect(getRegion(60.0, 12.51)).toBe('SE');
  });
});

describe('getRegion — bounding-box edges', () => {
  it('NO south edge (lat 57.7) inside', () => {
    // lat exactly at NORWAY.minLat
    expect(getRegion(57.7, 8.0)).toBe('NO');
  });

  it('NO north edge (lat 71.5) inside', () => {
    expect(getRegion(71.5, 25.0)).toBe('NO');
  });

  it('Just below NO south edge → other', () => {
    expect(getRegion(57.69, 8.0)).toBe('other');
  });

  it('Just north of NO → other', () => {
    expect(getRegion(71.51, 25.0)).toBe('other');
  });

  it('SE west edge (lon 10.9) inside', () => {
    // Sweden box minLon
    expect(getRegion(60.0, 10.9)).toBe('NO'); // overlap, lon < 12.5 wins for NO
  });

  it('SE east edge (lon 24.2) inside', () => {
    expect(getRegion(60.0, 24.2)).toBe('SE');
  });
});

describe('isNordic — convenience wrapper', () => {
  it('returns true for Oslo', () => {
    expect(isNordic(59.9139, 10.7522)).toBe(true);
  });

  it('returns true for Stockholm', () => {
    expect(isNordic(59.3293, 18.0686)).toBe(true);
  });

  it('returns false for London', () => {
    expect(isNordic(51.5074, -0.1278)).toBe(false);
  });

  it('returns false for Reykjavik', () => {
    expect(isNordic(64.1466, -21.9426)).toBe(false);
  });
});

describe('getRegion — known imprecisions (documented, not bugs)', () => {
  // Bounding rectangles can't precisely separate countries with
  // intermingled coastlines or borders that don't align with lat/lon
  // axes. We document these cases here so they don't surprise anyone
  // and so a future polygon-based implementation can use these as
  // regression tests for the upgrade.
  //
  // Practical impact: when the wrong country is picked, the corresponding
  // weather adapter (Frost or SMHI) returns null because no station
  // covers the location, and fetchWeatherSummary falls back gracefully
  // to OpenWeather (or 502). No data corruption — just degraded
  // accuracy on edge-of-border coordinates.

  it('Helsinki incorrectly resolves to NO (Norway box extends too far east)', () => {
    // Helsinki at (60.17, 24.94): Norway box maxLon=31.5 catches it,
    // Sweden maxLon=24.2 doesn't. So function returns NO. Real answer:
    // Finland → other.
    expect(getRegion(60.1699, 24.9384)).toBe('NO');
  });

  it('Copenhagen incorrectly resolves to SE (Sweden box extends too far south)', () => {
    // Copenhagen at (55.68, 12.57): Sweden minLat=55.2 catches it,
    // Norway minLat=57.7 doesn't. Returns SE. Real answer: Denmark →
    // other. Also: Malmö at (55.60, 13.00) is south of Copenhagen yet
    // Swedish, so a horizontal lat cut can't separate them.
    expect(getRegion(55.6761, 12.5683)).toBe('SE');
  });

  it('Göteborg resolves to NO due to overlap rule (lon 11.97 < 12.5)', () => {
    // Göteborg at (57.71, 11.97) is inside both boxes, so the lon=12.5
    // overlap split sends it to NO. Sweden's second-largest city should
    // probably go to SE, but the lon split was tuned for the inland
    // border further north.
    expect(getRegion(57.7089, 11.9746)).toBe('NO');
  });
});
