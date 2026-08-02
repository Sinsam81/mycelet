import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getElevation } from '@/lib/terrain';

/**
 * Kartverkets høydetjeneste dekker bare Norge. Rutenettene i /api/prediction/grid
 * og /api/prediction/species-spots kaller getElevation én gang per celle — opptil
 * 196 kall per «Lovende steder»-trykk. Uten regionsjekken gikk alle sammen til
 * Geonorge også for svenske koordinater, der svaret alltid er tomt.
 */
describe('getElevation regionsvakt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('slår ikke opp høyde for svenske koordinater', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Göteborg — utenfor DTM-dekningen.
    const result = await getElevation({ lat: 57.71, lon: 11.97 });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('slår ikke opp høyde utenfor Norden i det hele tatt', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Null Island.
    expect(await getElevation({ lat: 0, lon: 0 })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('slår fortsatt opp høyde for norske koordinater', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ punkter: [{ z: 2.74, terreng: 'ÅpentOmråde' }] })
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await getElevation({ lat: 59.91, lon: 10.75 });

    expect(result).toEqual({ elevationM: 2.74, terrainClass: 'ÅpentOmråde' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
