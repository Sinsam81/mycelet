import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PointCache } from '@/lib/cache/point-cache';
import { getElevation, clearElevationCache } from '@/lib/terrain';

describe('PointCache', () => {
  it('gir treff på samme punkt', () => {
    const cache = new PointCache<number>({ ttlMs: 1000, maxEntries: 10 });
    cache.set(59.9139, 10.7522, 42);
    expect(cache.get(59.9139, 10.7522)).toEqual({ hit: true, value: 42 });
  });

  it('runder til ~11 m, så nabopunkter innenfor samme rastercelle deler svar', () => {
    const cache = new PointCache<number>({ ttlMs: 1000, maxEntries: 10 });
    cache.set(59.91391, 10.75221, 42);
    expect(cache.get(59.913912, 10.752209).hit).toBe(true);
    // Men et punkt en desimal unna er et annet sted.
    expect(cache.get(59.9149, 10.7522).hit).toBe(false);
  });

  it('cacher også null, som er det radius-utvidelsen tramper gjennom flest av', () => {
    const cache = new PointCache<number | null>({ ttlMs: 1000, maxEntries: 10 });
    cache.set(59.9, 10.7, null);
    expect(cache.get(59.9, 10.7)).toEqual({ hit: true, value: null });
  });

  it('utløper etter ttl', () => {
    vi.useFakeTimers();
    const cache = new PointCache<number>({ ttlMs: 1000, maxEntries: 10 });
    cache.set(59.9, 10.7, 1);
    vi.advanceTimersByTime(999);
    expect(cache.get(59.9, 10.7).hit).toBe(true);
    vi.advanceTimersByTime(2);
    expect(cache.get(59.9, 10.7).hit).toBe(false);
    vi.useRealTimers();
  });

  it('lar ett innslag ha kortere levetid enn standarden', () => {
    vi.useFakeTimers();
    const cache = new PointCache<number | null>({ ttlMs: 100_000, maxEntries: 10 });
    cache.set(59.9, 10.7, null, 1000); // «ingen data» — kan være en tjeneste som var nede
    cache.set(60.9, 10.7, 5); // ekte måling
    vi.advanceTimersByTime(2000);
    expect(cache.get(59.9, 10.7).hit).toBe(false);
    expect(cache.get(60.9, 10.7).hit).toBe(true);
    vi.useRealTimers();
  });

  it('kaster de eldste innslagene når taket nås', () => {
    const cache = new PointCache<number>({ ttlMs: 1000, maxEntries: 3 });
    cache.set(1, 1, 1);
    cache.set(2, 2, 2);
    cache.set(3, 3, 3);
    cache.set(4, 4, 4);
    expect(cache.size).toBe(3);
    expect(cache.get(1, 1).hit).toBe(false);
    expect(cache.get(4, 4).hit).toBe(true);
  });
});

/**
 * «Lovende steder» sampler 49 celler og slår opp høyde per celle, og klienten
 * utvider radien over [5, 10, 20, 35] km. Trykker brukeren knappen to ganger fra
 * samme sted, er cellesentrene identiske — uten cache betalte begge trykkene
 * full pris mot Kartverket.
 */
describe('getElevation bruker cachen', () => {
  beforeEach(() => {
    clearElevationCache();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearElevationCache();
  });

  it('slår opp samme punkt bare én gang', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ punkter: [{ z: 120, terreng: 'Skog' }] })
    });
    vi.stubGlobal('fetch', fetchSpy);

    const first = await getElevation({ lat: 59.9139, lon: 10.7522 });
    const second = await getElevation({ lat: 59.9139, lon: 10.7522 });

    expect(first).toEqual({ elevationM: 120, terrainClass: 'Skog' });
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('slår fortsatt opp et nytt punkt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ punkter: [{ z: 120, terreng: 'Skog' }] })
    });
    vi.stubGlobal('fetch', fetchSpy);

    await getElevation({ lat: 59.9139, lon: 10.7522 });
    await getElevation({ lat: 60.4, lon: 5.32 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
