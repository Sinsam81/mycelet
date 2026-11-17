import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `finnFerskPosisjon` mot den EKTE `watchPositionUntilAccurate`, i iOS-skallet,
 * med en tillatelsesdialog som blir stående.
 *
 * fersk-posisjon.test.ts bruker en modell av hjelperen. Den første modellen
 * lyttet på avbrudd fra første stund, og skjulte dermed feilen her: den ekte
 * hjelperen laster modulen og venter på `requestPermissions()` FØR den kobler
 * på avbruddslytteren. Vakthunden i finnFerskPosisjon regnet fra kallet og slo
 * til etter 13 sekunder (8 + margin) mens dialogen sto oppe. Avbruddet nådde
 * ingen, letingen startet likevel da brukeren svarte — og fordi vår egen
 * avbryter da var avbrutt, ble hver eneste måling kastet. Åtte sekunder etter
 * «Tillat» kom «Fant ingen fersk posisjon i tide».
 *
 * iOS spør på nytt etter «Tillat én gang», så dette er den som åpnet kartet før
 * turen og trykker pluss ved soppen.
 */

vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => true, plattform: () => 'ios' }));

type Tillatelse = { location: string; coarseLocation: string };
type WatchCallback = (
  position: { timestamp: number; coords: { latitude: number; longitude: number; accuracy: number } } | null,
  err?: unknown
) => void;

const GITT: Tillatelse = { location: 'granted', coarseLocation: 'granted' };

const plugin = {
  callbacks: [] as WatchCallback[],
  requestPermissions: vi.fn(async (): Promise<Tillatelse> => GITT),
  checkPermissions: vi.fn(async (): Promise<Tillatelse> => GITT),
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
        if (prop === 'checkPermissions') return plugin.checkPermissions;
        if (prop === 'watchPosition') return plugin.watchPosition;
        if (prop === 'clearWatch') return plugin.clearWatch;
        return () => Promise.reject(new Error(`"Geolocation.${String(prop)}()" is not implemented on ios`));
      }
    }
  )
}));

const NAA = 1_800_000_000_000;
const PARKERING = { latitude: 59.9706, longitude: 10.7286 };
const LYSNING = { latitude: 59.992, longitude: 10.71 };

let klokke = NAA;
let geo: typeof import('@/lib/hooks/useGeolocation');
let fersk: typeof import('../fersk-posisjon');
const ekteSetImmediate = setImmediate;

beforeEach(async () => {
  klokke = NAA;
  plugin.callbacks.length = 0;
  plugin.requestPermissions.mockReset().mockImplementation(async () => GITT);
  plugin.watchPosition.mockClear();
  plugin.clearWatch.mockClear();
  // Ny modulinstans per test, og plugin-modulen lastet på forhånd med ekte
  // tidtakere — som i useGeolocation-native.test.ts. Etterpå går alt via løfter.
  vi.useRealTimers();
  vi.resetModules();
  geo = await import('@/lib/hooks/useGeolocation');
  await geo.hasGeolocationPermission();
  fersk = await import('../fersk-posisjon');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => ekteSetImmediate(r));
    for (let j = 0; j < 10; j++) await Promise.resolve();
  }
}

/** Tiden går — både tidtakerne og klokka målingene sammenlignes med. */
async function gaar(ms: number) {
  klokke += ms;
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

function folg<T>(lofte: Promise<T>) {
  const status: { utfall: unknown } = { utfall: 'venter' };
  lofte.then(
    (v) => (status.utfall = v),
    (e) => (status.utfall = e)
  );
  return status;
}

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

const maaling = (punkt: { latitude: number; longitude: number }, accuracy: number, alderMs = 300) => ({
  timestamp: klokke - alderMs,
  coords: { ...punkt, accuracy }
});

/** Funnskjemaets leting: mål 30 m, frist 8 s. */
const startLeting = (ekstra: Partial<Parameters<typeof fersk.finnFerskPosisjon>[0]> = {}) =>
  folg(fersk.finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => klokke, ...ekstra }));

describe('tillatelsesdialogen går ikke av letingens tid', () => {
  it('besvart etter 5 sekunder: den ferske målingen brukes', async () => {
    const dialog = dialogStaarOppe();
    const s = startLeting();
    await flush();
    await gaar(5_000);
    dialog.svar(GITT);
    await flush();

    expect(plugin.callbacks).toHaveLength(1);
    plugin.callbacks[0](maaling(LYSNING, 6));
    await flush();
    expect(s.utfall).toEqual({ ...LYSNING, accuracy: 6, timestamp: klokke - 300 });
  });

  it('besvart etter 14 sekunder — forbi de 13 den gamle vakthunden ga: den ferske målingen brukes', async () => {
    const dialog = dialogStaarOppe();
    const meldt: unknown[] = [];
    const s = startLeting({ onUpdate: (fix) => meldt.push(fix) });
    await flush();
    await gaar(14_000);
    expect(s.utfall).toBe('venter');
    dialog.svar(GITT);
    await flush();

    expect(plugin.callbacks).toHaveLength(1);
    // Først den sist kjente posisjonen iOS deler ut: førti minutter gammel og nøyaktig.
    plugin.callbacks[0](maaling(PARKERING, 5, 40 * 60_000));
    await flush();
    expect(s.utfall).toBe('venter');
    // Så en fersk.
    plugin.callbacks[0](maaling(LYSNING, 6));
    await flush();
    expect(s.utfall).toEqual({ ...LYSNING, accuracy: 6, timestamp: klokke - 300 });
    expect(meldt).toEqual([{ ...LYSNING, accuracy: 6, timestamp: klokke - 300 }]);
    // Og letingen under er stoppet.
    expect(plugin.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' });
  });

  it('etter en sen dialog har letingen hele fristen sin — og tar slutt når den er ute', async () => {
    const dialog = dialogStaarOppe();
    const s = startLeting();
    await flush();
    await gaar(30_000);
    dialog.svar(GITT);
    await flush();

    // Bare den gamle posisjonen kommer.
    plugin.callbacks[0](maaling(PARKERING, 5, 40 * 60_000));
    await gaar(7_999);
    expect(s.utfall).toBe('venter');
    await gaar(1);
    expect((s.utfall as Error).message).toMatch(/ingen fersk posisjon i tide/);
    expect(plugin.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' });
  });

  it('en grov, fersk måling etter en sen dialog er svaret når fristen går ut', async () => {
    const dialog = dialogStaarOppe();
    const s = startLeting();
    await flush();
    await gaar(14_000);
    dialog.svar(GITT);
    await flush();

    plugin.callbacks[0](maaling(LYSNING, 80));
    await gaar(8_000);
    expect(s.utfall).toMatchObject({ ...LYSNING, accuracy: 80 });
  });
});

describe('letingen tar alltid slutt', () => {
  it('en dialog ingen svarer på: gir seg etter TILLATELSE_FRIST_MS, og starter ingen leting om svaret kommer etterpå', async () => {
    const dialog = dialogStaarOppe();
    const s = startLeting();
    await flush();
    await gaar(geo.TILLATELSE_FRIST_MS - 1);
    expect(s.utfall).toBe('venter');
    await gaar(1);
    expect((s.utfall as Error).message).toMatch(/ingen fersk posisjon i tide/);

    dialog.svar(GITT);
    await flush();
    expect(plugin.watchPosition).not.toHaveBeenCalled();
  });

  it('avslått i dialogen: svarer med en gang, uten leting', async () => {
    const dialog = dialogStaarOppe();
    const s = startLeting();
    await flush();
    await gaar(9_000);
    dialog.svar({ location: 'denied', coarseLocation: 'denied' });
    await flush();
    expect((s.utfall as Error).message).toMatch(/avslått/);
    expect(plugin.watchPosition).not.toHaveBeenCalled();
  });
});

describe('avbrutt mens dialogen står oppe', () => {
  it('skjemaet lukkes: når dialogen besvares, starter ingen leting som ville holdt GPS-en varm', async () => {
    const dialog = dialogStaarOppe();
    const avbryter = new AbortController();
    const meldt: unknown[] = [];
    const s = startLeting({ signal: avbryter.signal, onUpdate: (fix) => meldt.push(fix) });
    await flush();
    await gaar(3_000);
    avbryter.abort();
    await gaar(3_000);
    dialog.svar(GITT);
    await flush();

    expect(plugin.watchPosition).not.toHaveBeenCalled();
    expect((s.utfall as Error).message).toMatch(/avbrutt/);
    expect(meldt).toEqual([]);
  });
});
