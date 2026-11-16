import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccurateFix } from '@/lib/hooks/useGeolocation';

/**
 * En modell av `watchPositionUntilAccurate` som oppfører seg som den ekte på de
 * punktene `finnFerskPosisjon` lener seg på: hver måling går til onUpdate, den
 * laveste nøyaktigheten er «best», hjelperen stopper selv når en måling er
 * under målet, fristen gir den beste eller en feil, og et avbrudd avviser.
 *
 * Den har også den ekte hjelperens to faser. FØR letingen (modulen lastes,
 * plattformen spør om tillatelse) lytter ingen på avbrudd; hjelperen ser først
 * etterpå om den er avbrutt, sier fra med onStart, og starter letingen. En
 * modell uten den fasen skjulte at vakthunden slo til mens dialogen sto oppe.
 * Samme løp mot den EKTE hjelperen: fersk-posisjon-tillatelse.test.ts.
 */
interface Leting {
  valg: {
    targetAccuracyM?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onUpdate?: (fix: AccurateFix) => void;
    onStart?: () => void;
  };
  lever: (fix: AccurateFix) => void;
  fristUte: () => void;
  avgjort: () => boolean;
}

const letinger: Leting[] = [];
let gjeldendePlattform: 'ios' | 'android' | 'web' = 'ios';
/** Settes av en test som vil holde hjelperen i fasen før letingen. */
let forarbeid: Promise<void> | null = null;
/** En hjelper som ikke bryr seg om avbrudd — vakthunden skal ikke være avhengig av den. */
let dovForAvbrudd = false;

vi.mock('@/lib/native/platform', () => ({
  plattform: () => gjeldendePlattform,
  isNativePlatform: () => gjeldendePlattform !== 'web'
}));

vi.mock('@/lib/hooks/useGeolocation', async (importOriginal) => ({
  // Konstantene (TILLATELSE_FRIST_MS) er de ekte.
  ...(await importOriginal<typeof import('@/lib/hooks/useGeolocation')>()),
  watchPositionUntilAccurate: async (valg: Leting['valg'] = {}) => {
    const { targetAccuracyM = 25, signal, onUpdate, onStart } = valg;
    if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');
    if (forarbeid) {
      await forarbeid;
      if (signal?.aborted && !dovForAvbrudd) throw new Error('Posisjonssøk avbrutt.');
    }
    onStart?.();
    return new Promise<AccurateFix>((resolve, reject) => {
      let ferdig = false;
      let beste: AccurateFix | null = null;
      const avslutt = (kjor: () => void) => {
        if (ferdig) return;
        ferdig = true;
        kjor();
      };
      if (!dovForAvbrudd) {
        signal?.addEventListener('abort', () => avslutt(() => reject(new Error('Posisjonssøk avbrutt.'))));
      }
      letinger.push({
        valg,
        lever: (fix) => {
          if (ferdig) return;
          if (!beste || fix.accuracy < beste.accuracy) beste = fix;
          onUpdate?.(fix);
          if (fix.accuracy <= targetAccuracyM) avslutt(() => resolve(fix));
        },
        fristUte: () => avslutt(() => (beste ? resolve(beste) : reject(new Error('Fant ikke posisjonen din i tide.')))),
        avgjort: () => ferdig
      });
    });
  }
}));

const { TILLATELSE_FRIST_MS } = await import('@/lib/hooks/useGeolocation');
const { FERSK_MAKS_ALDER_MS, KLOKKESLINGRING_MS, VAKTHUND_MARGIN_MS, erFerskMaaling, erGyldigMaaling, finnFerskPosisjon } =
  await import('../fersk-posisjon');

const NAA = 1_800_000_000_000;
const PARKERING = { latitude: 59.9706, longitude: 10.7286 };
const LYSNING = { latitude: 59.992, longitude: 10.71 };

/** Den sist kjente posisjonen iOS deler ut først: førti minutter gammel, og nøyaktig. */
const gammel: AccurateFix = { ...PARKERING, accuracy: 6, timestamp: NAA - 40 * 60_000 };
const fersk = (accuracy: number, alderMs = 400): AccurateFix => ({ ...LYSNING, accuracy, timestamp: NAA - alderMs });

function folg<T>(lofte: Promise<T>) {
  const status: { utfall: unknown } = { utfall: 'venter' };
  lofte.then(
    (v) => (status.utfall = v),
    (e) => (status.utfall = e)
  );
  return status;
}

/** finnFerskPosisjon venter på tillatelsessjekken før letingen starter. */
async function tikk() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** Et løfte testen selv løser — tillatelsesdialogen som står oppe til noen svarer. */
function dialog() {
  let svar: () => void = () => {};
  forarbeid = new Promise<void>((los) => {
    svar = los;
  });
  return { svar: () => svar() };
}

beforeEach(() => {
  letinger.length = 0;
  gjeldendePlattform = 'ios';
  forarbeid = null;
  dovForAvbrudd = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('erFerskMaaling', () => {
  it('en måling fra nå er fersk, en fra førti minutter siden er det ikke', () => {
    expect(erFerskMaaling(NAA - 400, NAA)).toBe(true);
    expect(erFerskMaaling(NAA - 40 * 60_000, NAA)).toBe(false);
  });

  it('grensen er femten sekunder — rundt tjue meter til fots', () => {
    expect(erFerskMaaling(NAA - FERSK_MAKS_ALDER_MS, NAA)).toBe(true);
    expect(erFerskMaaling(NAA - FERSK_MAKS_ALDER_MS - 1, NAA)).toBe(false);
  });

  it('tåler litt slingring mellom klokkene, men ikke et tidsstempel langt inn i framtida', () => {
    expect(erFerskMaaling(NAA + KLOKKESLINGRING_MS, NAA)).toBe(true);
    expect(erFerskMaaling(NAA + 5 * 60_000, NAA)).toBe(false);
  });

  it('uten tidsstempel kan vi ikke dømme, og stoler på plattformen', () => {
    expect(erFerskMaaling(undefined, NAA)).toBe(true);
    expect(erFerskMaaling(Number.NaN, NAA)).toBe(true);
    expect(erFerskMaaling(0, NAA)).toBe(true);
  });
});

describe('erGyldigMaaling', () => {
  it('iOS melder en ugyldig posisjon med negativ nøyaktighet — den skal aldri vinne som «best»', () => {
    expect(erGyldigMaaling({ ...LYSNING, accuracy: -1 })).toBe(false);
    expect(erGyldigMaaling({ ...LYSNING, accuracy: 0 })).toBe(true);
    expect(erGyldigMaaling({ ...LYSNING, accuracy: 12 })).toBe(true);
  });

  it('forkaster koordinater som ikke er tall eller ligger utenfor kloden', () => {
    expect(erGyldigMaaling({ latitude: Number.NaN, longitude: 10, accuracy: 5 })).toBe(false);
    expect(erGyldigMaaling({ latitude: 95, longitude: 10, accuracy: 5 })).toBe(false);
    expect(erGyldigMaaling({ latitude: 60, longitude: 200, accuracy: 5 })).toBe(false);
  });
});

describe('finnFerskPosisjon i iOS-skallet', () => {
  it('den gamle, nøyaktige posisjonen stopper ikke letingen — den ferske ved soppen vinner', async () => {
    const meldt: AccurateFix[] = [];
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA, onUpdate: (f) => meldt.push(f) }));
    await tikk();
    expect(letinger).toHaveLength(1);

    // Nøyaktig dette avsluttet hjelperen alene: 6 m ≤ 30 m.
    letinger[0].lever(gammel);
    await tikk();
    expect(s.utfall).toBe('venter');
    expect(meldt).toEqual([]);

    letinger[0].lever(fersk(18));
    await tikk();
    expect(s.utfall).toEqual(fersk(18));
    expect(meldt).toEqual([fersk(18)]);
    // Og letingen under er stoppet — GPS-en står ikke på til fristen.
    expect(letinger[0].avgjort()).toBe(true);
  });

  it('ber hjelperen om aldri å si seg fornøyd selv — det er ferskheten som avgjør', async () => {
    void finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }).catch(() => {});
    await tikk();
    expect(letinger[0].valg.targetAccuracyM).toBe(Number.NEGATIVE_INFINITY);
    expect(letinger[0].valg.timeoutMs).toBe(8000);
  });

  it('ved fristen brukes den beste FERSKE målingen, ikke hjelperens beste (som er den gamle)', async () => {
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    letinger[0].lever(gammel); // 6 m — best etter hjelperens mål
    letinger[0].lever(fersk(80));
    letinger[0].lever(fersk(55));
    letinger[0].lever(fersk(70));
    letinger[0].fristUte();
    await tikk();
    expect(s.utfall).toEqual(fersk(55));
  });

  it('kom det bare en gammel posisjon, er svaret «ingen» — ikke parkeringsplassen', async () => {
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    letinger[0].lever(gammel);
    letinger[0].fristUte();
    await tikk();
    expect(s.utfall).toBeInstanceOf(Error);
  });

  it('en ugyldig måling (negativ nøyaktighet) verken meldes eller velges', async () => {
    const meldt: AccurateFix[] = [];
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA, onUpdate: (f) => meldt.push(f) }));
    await tikk();
    letinger[0].lever({ ...LYSNING, accuracy: -1, timestamp: NAA });
    await tikk();
    expect(s.utfall).toBe('venter');
    expect(meldt).toEqual([]);
    letinger[0].fristUte();
    await tikk();
    expect(s.utfall).toBeInstanceOf(Error);
  });

  it('ingen måling i det hele tatt: feilen fra hjelperen sendes videre', async () => {
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    letinger[0].fristUte();
    await tikk();
    expect((s.utfall as Error).message).toMatch(/ikke posisjonen din i tide/);
  });
});

describe('finnFerskPosisjon — avbrudd og frister', () => {
  it('avbrutt av kalleren (skjemaet lukkes): letingen stopper og ingen posisjon kommer ut', async () => {
    const avbryter = new AbortController();
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, signal: avbryter.signal, naa: () => NAA }));
    await tikk();
    letinger[0].lever(fersk(90)); // en fersk, men ikke god nok
    avbryter.abort();
    await tikk();
    expect(s.utfall).toBeInstanceOf(Error);
    expect(letinger[0].avgjort()).toBe(true);
  });

  it('allerede avbrutt: starter ikke en leting', async () => {
    const avbryter = new AbortController();
    avbryter.abort();
    await expect(finnFerskPosisjon({ signal: avbryter.signal })).rejects.toThrow(/avbrutt/);
    expect(letinger).toHaveLength(0);
  });

  it('vakthunden: en leting som aldri svarer, tar slutt — «Lagre» kan ikke stå stengt for alltid', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    await vi.advanceTimersByTimeAsync(8000 + VAKTHUND_MARGIN_MS - 1);
    expect(s.utfall).toBe('venter');
    await vi.advanceTimersByTimeAsync(1);
    await tikk();
    expect(s.utfall).toBeInstanceOf(Error);
  });

  it('vakthunden gir den beste ferske målingen når en slik rakk å komme', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    letinger[0].lever(fersk(120));
    await vi.advanceTimersByTimeAsync(8000 + VAKTHUND_MARGIN_MS);
    await tikk();
    expect(s.utfall).toEqual(fersk(120));
  });

  it('vakthunden avslutter letingen selv — også når hjelperen ikke hører avbruddet', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    dovForAvbrudd = true;
    const meldt: AccurateFix[] = [];
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA, onUpdate: (f) => meldt.push(f) }));
    await tikk();
    await vi.advanceTimersByTimeAsync(8000 + VAKTHUND_MARGIN_MS);
    await tikk();
    expect((s.utfall as Error).message).toMatch(/ingen fersk posisjon i tide/);
    // Hjelperen leter fortsatt; det den leverer nå, kommer for sent og meldes ikke.
    expect(letinger[0].avgjort()).toBe(false);
    letinger[0].lever(fersk(10));
    expect(meldt).toEqual([]);
  });

  it('ingen tidtaker står igjen når letingen er over', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    letinger[0].lever(fersk(12));
    await tikk();
    expect(s.utfall).toEqual(fersk(12));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('finnFerskPosisjon — tillatelsesdialogen går ikke av letingens tid', () => {
  // iOS spør på nytt etter «Tillat én gang». Vakthunden regnet fra kallet og
  // slo til etter 13 sekunder (8 + margin) mens dialogen sto oppe; hjelperen
  // hørte ikke avbruddet før letingen startet, og hver ferske måling ble
  // kastet. Like etter «Tillat» sa skjemaet «Fant ikke posisjonen din».
  it('besvart etter 14 sekunder: letingen starter med hele sin frist, og den ferske målingen brukes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tillatelse = dialog();
    const meldt: AccurateFix[] = [];
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA, onUpdate: (f) => meldt.push(f) }));
    await tikk();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(s.utfall).toBe('venter');
    expect(letinger).toHaveLength(0);

    tillatelse.svar();
    await tikk();
    expect(letinger).toHaveLength(1);
    // Ikke avbrutt på forhånd: letingen under får faktisk lete.
    expect(letinger[0].valg.signal?.aborted).toBe(false);
    letinger[0].lever(fersk(6));
    await tikk();
    expect(s.utfall).toEqual(fersk(6));
    expect(meldt).toEqual([fersk(6)]);
  });

  it('etter dialogen gjelder letingens frist pluss margin — regnet fra letingen startet', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tillatelse = dialog();
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    await vi.advanceTimersByTimeAsync(20_000);
    tillatelse.svar();
    await tikk();

    await vi.advanceTimersByTimeAsync(8000 + VAKTHUND_MARGIN_MS - 1);
    expect(s.utfall).toBe('venter');
    await vi.advanceTimersByTimeAsync(1);
    await tikk();
    expect(s.utfall).toBeInstanceOf(Error);
    expect(letinger[0].avgjort()).toBe(true);
  });

  it('en dialog ingen svarer på, holder ikke letingen for alltid', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tillatelse = dialog();
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    await vi.advanceTimersByTimeAsync(TILLATELSE_FRIST_MS - 1);
    expect(s.utfall).toBe('venter');
    await vi.advanceTimersByTimeAsync(1);
    await tikk();
    expect((s.utfall as Error).message).toMatch(/ingen fersk posisjon i tide/);

    // Svarer brukeren likevel til slutt, starter ingen leting for et skjema som har gitt opp.
    tillatelse.svar();
    await tikk();
    expect(letinger).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lukkes skjemaet mens dialogen står oppe, starter ingen leting når den besvares', async () => {
    const tillatelse = dialog();
    const avbryter = new AbortController();
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, signal: avbryter.signal, naa: () => NAA }));
    await tikk();
    avbryter.abort();
    tillatelse.svar();
    await tikk();
    expect(letinger).toHaveLength(0);
    expect((s.utfall as Error).message).toMatch(/avbrutt/);
  });

  it('i nettleseren finnes ikke den fasen: fristen regnes fra kallet, som før', async () => {
    gjeldendePlattform = 'web';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = folg(finnFerskPosisjon({ timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    await vi.advanceTimersByTimeAsync(8000 + VAKTHUND_MARGIN_MS);
    await tikk();
    expect(s.utfall).toBeInstanceOf(Error);
  });
});

describe('finnFerskPosisjon utenfor iOS', () => {
  it('nettleseren: maximumAge 0 holder der, så tidsstempelet avgjør ingenting', async () => {
    gjeldendePlattform = 'web';
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    // En nettleser med rar klokke i tidsstempelet skal ikke miste posisjonen sin.
    letinger[0].lever({ ...LYSNING, accuracy: 20, timestamp: 978_307_200_000 });
    await tikk();
    expect(s.utfall).toMatchObject({ ...LYSNING, accuracy: 20 });
  });

  it('Android: pluginen følger maximumAge, og en feilstilt enhetsklokke skal ikke gjøre hver måling «gammel»', async () => {
    gjeldendePlattform = 'android';
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    letinger[0].lever({ ...LYSNING, accuracy: 15, timestamp: NAA - 10 * 60_000 });
    await tikk();
    expect(s.utfall).toMatchObject({ ...LYSNING, accuracy: 15 });
  });

  it('nettleseren har alt sagt nei: svarer med en gang i stedet for å vente ut fristen', async () => {
    gjeldendePlattform = 'web';
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'denied' }) } });
    await expect(finnFerskPosisjon({ timeoutMs: 8000 })).rejects.toThrow(/avslått/);
    expect(letinger).toHaveLength(0);
  });

  it('en nettleser uten svar på tillatelsesspørsmålet (eldre Safari) lar letingen svare', async () => {
    gjeldendePlattform = 'web';
    vi.stubGlobal('navigator', {
      permissions: {
        query: async () => {
          throw new TypeError('geolocation is not a valid PermissionName');
        }
      }
    });
    const s = folg(finnFerskPosisjon({ targetAccuracyM: 30, timeoutMs: 8000, naa: () => NAA }));
    await tikk();
    expect(letinger).toHaveLength(1);
    letinger[0].lever(fersk(10));
    await tikk();
    expect(s.utfall).toEqual(fersk(10));
  });

  it('i skallet spørres ikke nettleserens tillatelses-API — pluginen eier tillatelsen der', async () => {
    gjeldendePlattform = 'ios';
    const query = vi.fn(async () => ({ state: 'denied' }));
    vi.stubGlobal('navigator', { permissions: { query } });
    void finnFerskPosisjon({ timeoutMs: 8000, naa: () => NAA }).catch(() => {});
    await tikk();
    expect(query).not.toHaveBeenCalled();
    expect(letinger).toHaveLength(1);
  });
});
