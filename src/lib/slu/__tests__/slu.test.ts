import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSwedishForestProperties, isWithinSweden, parseCorineForestType } from '../skogskarta';

/**
 * Fixtures shaped after the live CORINE Land Cover 2018 ArcGIS `identify`
 * response (captured 2026-05-25). Each query returns up to two layers:
 *   - layerId 0 (vector): one entry per polygon within the tolerance — can be
 *     several, hence ambiguous for a point.
 *   - layerId 1 (raster): the single pixel under the point, with Raster.CODE_18
 *     and a human Raster.LABEL3. NoData pixels (ocean) carry no code.
 */
interface FixtureOpts {
  /** Raster pixel code; null = NoData; omit = no raster layer in the response. */
  rasterCode?: string | null;
  rasterLabel?: string;
  /** Vector polygon codes (layerId 0), in tolerance order. */
  vectorCodes?: string[];
}

function corine(opts: FixtureOpts): { results: unknown[] } {
  const results: unknown[] = [];
  for (const code of opts.vectorCodes ?? []) {
    results.push({ layerId: 0, value: code, attributes: { Code_18: code } });
  }
  if ('rasterCode' in opts) {
    const attributes =
      opts.rasterCode === null
        ? { 'UniqueValue.Pixel Value': 'NoData' }
        : { 'Raster.CODE_18': opts.rasterCode as string, 'Raster.LABEL3': opts.rasterLabel ?? '' };
    results.push({ layerId: 1, attributes });
  }
  return { results };
}

function mockFetch(json: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => json } as Response);
}

describe('isWithinSweden', () => {
  it('returns true for Stockholm', () => {
    expect(isWithinSweden({ lat: 59.33, lon: 18.07 })).toBe(true);
  });

  it('returns true for inland Dalarna', () => {
    expect(isWithinSweden({ lat: 60.0, lon: 15.0 })).toBe(true);
  });

  it('returns false for Oslo', () => {
    expect(isWithinSweden({ lat: 59.9, lon: 10.75 })).toBe(false);
  });
});

describe('parseCorineForestType', () => {
  it('maps coniferous (312) → bar from the raster pixel', () => {
    expect(parseCorineForestType(corine({ rasterCode: '312', rasterLabel: 'Coniferous forest' }))).toBe('bar');
  });

  it('maps broad-leaved (311) → lauv', () => {
    expect(parseCorineForestType(corine({ rasterCode: '311' }))).toBe('lauv');
  });

  it('maps mixed (313) and transitional woodland (324) → blandet', () => {
    expect(parseCorineForestType(corine({ rasterCode: '313' }))).toBe('blandet');
    expect(parseCorineForestType(corine({ rasterCode: '324' }))).toBe('blandet');
  });

  it('returns null for a non-forest class (urban 111)', () => {
    expect(parseCorineForestType(corine({ rasterCode: '111', rasterLabel: 'Continuous urban fabric' }))).toBeNull();
  });

  it('returns null for a NoData (ocean) pixel', () => {
    expect(parseCorineForestType(corine({ rasterCode: null }))).toBeNull();
  });

  it('trusts the raster pixel over vector polygons (urban pixel beats a stray forest polygon)', () => {
    // Vector tolerance caught a 312 polygon nearby, but the pixel here is urban.
    expect(parseCorineForestType(corine({ rasterCode: '111', vectorCodes: ['312', '512'] }))).toBeNull();
  });

  it('falls back to a vector forest polygon when no raster layer is present', () => {
    expect(parseCorineForestType(corine({ vectorCodes: ['312'] }))).toBe('bar');
  });

  it('returns null when vector polygons are all non-forest', () => {
    expect(parseCorineForestType(corine({ vectorCodes: ['111', '512', '523'] }))).toBeNull();
  });

  it('returns null for empty or malformed responses', () => {
    expect(parseCorineForestType({ results: [] })).toBeNull();
    expect(parseCorineForestType({})).toBeNull();
    expect(parseCorineForestType(null)).toBeNull();
  });
});

describe('getSwedishForestProperties', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a Swedish coniferous point to ForestProperties (source=corine, numeric fields null)', async () => {
    const fetchMock = mockFetch(corine({ rasterCode: '312', rasterLabel: 'Coniferous forest' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getSwedishForestProperties({ lat: 60.0, lon: 15.0 });

    expect(result).toEqual({
      forestType: 'bar',
      ageYears: null,
      productivity: null,
      volumePerHa: null,
      source: 'corine'
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps a broad-leaved point to lauv', async () => {
    vi.stubGlobal('fetch', mockFetch(corine({ rasterCode: '311' })));
    const result = await getSwedishForestProperties({ lat: 60.0, lon: 15.0 });
    expect(result?.forestType).toBe('lauv');
  });

  it('returns null on a non-forest (urban) point', async () => {
    vi.stubGlobal('fetch', mockFetch(corine({ rasterCode: '111' })));
    expect(await getSwedishForestProperties({ lat: 59.33, lon: 18.07 })).toBeNull();
  });

  it('returns null on a NoData (ocean) point', async () => {
    vi.stubGlobal('fetch', mockFetch(corine({ rasterCode: null })));
    expect(await getSwedishForestProperties({ lat: 60.0, lon: 15.0 })).toBeNull();
  });

  it('does not hit the network for non-Swedish coordinates', async () => {
    const fetchMock = mockFetch(corine({ rasterCode: '312' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getSwedishForestProperties({ lat: 59.9, lon: 10.75 }); // Oslo

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when CORINE responds non-ok', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false));
    expect(await getSwedishForestProperties({ lat: 60.0, lon: 15.0 })).toBeNull();
  });

  it('returns null when the fetch throws (network/timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await getSwedishForestProperties({ lat: 60.0, lon: 15.0 })).toBeNull();
  });
});
