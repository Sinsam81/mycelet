import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Halvdelen av adopsjonen som faktisk tar på databasen.
 *
 * `planleggAdopsjon` er ren og har sine egne tester (adopsjon.test.ts). Denne
 * fila dekker det planen ikke kan si noe om, og som to ruter lener seg på:
 *
 *   1. FEILSIKKERHETEN. GET og PUT i /api/me/soppvarsel kaller funksjonen med
 *      et bart `await` og uten egen try/catch — den innvendige er derfor
 *      bærende. Slipper en avvisning ut (manglende tjenestenøkkel, en
 *      forbigående PostgREST-feil), blir det en 500 på forsidekortet og på å
 *      slå PÅ varselet: nøyaktig det filhodet lover at ikke kan skje.
 *   2. SKRIVEVAKTENE. Hver UPDATE gjentar betingelsene fra lesingen
 *      (`is user_id null` + `eq email`), så en plan regnet på et litt gammelt
 *      bilde ikke kan skrive på en rad som i mellomtiden har fått en eier.
 *      Uten en test her kan vaktene fjernes uten at noe blir rødt.
 *
 * Ingen adresse skal noen gang havne i loggen. Det sjekkes også.
 */

interface Filter {
  fn: string;
  kolonne: string;
  verdi: unknown;
}

interface Kall {
  tabell: string;
  op: 'select' | 'update';
  verdier: Record<string, unknown> | null;
  filtre: Filter[];
}

const h = vi.hoisted(() => ({
  klient: null as unknown,
  kastVedOpprettelse: false
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (h.kastVedOpprettelse) throw new Error('Supabase admin client mangler SUPABASE_SERVICE_ROLE_KEY');
    return h.klient;
  }
}));

import { adopterKontolosVarsler, type EgenVarselRad, type KontolosVarselRad } from '../adopsjon';

const MIN = 'sopp@eksempel.no';
const BRUKER = 'u-1';

const kontolos = (over: Partial<KontolosVarselRad> = {}): KontolosVarselRad => ({
  id: 'k1',
  user_id: null,
  email: MIN,
  region: 'Bergen',
  active: true,
  confirmed_at: '2026-08-01T10:00:00Z',
  ...over
});

const egen = (over: Partial<EgenVarselRad> = {}): EgenVarselRad => ({ id: 'e1', region: 'Bergen', active: true, ...over });

/**
 * Minste mulige PostgREST-etterligning: `.select()`/`.update()` gir en kjede
 * som kan ventes på, og hvert filter noteres. Svaret velges av filtrene, slik
 * den ekte spørringen også gjør — leser vi `is user_id null` er det de
 * kontoløse radene som skal komme tilbake.
 */
function lagKlient(opsjoner: {
  kontolose?: KontolosVarselRad[];
  egne?: EgenVarselRad[];
  lesefeil?: string;
  skrivefeil?: string;
}): Kall[] {
  const logg: Kall[] = [];

  const bygg = (tabell: string, op: Kall['op'], verdier: Record<string, unknown> | null) => {
    const kall: Kall = { tabell, op, verdier, filtre: [] };
    logg.push(kall);
    const svar = () => {
      if (op === 'update') return { data: null, error: opsjoner.skrivefeil ? { message: opsjoner.skrivefeil } : null };
      if (opsjoner.lesefeil) return { data: null, error: { message: opsjoner.lesefeil } };
      const kontolosSporring = kall.filtre.some((f) => f.fn === 'is' && f.kolonne === 'user_id');
      return { data: kontolosSporring ? (opsjoner.kontolose ?? []) : (opsjoner.egne ?? []), error: null };
    };
    const kjede = {
      is: (kolonne: string, verdi: unknown) => (kall.filtre.push({ fn: 'is', kolonne, verdi }), kjede),
      eq: (kolonne: string, verdi: unknown) => (kall.filtre.push({ fn: 'eq', kolonne, verdi }), kjede),
      in: (kolonne: string, verdi: unknown) => (kall.filtre.push({ fn: 'in', kolonne, verdi }), kjede),
      then: (ok: (v: unknown) => unknown, nei?: (e: unknown) => unknown) => Promise.resolve(svar()).then(ok, nei)
    };
    return kjede;
  };

  h.klient = {
    from: (tabell: string) => ({
      select: () => bygg(tabell, 'select', null),
      update: (verdier: Record<string, unknown>) => bygg(tabell, 'update', verdier)
    })
  };
  return logg;
}

function lagLogg() {
  return { warn: vi.fn(), info: vi.fn() };
}

const oppdateringer = (logg: Kall[]) => logg.filter((k) => k.op === 'update');
const harFilter = (kall: Kall, fn: string, kolonne: string, verdi?: unknown) =>
  kall.filtre.some((f) => f.fn === fn && f.kolonne === kolonne && (verdi === undefined || f.verdi === verdi));

beforeEach(() => {
  h.klient = null;
  h.kastVedOpprettelse = false;
});

describe('adopterKontolosVarsler', () => {
  it('kaster aldri når tjenestenøkkelen mangler — ruta svarer som før', async () => {
    h.kastVedOpprettelse = true;
    const log = lagLogg();
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: MIN, log });
    expect(plan).toEqual({ adopter: [], deaktiverKontolos: [], aktiverEgen: [] });
    expect(log.warn).toHaveBeenCalledWith('varseladopsjon.hoppet_over', expect.anything());
  });

  it('en lesefeil gir tom plan uten å kaste, og ingen adresse i loggen', async () => {
    const logg = lagKlient({ lesefeil: 'PGRST301' });
    const log = lagLogg();
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: MIN, log });
    expect(plan).toEqual({ adopter: [], deaktiverKontolos: [], aktiverEgen: [] });
    expect(log.warn).toHaveBeenCalledWith('varseladopsjon.lesing_feilet', { message: 'PGRST301' });
    // Ingenting skrives når vi ikke vet hva vi leste.
    expect(oppdateringer(logg)).toHaveLength(0);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('eksempel.no');
  });

  it('leser bare kontoløse rader på brukerens egen adresse, og kontoens egne rader', async () => {
    const logg = lagKlient({ kontolose: [], egne: [] });
    await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: '  Sopp@Eksempel.NO ', log: lagLogg() });

    const lesninger = logg.filter((k) => k.op === 'select');
    expect(lesninger).toHaveLength(2);
    const kontolosLesing = lesninger.find((k) => harFilter(k, 'is', 'user_id'))!;
    expect(kontolosLesing.tabell).toBe('alert_subscriptions');
    expect(harFilter(kontolosLesing, 'is', 'user_id', null)).toBe(true);
    // Små bokstaver: kolonnen skrives slik, og den unike indeksen står på lower(email).
    expect(harFilter(kontolosLesing, 'eq', 'email', MIN)).toBe(true);
    const egenLesing = lesninger.find((k) => !harFilter(k, 'is', 'user_id'))!;
    expect(harFilter(egenLesing, 'eq', 'user_id', BRUKER)).toBe(true);
  });

  it('adopsjonen skriver bare på kontoløse rader med nøyaktig samme adresse', async () => {
    const logg = lagKlient({ kontolose: [kontolos()], egne: [] });
    const log = lagLogg();
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: 'Sopp@Eksempel.no', log });

    expect(plan.adopter).toEqual(['k1']);
    const skriv = oppdateringer(logg);
    expect(skriv).toHaveLength(1);
    expect(skriv[0].verdier).toEqual({ user_id: BRUKER });
    expect(harFilter(skriv[0], 'in', 'id', undefined)).toBe(true);
    expect(skriv[0].filtre.find((f) => f.fn === 'in')!.verdi).toEqual(['k1']);
    // ⚠️ Vaktene: planen kan være regnet på et litt gammelt bilde.
    expect(harFilter(skriv[0], 'is', 'user_id', null)).toBe(true);
    expect(harFilter(skriv[0], 'eq', 'email', MIN)).toBe(true);
    // Tellinger, aldri adresser.
    expect(log.info).toHaveBeenCalledWith('varseladopsjon.utfort', {
      adoptert: 1,
      deaktivert: 0,
      aktivert: 0
    });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('eksempel.no');
  });

  it('kollisjon: den kontoløse raden slås av og kontoens egen skrus på — begge med sine vakter', async () => {
    const logg = lagKlient({ kontolose: [kontolos()], egne: [egen({ active: false })] });
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: MIN, log: lagLogg() });

    expect(plan).toEqual({ adopter: [], deaktiverKontolos: ['k1'], aktiverEgen: ['e1'] });
    const skriv = oppdateringer(logg);
    expect(skriv).toHaveLength(2);

    const av = skriv.find((k) => k.verdier?.active === false)!;
    expect(harFilter(av, 'is', 'user_id', null)).toBe(true);
    expect(harFilter(av, 'eq', 'email', MIN)).toBe(true);
    expect(av.filtre.find((f) => f.fn === 'in')!.verdi).toEqual(['k1']);

    const paa = skriv.find((k) => k.verdier?.active === true)!;
    // Kontoens egen rad: eid av brukeren, aldri av en adresse.
    expect(harFilter(paa, 'eq', 'user_id', BRUKER)).toBe(true);
    expect(harFilter(paa, 'eq', 'email')).toBe(false);
    expect(paa.filtre.find((f) => f.fn === 'in')!.verdi).toEqual(['e1']);
  });

  it('en skrivefeil kaster ikke, og planen kommer tilbake som den var', async () => {
    const logg = lagKlient({ kontolose: [kontolos()], egne: [], skrivefeil: 'deadlock detected' });
    const log = lagLogg();
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: MIN, log });

    expect(plan.adopter).toEqual(['k1']);
    expect(oppdateringer(logg)).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledWith('varseladopsjon.adopsjon_feilet', { message: 'deadlock detected' });
  });

  it('uten en adresse på kontoen røres databasen ikke i det hele tatt', async () => {
    const logg = lagKlient({ kontolose: [kontolos()], egne: [] });
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: null, log: lagLogg() });
    expect(plan).toEqual({ adopter: [], deaktiverKontolos: [], aktiverEgen: [] });
    expect(logg).toHaveLength(0);
  });

  it('tom plan skriver ingenting', async () => {
    const logg = lagKlient({ kontolose: [kontolos({ confirmed_at: null })], egne: [] });
    const plan = await adopterKontolosVarsler({ brukerId: BRUKER, brukerEpost: MIN, log: lagLogg() });
    expect(plan).toEqual({ adopter: [], deaktiverKontolos: [], aktiverEgen: [] });
    expect(oppdateringer(logg)).toHaveLength(0);
  });
});
