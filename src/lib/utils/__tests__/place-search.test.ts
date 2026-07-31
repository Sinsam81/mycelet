import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces, searchPlacesServer } from '../place-search';

function photonResponse(features: unknown[]) {
  return { ok: true, json: async () => ({ features }) } as unknown as Response;
}

function photonFeature(
  name: string,
  countrycode: string,
  lat: number,
  lng: number,
  extra: Record<string, unknown> = {}
) {
  return {
    properties: { name, countrycode, ...extra },
    geometry: { coordinates: [lng, lat] }
  };
}

describe('searchPlacesServer (upstream)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('returns nothing for a too-short query without hitting the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await searchPlacesServer('H')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('finds Swedish places — the case Kartverket answered with wrong Norwegian ones', async () => {
    // Regression guard: «Uppsala» used to return «Oppsal, Hjartdal» (NO).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        photonResponse([photonFeature('Uppsala', 'SE', 59.86, 17.64, { county: 'Uppsala län', osm_value: 'city' })])
      )
    );
    const results = await searchPlacesServer('Uppsala');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Uppsala');
    expect(results[0].context).toContain('Sverige');
    expect(results[0].lat).toBeCloseTo(59.86, 1);
  });

  it('finds Norwegian places too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        photonResponse([photonFeature('Hamar', 'NO', 60.79, 11.07, { county: 'Innlandet', osm_value: 'town' })])
      )
    );
    const results = await searchPlacesServer('Hamar');
    expect(results[0].context).toContain('Norge');
    expect(results[0].context).toContain('Innlandet');
  });

  it('drops places outside Norway and Sweden (no weather/forest data there)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        photonResponse([
          photonFeature('København', 'DK', 55.68, 12.57, { osm_value: 'city' }),
          photonFeature('Berlin', 'DE', 52.52, 13.4, { osm_value: 'city' }),
          photonFeature('Malmö', 'SE', 55.6, 13.0, { osm_value: 'city' })
        ])
      )
    );
    const results = await searchPlacesServer('malm');
    expect(results.map((r) => r.name)).toEqual(['Malmö']);
  });

  it('ranks towns above lakes and farms with the same name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        photonResponse([
          photonFeature('Sälen', 'SE', 61.0, 13.0, { osm_value: 'farm' }),
          photonFeature('Sälen', 'SE', 61.16, 13.27, { osm_value: 'village' })
        ])
      )
    );
    const results = await searchPlacesServer('Sälen');
    expect(results[0].lat).toBeCloseTo(61.16, 1); // the village, not the farm
  });

  it('de-duplicates the same place returned as node and area', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        photonResponse([
          photonFeature('Göteborg', 'SE', 57.7089, 11.9746, { osm_value: 'city' }),
          photonFeature('Göteborg', 'SE', 57.7091, 11.9748, { osm_value: 'city' })
        ])
      )
    );
    expect(await searchPlacesServer('Göteborg')).toHaveLength(1);
  });

  it('falls back to Kartverket when Photon fails', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          navn: [
            {
              'skrivemåte': 'Hamar',
              navneobjekttype: 'By',
              kommuner: [{ kommunenavn: 'Hamar' }],
              representasjonspunkt: { nord: 60.79, 'øst': 11.07 }
            }
          ]
        })
      });
    vi.stubGlobal('fetch', fetchSpy);

    const results = await searchPlacesServer('Hamar');
    expect(results[0].name).toBe('Hamar');
    expect(results[0].context).toContain('Norge');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns [] when both providers fail — never throws at the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await searchPlacesServer('Hamar')).toEqual([]);
  });

  it('still reaches Kartverket when Photon aborts its own deadline', async () => {
    // Regression guard: both providers used to share ONE AbortSignal, so a
    // slow (not instantly-failing) Photon burned the budget and handed
    // Kartverket an already-aborted signal — killing the fallback in exactly
    // the case it exists for. Each provider now gets its own deadline.
    const fetchSpy = vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
      const signal = init?.signal;
      if (String(_url).includes('photon')) {
        // Simulate the signal firing rather than the request failing fast.
        const err = new Error('The operation was aborted') as Error & { name: string };
        err.name = 'TimeoutError';
        throw err;
      }
      expect(signal?.aborted).toBe(false); // the fallback must get a live signal
      return {
        ok: true,
        json: async () => ({
          navn: [
            {
              'skrivemåte': 'Hamar',
              navneobjekttype: 'By',
              kommuner: [{ kommunenavn: 'Hamar' }],
              representasjonspunkt: { nord: 60.79, 'øst': 11.07 }
            }
          ]
        })
      };
    });
    vi.stubGlobal('fetch', fetchSpy);

    const results = await searchPlacesServer('Hamar');
    expect(results[0].name).toBe('Hamar');
  });
});

describe('searchPlaces (client → /api/places proxy)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('calls our own proxy, never a third-party host directly', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ places: [] }) } as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);
    await searchPlaces('Hamar');
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('/api/places?q=Hamar');
    expect(url).not.toContain('komoot');
    expect(url).not.toContain('geonorge');
  });

  it('returns the proxied places', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ places: [{ name: 'Sälen', context: 'Dalarna · Sverige', lat: 61.16, lng: 13.27 }] })
    } as unknown as Response));
    const results = await searchPlaces('Sälen');
    expect(results[0].name).toBe('Sälen');
  });

  it('returns [] when the proxy errors — typeahead must never throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response));
    expect(await searchPlaces('Hamar')).toEqual([]);
  });
});
