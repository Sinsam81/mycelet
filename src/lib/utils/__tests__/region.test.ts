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

  it('Göteborg resolves to SE', () => {
    // Inside both boxes; the latitude-aware border (~11.4°E here) correctly
    // routes Sweden's second-largest city to SE (the old fixed 12.5 sent it to NO).
    expect(getRegion(57.7089, 11.9746)).toBe('SE');
  });

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

describe('getRegion — overlap zone (latitude-aware NO/SE border)', () => {
  // Coordinates inside BOTH bounding boxes (lat 58-69, lon 11-24) are split by
  // an approximate border longitude that grows with latitude. At lat 60 the
  // border is ~12.0°E: west → NO, at/east → SE.

  it('overlap west of the border → NO', () => {
    expect(getRegion(60.0, 11.5)).toBe('NO');
  });

  it('overlap at/east of the border → SE', () => {
    expect(getRegion(60.0, 12.0)).toBe('SE');
  });

  it('overlap just west of the border → NO', () => {
    expect(getRegion(60.0, 11.9)).toBe('NO');
  });

  it('overlap just east of the border → SE', () => {
    expect(getRegion(60.0, 12.1)).toBe('SE');
  });

  it('border moves east with latitude (same lon, different country)', () => {
    // At 57.7°N the border is ~11.4, so 11.97°E (Göteborg) is SE…
    expect(getRegion(57.7089, 11.9746)).toBe('SE');
    // …but the same longitude at lat 64 is well west of the border → NO.
    expect(getRegion(64.0, 11.9746)).toBe('NO');
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
    // Sweden box minLon — still west of the lat-60 border (~12.0°E) → NO
    expect(getRegion(60.0, 10.9)).toBe('NO');
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

describe('getRegion — Bohuslän coast vs Halden (border refinement)', () => {
  // The Swedish Bohuslän coast lies WEST of the old fixed 11.4°E cutoff at
  // lat ≤ 59, so Strömstad/Grebbestad/Fjällbacka were misclassified as NO →
  // blank Kartverket map + wrong weather provider for users vacationing there.
  // The refined border (11.0 south of Iddefjorden, steep rise to 11.48 by
  // 59.1°N) fixes them while keeping Halden/Tistedal Norwegian.

  it('Strömstad resolves to SE', () => {
    expect(getRegion(58.9366, 11.1706)).toBe('SE');
  });

  it('Grebbestad resolves to SE', () => {
    expect(getRegion(58.6968, 11.2532)).toBe('SE');
  });

  it('Fjällbacka resolves to SE', () => {
    expect(getRegion(58.5995, 11.2841)).toBe('SE');
  });

  it('Kosteröarna resolve to SE', () => {
    expect(getRegion(58.89, 11.04)).toBe('SE');
  });

  it('Halden stays NO', () => {
    expect(getRegion(59.1215, 11.3875)).toBe('NO');
  });

  it('Tistedal (east of Halden) stays NO', () => {
    expect(getRegion(59.14, 11.44)).toBe('NO');
  });

  it('Fredrikstad stays NO', () => {
    expect(getRegion(59.2181, 10.9298)).toBe('NO');
  });

  it('Sarpsborg stays NO', () => {
    expect(getRegion(59.2839, 11.1096)).toBe('NO');
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

});
