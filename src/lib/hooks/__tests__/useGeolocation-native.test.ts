import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @capacitor/geolocation 8.2.0, slik den oppfører seg i alle App Store-bygg til
 * og med 1.0.2: én CoreLocation-feil river posisjonsstrømmen, og hvert senere
 * getCurrentPosition() blir aldri avgjort — til clearWatch kalles uten aktive
 * watcher (GeolocationPlugin.swift: bindLocationPublisher / clearWatch).
 * Rettet oppstrøms i 8.2.4 (RMET-5383). Denne falske pluginen modellerer det,
 * så testene viser at appens frist og nullstilling får den til å virke igjen.
 */
function lagPlugin() {
  const tilstand = { dod: false, nesteSvar: 'fiks' as 'fiks' | 'feil', aktiveWatcher: 0, kall: 0 };
  const plugin = {
    tilstand,
    requestPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
    checkPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
    getCurrentPosition: vi.fn(() => {
      tilstand.kall += 1;
      if (tilstand.dod) return new Promise(() => {}); // svaret havner i den døde strømmen
      if (tilstand.nesteSvar === 'feil') {
        tilstand.dod = true; // .catch → Empty(): abonnementet er over, flagget står
        return Promise.reject(new Error('There was an error trying to obtain the location.'));
      }
      return Promise.resolve({ coords: { latitude: 59.91, longitude: 10.75, accuracy: 20 } });
    }),
    clearWatch: vi.fn(async () => {
      if (tilstand.aktiveWatcher === 0) tilstand.dod = false; // locationInitialized = false
    })
  };
  return plugin;
}

let plugin = lagPlugin();
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => true }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: new Proxy({}, { get: (_t, k) => (plugin as Record<string | symbol, unknown>)[k] }) }));

const geo = await import('../useGeolocation');
// Lastet én gang med ekte tidtakere, så den dynamiske importen inni
// useGeolocation er hurtiglagret når de falske slås på.
await import('@capacitor/geolocation');

const ekteSetImmediate = setImmediate;

beforeEach(() => {
  plugin = lagPlugin();
  // Bare tidtakerne koden selv bruker. Modullasteren skal få gå i fred.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

/** Lar dynamisk import og await-kjeder gå ferdig før tiden flyttes. */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => ekteSetImmediate(r));
    for (let j = 0; j < 10; j++) await Promise.resolve();
  }
}

describe('native posisjon med frist og nullstilling', () => {
  it('et friskt oppslag svarer som før og nullstiller ingenting', async () => {
    await expect(geo.getCurrentPositionOnce()).resolves.toEqual({ latitude: 59.91, longitude: 10.75 });
    expect(plugin.clearWatch).not.toHaveBeenCalled();
  });

  it('en feil fra pluginen sendes videre og nullstiller strømmen', async () => {
    plugin.tilstand.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow(/error trying to obtain/);
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledWith({ id: geo.NULLSTILL_WATCH_ID });
  });

  it('en plugin som tier, gir PosisjonTidsavbrudd etter pluginens timeout pluss margin — ikke evig venting', async () => {
    plugin.tilstand.dod = true;
    let utfall: unknown = 'venter';
    geo.getCurrentPositionOnce().then(
      (v) => (utfall = v),
      (e) => (utfall = e)
    );
    await flush();
    await vi.advanceTimersByTimeAsync(10_000 + geo.NATIV_FRIST_MARGIN_MS - 1);
    expect(utfall).toBe('venter');
    await vi.advanceTimersByTimeAsync(1);
    expect(utfall).toBeInstanceOf(geo.PosisjonTidsavbrudd);
    expect(plugin.clearWatch).toHaveBeenCalledWith({ id: geo.NULLSTILL_WATCH_ID });
  });

  it('etter én feil virker neste oppslag igjen (det 8.2.0 alene aldri gjør)', async () => {
    plugin.tilstand.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    await flush();
    plugin.tilstand.nesteSvar = 'fiks';
    await expect(geo.getCurrentPositionOnce()).resolves.toEqual({ latitude: 59.91, longitude: 10.75 });
  });

  it('uten nullstillingen ville neste oppslag hengt — modellen er tro mot buggen', async () => {
    plugin.tilstand.nesteSvar = 'feil';
    plugin.clearWatch.mockImplementation(async () => {}); // som om appen ikke nullstilte
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    plugin.tilstand.nesteSvar = 'fiks';
    let utfall: unknown = 'venter';
    geo.getCurrentPositionOnce().then((v) => (utfall = v), (e) => (utfall = e));
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(utfall).toBe('venter');
  });

  it('en aktiv watch («Min posisjon» på kartet) blir ikke revet av nullstillingen', async () => {
    plugin.tilstand.aktiveWatcher = 1;
    plugin.tilstand.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledTimes(1);
    expect(plugin.tilstand.dod).toBe(true); // pluginen selv rører ikke strømmen når en watch lever
  });

  it('forsidekortets stille oppslag gir null i stedet for å henge', async () => {
    plugin.tilstand.dod = true;
    let utfall: unknown = 'venter';
    geo.getCurrentPositionIfGranted().then((v) => (utfall = v));
    await flush();
    await vi.advanceTimersByTimeAsync(4_000 + geo.NATIV_FRIST_MARGIN_MS);
    expect(utfall).toBeNull();
  });
});

describe('getCurrentPositionWithin — posisjon som hjelp, aldri som sperre', () => {
  it('gir opp etter fristen og sier at det var fristen', async () => {
    plugin.tilstand.dod = true;
    let utfall: unknown = 'venter';
    geo.getCurrentPositionWithin(5_000).then((v) => (utfall = v));
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(utfall).toEqual({ fix: null, tidsavbrudd: true });
  });

  it('avslått tilgang: ingen oppslag, ingen frist', async () => {
    plugin.requestPermissions.mockResolvedValueOnce({ location: 'denied', coarseLocation: 'denied' });
    await expect(geo.getCurrentPositionWithin(5_000)).resolves.toEqual({ fix: null, tidsavbrudd: false });
    expect(plugin.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('en fiks innen fristen kommer fram', async () => {
    await expect(geo.getCurrentPositionWithin(5_000)).resolves.toEqual({ fix: { latitude: 59.91, longitude: 10.75 }, tidsavbrudd: false });
  });

  it('en feil fra pluginen er ingen frist', async () => {
    plugin.tilstand.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionWithin(5_000)).resolves.toEqual({ fix: null, tidsavbrudd: false });
  });
});
