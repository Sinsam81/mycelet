import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hver måling fra `watchPositionUntilAccurate` skal bære plattformens
 * tidsstempel.
 *
 * Det er ikke pynt: i iOS-skallet ser pluginen bort fra `maximumAge`, og
 * CoreLocation deler ut sin sist kjente posisjon først. `finnFerskPosisjon`
 * (src/lib/map/fersk-posisjon.ts) skiller den gamle fra en fersk på nettopp
 * dette feltet — og stoler på plattformen når feltet mangler. Faller
 * tidsstempelet ut her, blir ferskhetssjekken stille til en tom sjekk, og et
 * funn lagres igjen der brukeren VAR. Ingen annen test ville blitt rød.
 */

let native = true;
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => native }));

type WatchCallback = (
  position: { timestamp: number; coords: { latitude: number; longitude: number; accuracy: number } } | null,
  err?: unknown
) => void;

const plugin = {
  callbacks: [] as WatchCallback[],
  requestPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
  watchPosition: vi.fn((_options: unknown, callback: WatchCallback) => {
    plugin.callbacks.push(callback);
    return Promise.resolve('watch-1');
  }),
  clearWatch: vi.fn(async () => {})
};

/**
 * Som Capacitors registerPlugin-proxy: alle ukjente egenskapsnavn — også
 * `then` — blir en metode som avviser. Se useGeolocation-native.test.ts for
 * hvorfor et vanlig objekt ikke er godt nok her.
 */
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: new Proxy(
    {},
    {
      get(_m, prop) {
        if (prop === '$typeof') return undefined;
        if (prop === 'requestPermissions') return plugin.requestPermissions;
        if (prop === 'watchPosition') return plugin.watchPosition;
        if (prop === 'clearWatch') return plugin.clearWatch;
        return () => Promise.reject(new Error(`"Geolocation.${String(prop)}()" is not implemented on ios`));
      }
    }
  )
}));

const NAA = 1_800_000_000_000;


beforeEach(() => {
  native = true;
  plugin.callbacks.length = 0;
  plugin.requestPermissions.mockClear();
  plugin.watchPosition.mockClear();
  plugin.clearWatch.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchPositionUntilAccurate — tidsstempelet følger målingen', () => {
  it('i skallet: både mellomliggende målinger og svaret har pluginens tidsstempel', async () => {
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const sett: unknown[] = [];
    const lofte = watchPositionUntilAccurate({ targetAccuracyM: 30, timeoutMs: 8000, onUpdate: (fix) => sett.push(fix) });
    // Hjelperen laster plugin-modulen dynamisk og spør om tillatelse før
    // letingen starter — vent på selve letingen, ikke på et antall tikk.
    await vi.waitFor(() => expect(plugin.callbacks).toHaveLength(1));

    // Den sist kjente posisjonen CoreLocation deler ut først: førti minutter gammel.
    plugin.callbacks[0]({ timestamp: NAA - 40 * 60_000, coords: { latitude: 59.9706, longitude: 10.7286, accuracy: 65 } });
    plugin.callbacks[0]({ timestamp: NAA - 300, coords: { latitude: 59.992, longitude: 10.71, accuracy: 12 } });

    await expect(lofte).resolves.toEqual({ latitude: 59.992, longitude: 10.71, accuracy: 12, timestamp: NAA - 300 });
    expect(sett).toEqual([
      { latitude: 59.9706, longitude: 10.7286, accuracy: 65, timestamp: NAA - 40 * 60_000 },
      { latitude: 59.992, longitude: 10.71, accuracy: 12, timestamp: NAA - 300 }
    ]);
  });

  it('i nettleseren: tidsstempelet fra GeolocationPosition følger med', async () => {
    native = false;
    let vedPosisjon: ((p: unknown) => void) | null = null;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (suksess: (p: unknown) => void) => {
          vedPosisjon = suksess;
          return 7;
        },
        clearWatch: vi.fn()
      }
    });
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const lofte = watchPositionUntilAccurate({ targetAccuracyM: 30, timeoutMs: 8000 });
    await vi.waitFor(() => expect(vedPosisjon).not.toBeNull());
    (vedPosisjon as unknown as (p: unknown) => void)({
      timestamp: NAA,
      coords: { latitude: 57.7089, longitude: 11.9746, accuracy: 20 }
    });
    await expect(lofte).resolves.toEqual({ latitude: 57.7089, longitude: 11.9746, accuracy: 20, timestamp: NAA });
  });
});
