import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Engangsoppslagene og tiden målingen bærer.
 *
 * getOptionalPosition (identifiseringen) skal gi ut plattformens eget
 * tidsstempel: i iOS-skallet ser pluginen bort fra maximumAge, og
 * CoreLocation kan svare med en posisjon fra lenge før trykket på
 * «Identifiser». Resultatsiden kan bare se det på dette feltet.
 *
 * De andre engangsoppslagene (forsidekortet, kalenderen, «Bruk min posisjon»)
 * skal gi akkurat det de alltid har gitt: koordinatene, ingenting mer.
 *
 * Enheten er millisekunder siden epoken på begge plattformer —
 * GeolocationPosition.timestamp i nettleseren, og @capacitor/geolocation sin
 * `timestamp`, som iOS fyller fra CLLocation.timestamp
 * (millisecondsSinceUnixEpoch).
 */

let native = true;
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => native }));

/** Fast «nå», så testene ikke avhenger av dagens dato. */
const NAA = 1_800_000_000_000;
const FORTIMEN = NAA - 40 * 60_000;

let svar: unknown;
const plugin = {
  requestPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
  checkPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
  getCurrentPosition: vi.fn(async () => svar),
  clearWatch: vi.fn(async () => {})
};

/**
 * Som Capacitors registerPlugin-proxy: alle ukjente egenskapsnavn — også
 * `then` — blir en metode som avviser. Se useGeolocation-native.test.ts.
 */
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: new Proxy(
    {},
    {
      get(_m, prop) {
        if (prop === '$typeof') return undefined;
        if (prop in plugin) return plugin[prop as keyof typeof plugin];
        return () => Promise.reject(new Error(`"Geolocation.${String(prop)}()" is not implemented on ios`));
      }
    }
  )
}));

/** Nettleserens API, med svaret testen bestemmer. */
function nettleser(posisjon: unknown) {
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (suksess: (p: unknown) => void) => suksess(posisjon)
    },
    permissions: { query: async () => ({ state: 'granted' }) }
  });
}

beforeEach(() => {
  native = true;
  // Den lagrede posisjonen CoreLocation deler ut først: førti minutter gammel.
  svar = { timestamp: FORTIMEN, coords: { latitude: 59.9706, longitude: 10.7286, accuracy: 65 } };
  for (const metode of Object.values(plugin)) metode.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getOptionalPosition — fixet bærer tiden det ble målt', () => {
  it('i skallet: pluginens tidsstempel følger med', async () => {
    const { getOptionalPosition } = await import('../useGeolocation');
    await expect(getOptionalPosition()).resolves.toStrictEqual({
      fix: { latitude: 59.9706, longitude: 10.7286, timestamp: FORTIMEN },
      tidsavbrudd: false
    });
  });

  it('i nettleseren: GeolocationPosition.timestamp følger med', async () => {
    native = false;
    nettleser({ timestamp: NAA - 1_500, coords: { latitude: 57.7089, longitude: 11.9746, accuracy: 20 } });
    const { getOptionalPosition } = await import('../useGeolocation');
    await expect(getOptionalPosition()).resolves.toStrictEqual({
      fix: { latitude: 57.7089, longitude: 11.9746, timestamp: NAA - 1_500 },
      tidsavbrudd: false
    });
  });

  it.each([undefined, null, Number.NaN, 0, -5, 'i går'])(
    'et ubrukelig tidsstempel (%s) utelates — aldri gjettet',
    async (tidsstempel) => {
      svar = { timestamp: tidsstempel, coords: { latitude: 59.9706, longitude: 10.7286, accuracy: 65 } };
      const { getOptionalPosition } = await import('../useGeolocation');
      const { fix } = await getOptionalPosition();
      expect(fix).toStrictEqual({ latitude: 59.9706, longitude: 10.7286 });
    }
  );
});

describe('de andre engangsoppslagene gir bare koordinatene, som før', () => {
  it('getCurrentPositionOnce i skallet', async () => {
    const { getCurrentPositionOnce } = await import('../useGeolocation');
    await expect(getCurrentPositionOnce()).resolves.toStrictEqual({ latitude: 59.9706, longitude: 10.7286 });
  });

  it('getCurrentPositionIfGranted i skallet', async () => {
    const { getCurrentPositionIfGranted } = await import('../useGeolocation');
    await expect(getCurrentPositionIfGranted()).resolves.toStrictEqual({ latitude: 59.9706, longitude: 10.7286 });
  });

  it('getCurrentPositionOnce og getCurrentPositionIfGranted i nettleseren', async () => {
    native = false;
    nettleser({ timestamp: NAA - 1_500, coords: { latitude: 57.7089, longitude: 11.9746, accuracy: 20 } });
    const { getCurrentPositionOnce, getCurrentPositionIfGranted } = await import('../useGeolocation');
    await expect(getCurrentPositionOnce()).resolves.toStrictEqual({ latitude: 57.7089, longitude: 11.9746 });
    await expect(getCurrentPositionIfGranted()).resolves.toStrictEqual({ latitude: 57.7089, longitude: 11.9746 });
  });
});
