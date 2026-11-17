import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `watchPositionUntilAccurate`: et avbrudd gjelder i ALLE faser, og `onStart`
 * sier fra når selve letingen begynner.
 *
 * I skallet går det to ventinger forut for letingen — modulen lastes, og
 * plattformen spør kanskje om tillatelse. Avbruddslytteren kobles først på
 * sammen med letingen. Et avbrudd under de to ventingene nådde derfor ingen:
 * letingen startet likevel og gikk til fristen for en kaller som var borte, og
 * `finnFerskPosisjon` (src/lib/map/fersk-posisjon.ts), som holder sin egen frist
 * på letingen, visste ikke når den begynte. iOS spør på nytt etter «Tillat én
 * gang», så dialogen kommer midt i en tur — ikke bare ved første åpning.
 */

let native = true;
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => native }));

type Tillatelse = { location: string; coarseLocation: string };
type WatchCallback = (
  position: { timestamp: number; coords: { latitude: number; longitude: number; accuracy: number } } | null,
  err?: unknown
) => void;

const GITT: Tillatelse = { location: 'granted', coarseLocation: 'granted' };

const plugin = {
  callbacks: [] as WatchCallback[],
  requestPermissions: vi.fn(async (): Promise<Tillatelse> => GITT),
  watchPosition: vi.fn((_options: unknown, callback: WatchCallback) => {
    plugin.callbacks.push(callback);
    return Promise.resolve('watch-1');
  }),
  clearWatch: vi.fn(async () => {})
};

/** Som Capacitors registerPlugin-proxy — se useGeolocation-native.test.ts. */
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

/** Dialogen står oppe til testen svarer. */
function dialogStaarOppe() {
  const dialog: { svar: (t: Tillatelse) => void } = { svar: () => {} };
  plugin.requestPermissions.mockImplementationOnce(
    () =>
      new Promise<Tillatelse>((los) => {
        dialog.svar = los;
      })
  );
  return dialog;
}

beforeEach(() => {
  native = true;
  plugin.callbacks.length = 0;
  plugin.requestPermissions.mockReset().mockImplementation(async () => GITT);
  plugin.watchPosition.mockClear();
  plugin.clearWatch.mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchPositionUntilAccurate i skallet — avbrudd før letingen har startet', () => {
  it('avbrutt mens tillatelsesdialogen står oppe: avvises når den besvares, og ingen leting startes', async () => {
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const dialog = dialogStaarOppe();
    const avbryter = new AbortController();
    const onStart = vi.fn();
    const lofte = watchPositionUntilAccurate({ timeoutMs: 8000, signal: avbryter.signal, onStart });
    await vi.waitFor(() => expect(plugin.requestPermissions).toHaveBeenCalledTimes(1));

    avbryter.abort();
    dialog.svar(GITT);

    await expect(lofte).rejects.toThrow(/avbrutt/);
    expect(plugin.watchPosition).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('avbrutt mens modulen lastes: brukeren får ingen dialog fra noe som alt er lukket', async () => {
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const avbryter = new AbortController();
    const lofte = watchPositionUntilAccurate({ timeoutMs: 8000, signal: avbryter.signal });
    // Hjelperen står nå og venter på modulen.
    avbryter.abort();

    await expect(lofte).rejects.toThrow(/avbrutt/);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.watchPosition).not.toHaveBeenCalled();
  });

  it('avslått tillatelse sier fra som før', async () => {
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    plugin.requestPermissions.mockImplementationOnce(async () => ({ location: 'denied', coarseLocation: 'denied' }));
    const onStart = vi.fn();
    await expect(watchPositionUntilAccurate({ timeoutMs: 8000, onStart })).rejects.toThrow(/avslått/);
    expect(onStart).not.toHaveBeenCalled();
    expect(plugin.watchPosition).not.toHaveBeenCalled();
  });
});

describe('watchPositionUntilAccurate — onStart sier fra når letingen begynner', () => {
  it('i skallet: én gang, etter at dialogen er besvart og før letingen settes i gang', async () => {
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const dialog = dialogStaarOppe();
    const rekkefolge: string[] = [];
    plugin.watchPosition.mockImplementationOnce((_options: unknown, callback: WatchCallback) => {
      rekkefolge.push('letingen');
      plugin.callbacks.push(callback);
      return Promise.resolve('watch-1');
    });
    const lofte = watchPositionUntilAccurate({
      targetAccuracyM: 30,
      timeoutMs: 8000,
      onStart: () => rekkefolge.push('onStart')
    });
    await vi.waitFor(() => expect(plugin.requestPermissions).toHaveBeenCalledTimes(1));
    // Dialogen står oppe: letingen har ikke begynt, uansett hvor lenge det varer.
    expect(rekkefolge).toEqual([]);

    dialog.svar(GITT);
    await vi.waitFor(() => expect(plugin.callbacks).toHaveLength(1));
    expect(rekkefolge).toEqual(['onStart', 'letingen']);

    plugin.callbacks[0]({ timestamp: 1_800_000_000_000, coords: { latitude: 59.992, longitude: 10.71, accuracy: 12 } });
    await expect(lofte).resolves.toMatchObject({ accuracy: 12 });
    expect(rekkefolge).toEqual(['onStart', 'letingen']);
  });

  it('i skallet: et avbrudd etter at letingen har startet, avviser og rydder som før', async () => {
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const avbryter = new AbortController();
    const lofte = watchPositionUntilAccurate({ timeoutMs: 8000, signal: avbryter.signal });
    await vi.waitFor(() => expect(plugin.callbacks).toHaveLength(1));
    avbryter.abort();
    await expect(lofte).rejects.toThrow(/avbrutt/);
    await vi.waitFor(() => expect(plugin.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' }));
  });

  it('i nettleseren: med en gang — der spør watchPosition selv om tillatelse', async () => {
    native = false;
    const rekkefolge: string[] = [];
    let vedPosisjon: ((p: unknown) => void) | null = null;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (suksess: (p: unknown) => void) => {
          rekkefolge.push('letingen');
          vedPosisjon = suksess;
          return 7;
        },
        clearWatch: vi.fn()
      }
    });
    const { watchPositionUntilAccurate } = await import('../useGeolocation');
    const lofte = watchPositionUntilAccurate({
      targetAccuracyM: 30,
      timeoutMs: 8000,
      onStart: () => rekkefolge.push('onStart')
    });
    // Ingen venting foran letingen: begge deler har skjedd før kallet returnerte.
    expect(rekkefolge).toEqual(['onStart', 'letingen']);
    (vedPosisjon as unknown as (p: unknown) => void)({
      timestamp: 1_800_000_000_000,
      coords: { latitude: 57.7089, longitude: 11.9746, accuracy: 20 }
    });
    await expect(lofte).resolves.toMatchObject({ accuracy: 20 });
  });
});
