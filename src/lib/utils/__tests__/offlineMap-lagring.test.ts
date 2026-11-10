import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NoTilesCachedError,
  TERRAIN_TILE_TEMPLATE,
  TILE_FETCH_CONCURRENCY,
  TILE_FETCH_TIMEOUT_MS,
  TILE_TIMEOUTS_BEFORE_GIVING_UP,
  cacheMapTilesForArea,
  getTileUrlsForBounds
} from '../offlineMap';

/**
 * Lagring av et kartområde på dårlig dekning.
 *
 * Før: én Promise.all over opptil 550 fetch uten frist. Én flis som verken
 * svarte eller feilet holdt «lagrer …» åpen for alltid. Disse testene låser at
 * funksjonen ALLTID blir ferdig, med et ærlig tall for hva som ble lagret — og
 * at «ingenting ble lagret» er en feil, ikke et resultat med null i.
 */

const BOUNDS = { south: 59.85, west: 10.6, north: 59.96, east: 10.9 };
const ZOOM = [11, 12];
const ALLE = Array.from(new Set(ZOOM.flatMap((z) => getTileUrlsForBounds(BOUNDS, z, TERRAIN_TILE_TEMPLATE))));

type FetchImpl = (url: string, signal: AbortSignal) => Promise<Response>;

function settOppMiljo(fetchImpl: FetchImpl, alleredeLagret: string[] = []) {
  const lagret = new Map<string, Response>(alleredeLagret.map((u) => [u, new Response('x')]));
  const cache = {
    match: vi.fn(async (req: Request) => lagret.get(req.url)),
    put: vi.fn(async (req: Request, res: Response) => {
      lagret.set(req.url, res);
    })
  };
  const tilstand = { samtidige: 0, maksSamtidige: 0, kall: 0 };
  const fetchMock = vi.fn(async (req: Request, init?: { signal?: AbortSignal }) => {
    tilstand.kall += 1;
    tilstand.samtidige += 1;
    tilstand.maksSamtidige = Math.max(tilstand.maksSamtidige, tilstand.samtidige);
    try {
      return await fetchImpl(req.url, init!.signal!);
    } finally {
      tilstand.samtidige -= 1;
    }
  });
  vi.stubGlobal('window', { caches: {} });
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  vi.stubGlobal('fetch', fetchMock);
  return { lagret, tilstand };
}

/** En flis som aldri svarer — men som gir seg når forespørselen avbrytes, slik fetch gjør. */
const henger: FetchImpl = (_url, signal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

const svarerOk: FetchImpl = async () => new Response('flis', { status: 200 });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cacheMapTilesForArea', () => {
  it('har nok fliser i testområdet til at køen betyr noe', () => {
    expect(ALLE.length).toBeGreaterThan(TILE_FETCH_CONCURRENCY * 2);
  });

  it('lagrer alle flisene når nettet svarer', async () => {
    const { lagret } = settOppMiljo(svarerOk);
    const resultat = await cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    expect(resultat).toEqual({ cached: ALLE.length, failed: 0 });
    expect(new Set(lagret.keys())).toEqual(new Set(ALLE));
  });

  it(`henter aldri flere enn ${TILE_FETCH_CONCURRENCY} fliser samtidig`, async () => {
    // Hver flis bruker litt tid, så arbeiderne faktisk overlapper.
    const { tilstand } = settOppMiljo(
      () => new Promise((resolve) => setTimeout(() => resolve(new Response('flis', { status: 200 })), 50))
    );
    const lover = cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    await vi.advanceTimersByTimeAsync(50 * ALLE.length);
    await lover;
    expect(tilstand.maksSamtidige).toBe(TILE_FETCH_CONCURRENCY);
  });

  it('teller en flis som henger som feilet, og blir ferdig', async () => {
    const treg = ALLE[3];
    settOppMiljo((url, signal) => (url === treg ? henger(url, signal) : svarerOk(url, signal)));
    const lover = cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    await vi.advanceTimersByTimeAsync(TILE_FETCH_TIMEOUT_MS + 1);
    await expect(lover).resolves.toEqual({ cached: ALLE.length - 1, failed: 1 });
  });

  it('gir opp resten når nettet ikke svarer i det hele tatt, i stedet for å vente ut hver flis', async () => {
    const { tilstand } = settOppMiljo(henger);
    const lover = cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    // Ingen flis ble lagret, så løftet avvises (se blokka under). Fang det før
    // klokka skrus fram, ellers rekker avvisningen å bli stående uhåndtert.
    const utfall = lover.catch((feil: unknown) => feil);
    // To runder med frister er nok til å nå grensa — ikke én frist per flis.
    const runder = Math.ceil(TILE_TIMEOUTS_BEFORE_GIVING_UP / TILE_FETCH_CONCURRENCY) + 1;
    await vi.advanceTimersByTimeAsync(TILE_FETCH_TIMEOUT_MS * runder + 1);
    const feil = await utfall;
    expect(feil).toBeInstanceOf(NoTilesCachedError);
    expect((feil as NoTilesCachedError).failed).toBe(ALLE.length);
    expect(tilstand.kall).toBeLessThan(ALLE.length);
  });

  it('bruker ikke nettet på fliser som allerede ligger i cachen', async () => {
    const { tilstand } = settOppMiljo(svarerOk, ALLE.slice(0, 5));
    const resultat = await cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    expect(resultat).toEqual({ cached: ALLE.length, failed: 0 });
    expect(tilstand.kall).toBe(ALLE.length - 5);
  });

  it('teller HTTP-feil som feilet uten å regne dem som frister', async () => {
    // Én flis går bra, resten svarer 503. Var HTTP-feil blitt regnet som
    // frister, hadde lagringen gitt opp etter tolv og aldri spurt om resten.
    const ok = ALLE[ALLE.length - 1];
    const { tilstand } = settOppMiljo(async (url) =>
      url === ok ? new Response('flis', { status: 200 }) : new Response('nei', { status: 503 })
    );
    const resultat = await cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    expect(resultat).toEqual({ cached: 1, failed: ALLE.length - 1 });
    expect(tilstand.kall).toBe(ALLE.length);
  });
});

/**
 * Ingen fliser lagret = feil, ikke { cached: 0 }.
 *
 * Kartets «Lagre kartområde» legger resultatet øverst i lista over lagrede
 * områder og kaster det eldste ut når lista har åtte — med flisene. Da
 * lagringen fikk frist og begynte å bli ferdig på et nett som henger, byttet et
 * forsøk på én strek ut et ekte, nedlastet område mot et tomt, og hvert nytt
 * forsøk tok ett til. Et avvist løfte sender kallstedet til sin catch, der
 * verken lista eller flisene røres.
 */
describe('cacheMapTilesForArea: ingenting lagret', () => {
  it('avviser når nettet er helt borte', async () => {
    const { lagret } = settOppMiljo(async () => {
      throw new TypeError('Failed to fetch');
    });
    const feil = await cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE).catch((e: unknown) => e);
    expect(feil).toBeInstanceOf(NoTilesCachedError);
    expect((feil as NoTilesCachedError).failed).toBe(ALLE.length);
    expect(lagret.size).toBe(0);
  });

  it('avviser når flisserveren bare gir feil', async () => {
    settOppMiljo(async () => new Response('nei', { status: 503 }));
    await expect(cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE)).rejects.toBeInstanceOf(
      NoTilesCachedError
    );
  });

  it('avviser når nettleseren ikke har noe sted å lagre fliser', async () => {
    // Før ga dette { cached: 0, failed: 0 }, som kartet kvitterte med «Område
    // lagret. 0 kartfliser klare offline» — og kastet ut et område for.
    settOppMiljo(svarerOk);
    vi.stubGlobal('window', {});
    const feil = await cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE).catch((e: unknown) => e);
    expect(feil).toBeInstanceOf(NoTilesCachedError);
    expect((feil as NoTilesCachedError).failed).toBe(0);
  });

  it('regner området som lagret så lenge minst én flis ligger der, selv uten nett', async () => {
    // Fliser som lå i cachen fra før er ekte offline-kart. Da er dette en
    // lagring med et ærlig tall, ikke en feil.
    settOppMiljo(async () => {
      throw new TypeError('Failed to fetch');
    }, ALLE.slice(0, 3));
    const resultat = await cacheMapTilesForArea(BOUNDS, ZOOM, TERRAIN_TILE_TEMPLATE);
    expect(resultat).toEqual({ cached: 3, failed: ALLE.length - 3 });
  });

  it('er en Error med navn, så kallstedet kan skille den fra andre feil', () => {
    const feil = new NoTilesCachedError(7);
    expect(feil).toBeInstanceOf(Error);
    expect(feil.name).toBe('NoTilesCachedError');
    expect(feil.failed).toBe(7);
  });
});
