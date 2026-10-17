import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @capacitor/geolocation 8.2.0, slik den oppfører seg i alle App Store-bygg til
 * og med 1.0.2 (GeolocationPlugin.swift + GeolocationCallbackManager.swift):
 *
 *  - Første getCurrentPosition() kobler seg til posisjonsstrømmen (bundet).
 *    Alle ventende engangsoppslag deler strømmen: en fiks avgjør ALLE.
 *  - En CoreLocation-feil avviser de ventende og river strømmen (.catch →
 *    Empty), men «bundet» står: senere oppslag venter for alltid (død).
 *  - clearWatch med ingen aktive watcher nullstiller bindingen. Ventende
 *    oppslag blir liggende, men en fiks når dem først etter at et nytt
 *    oppslag har koblet til på nytt.
 *
 * Rettet oppstrøms i 8.2.4 (RMET-5383). Modellen lar testene vise at appens
 * frist og samordnede nullstilling får den til å virke igjen — uten å rive
 * strømmen for et annet oppslag som venter.
 */
const POS = { coords: { latitude: 59.91, longitude: 10.75, accuracy: 20 } };

function lagPlugin() {
  const t = {
    bundet: false,
    dod: false,
    aktiveWatcher: 0,
    autoSvar: true as boolean,
    nesteSvar: 'fiks' as 'fiks' | 'feil',
    ventende: [] as Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>
  };
  const lever = () => {
    if (!t.bundet || t.dod) return;
    const alle = t.ventende.splice(0);
    for (const v of alle) v.resolve(POS);
  };
  const feil = () => {
    if (!t.bundet || t.dod) return;
    const alle = t.ventende.splice(0);
    for (const v of alle) v.reject(new Error('There was an error trying to obtain the location.'));
    t.dod = true;
  };
  return {
    t,
    lever,
    feil,
    requestPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
    checkPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
    getCurrentPosition: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          if (!t.bundet) {
            t.bundet = true; // bindLocationPublisher
            t.dod = false;
          }
          t.ventende.push({ resolve, reject });
          if (t.autoSvar && !t.dod) queueMicrotask(() => (t.nesteSvar === 'fiks' ? lever() : feil()));
        })
    ),
    clearWatch: vi.fn(async () => {
      if (t.aktiveWatcher === 0) {
        t.bundet = false; // locationInitialized = false, strømmen revet
        t.dod = false;
      }
    })
  };
}

let plugin = lagPlugin();
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => true }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: new Proxy({}, { get: (_t, k) => (plugin as Record<string | symbol, unknown>)[k] }) }));

let geo: typeof import('../useGeolocation');
const ekteSetImmediate = setImmediate;

beforeEach(async () => {
  plugin = lagPlugin();
  // Ny modulinstans per test (ingen lekkasje av samordningstilstanden), lastet
  // med ekte tidtakere. Etterpå går alt via vanlige løfter.
  vi.useRealTimers();
  vi.resetModules();
  geo = await import('../useGeolocation');
  await geo.hasGeolocationPermission();
  plugin.checkPermissions.mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => vi.useRealTimers());

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => ekteSetImmediate(r));
    for (let j = 0; j < 10; j++) await Promise.resolve();
  }
}

function folg<T>(lofte: Promise<T>) {
  const status: { utfall: unknown } = { utfall: 'venter' };
  lofte.then(
    (v) => (status.utfall = v),
    (e) => (status.utfall = e)
  );
  return status;
}

describe('native posisjon med frist og nullstilling', () => {
  it('et friskt oppslag svarer som før og nullstiller ingenting', async () => {
    await expect(geo.getCurrentPositionOnce()).resolves.toEqual({ latitude: 59.91, longitude: 10.75 });
    expect(plugin.clearWatch).not.toHaveBeenCalled();
  });

  it('en feil fra pluginen sendes videre og nullstiller strømmen', async () => {
    plugin.t.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow(/error trying to obtain/);
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledWith({ id: geo.NULLSTILL_WATCH_ID });
  });

  it('en plugin som tier, gir PosisjonTidsavbrudd etter pluginens timeout pluss margin — ikke evig venting', async () => {
    plugin.t.bundet = true;
    plugin.t.dod = true;
    const s = folg(geo.getCurrentPositionOnce());
    await flush();
    await vi.advanceTimersByTimeAsync(10_000 + geo.NATIV_FRIST_MARGIN_MS - 1);
    expect(s.utfall).toBe('venter');
    await vi.advanceTimersByTimeAsync(1);
    expect(s.utfall).toBeInstanceOf(geo.PosisjonTidsavbrudd);
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledWith({ id: geo.NULLSTILL_WATCH_ID });
  });

  it('etter én feil virker neste oppslag igjen (det 8.2.0 alene aldri gjør)', async () => {
    plugin.t.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    plugin.t.nesteSvar = 'fiks';
    await expect(geo.getCurrentPositionOnce()).resolves.toEqual({ latitude: 59.91, longitude: 10.75 });
  });

  it('uten nullstillingen ville neste oppslag hengt — modellen er tro mot buggen', async () => {
    plugin.t.nesteSvar = 'feil';
    plugin.clearWatch.mockImplementation(async () => {}); // som om appen ikke nullstilte
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    plugin.t.nesteSvar = 'fiks';
    const s = folg(geo.getCurrentPositionOnce());
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.utfall).toBe('venter');
  });

  it('en aktiv watch («Min posisjon» på kartet) blir ikke revet av nullstillingen', async () => {
    plugin.t.aktiveWatcher = 1;
    plugin.t.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledTimes(1);
    expect(plugin.t.bundet).toBe(true); // pluginen selv rører ikke strømmen når en watch lever
  });

  it('forsidekortets stille oppslag gir null i stedet for å henge', async () => {
    plugin.t.bundet = true;
    plugin.t.dod = true;
    const s = folg(geo.getCurrentPositionIfGranted());
    await flush();
    await vi.advanceTimersByTimeAsync(4_000 + geo.NATIV_FRIST_MARGIN_MS);
    await flush();
    expect(s.utfall).toBeNull();
  });
});

describe('nullstillingen river aldri et annet oppslag som venter (Codex, 17. okt)', () => {
  it('stille oppslag går ut på tid mens «Bruk min posisjon» venter: den andre får posisjonen sin', async () => {
    // Pluginen er frisk, men treg: ingen svar før vi leverer.
    plugin.t.autoSvar = false;
    const stille = folg(geo.getCurrentPositionIfGranted()); // t = 0, frist 4 + 2 s
    await flush();
    await vi.advanceTimersByTimeAsync(3_000);
    const eksplisitt = folg(geo.getCurrentPositionOnce()); // t = 3 s, frist 10 + 2 s
    await flush();
    await vi.advanceTimersByTimeAsync(3_000); // t = 6 s: det stille går ut på tid
    await flush();
    expect(stille.utfall).toBeNull();
    expect(plugin.clearWatch).not.toHaveBeenCalled(); // det eksplisitte venter fortsatt
    await vi.advanceTimersByTimeAsync(1_000); // t = 7 s: fiksen kommer
    plugin.lever();
    await flush();
    expect(eksplisitt.utfall).toEqual({ latitude: 59.91, longitude: 10.75 });
    // Strømmen leverte — ingen grunn til å nullstille etterpå.
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(plugin.clearWatch).not.toHaveBeenCalled();
  });

  it('når begge går ut på tid, nullstilles det én gang — etter det siste', async () => {
    plugin.t.bundet = true;
    plugin.t.dod = true;
    folg(geo.getCurrentPositionIfGranted());
    await flush();
    folg(geo.getCurrentPositionOnce());
    await flush();
    await vi.advanceTimersByTimeAsync(6_000);
    await flush();
    expect(plugin.clearWatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6_000);
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('et nytt oppslag mens nullstillingen pågår, venter på den og virker', async () => {
    plugin.t.nesteSvar = 'feil';
    let slippClearWatch!: () => void;
    plugin.clearWatch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          slippClearWatch = () => {
            plugin.t.bundet = false;
            plugin.t.dod = false;
            resolve();
          };
        })
    );
    await expect(geo.getCurrentPositionOnce()).rejects.toThrow();
    await flush();
    expect(plugin.clearWatch).toHaveBeenCalledTimes(1);
    plugin.t.nesteSvar = 'fiks';
    const neste = folg(geo.getCurrentPositionOnce());
    await flush();
    expect(plugin.getCurrentPosition).toHaveBeenCalledTimes(1); // venter på nullstillingen
    slippClearWatch();
    await flush();
    expect(neste.utfall).toEqual({ latitude: 59.91, longitude: 10.75 });
  });
});

describe('getCurrentPositionWithin — posisjon som hjelp, aldri som sperre', () => {
  it('gir opp etter fristen og sier at det var fristen', async () => {
    plugin.t.bundet = true;
    plugin.t.dod = true;
    const s = folg(geo.getCurrentPositionWithin(5_000));
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    await flush();
    expect(s.utfall).toEqual({ fix: null, tidsavbrudd: true });
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
    plugin.t.nesteSvar = 'feil';
    await expect(geo.getCurrentPositionWithin(5_000)).resolves.toEqual({ fix: null, tidsavbrudd: false });
  });
});
