import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Hele veien fra `reports`-tabellen til e-posten eieren får.
 *
 * De rene testene (route.test.ts, dagsrapport.test.ts) viser at tallene blir
 * til riktig tekst. Denne viser at cron-ruta faktisk LESER dem — med konsollens
 * regel for «åpen», bare som lesing — og at rapporten går ut også når den ene
 * lesingen feiler.
 */

const NAA = new Date('2026-09-15T04:00:00Z');

interface Kall {
  tabell: string;
  metode: string;
  args: unknown[];
}

type Svar = { data: unknown; count?: number | null; error: { code?: string; message?: string } | null };

let rapporterSvar: Svar = { data: [], count: 0, error: null };
let kall: Kall[] = [];

/**
 * Bare lesemetoder. Kaller ruta noe annet (insert, update, delete, upsert),
 * finnes ikke metoden, og testen feiler — rapporten skal aldri skrive.
 */
function makeAdminClient() {
  return {
    auth: { admin: {} },
    from(tabell: string) {
      const bygger: Record<string, unknown> = {};
      for (const metode of ['select', 'order', 'range', 'gte', 'eq', 'limit', 'in']) {
        bygger[metode] = (...args: unknown[]) => {
          kall.push({ tabell, metode, args });
          return bygger;
        };
      }
      const svar: Svar = tabell === 'reports' ? rapporterSvar : { data: [], count: 0, error: null };
      bygger.then = (resolve: (v: Svar) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(svar).then(resolve, reject);
      return bygger;
    }
  };
}

const epost = vi.hoisted(() => ({ sendEpost: vi.fn(async (_args: { emne: string; html: string; tekst: string }) => ({ ok: true, detalj: 'sendt' })) }));
const warnings: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));
vi.mock('@/lib/supabase/alle-brukere', () => ({ MAKS_SIDER: 50, hentAlleBrukere: async () => ({ brukere: [], avkortet: false }) }));
vi.mock('@/lib/email/send', () => epost);
vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: () => true }));
vi.mock('@/lib/identifications/kindwise-status', () => ({ erAiNokkelSatt: () => false, hentKindwiseStatus: vi.fn() }));
vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    error: vi.fn(),
    warn: (msg: string, ctx?: Record<string, unknown>) => {
      warnings.push({ msg, ctx });
    },
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

const { GET } = await import('../route');

function kjor() {
  return GET(new NextRequest('https://www.mycelet.com/api/cron/dagsrapport', { headers: { authorization: 'Bearer test' } }));
}

function sendt() {
  expect(epost.sendEpost).toHaveBeenCalledTimes(1);
  return epost.sendEpost.mock.calls[0][0];
}

const timerSiden = (t: number) => new Date(NAA.getTime() - t * 3_600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NAA);
  kall = [];
  warnings.length = 0;
  rapporterSvar = { data: [], count: 0, error: null };
  epost.sendEpost.mockClear();
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dagsrapporten leser åpne rapporter', () => {
  it('to åpne, den eldste 30 t gammel: i emnet, i e-posten, i svaret og i loggen', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(30) }], count: 2, error: null };

    const res = await kjor();
    expect(res.status).toBe(200);

    const e = sendt();
    expect(e.emne).toContain('⚠️ 2 åpne rapporter over døgnfristen');
    for (const variant of [e.html, e.tekst]) {
      expect(variant).toContain('2 åpne rapporter i forumet — den eldste har ventet 30 t, fristen på 24 t gikk ut i dag kl. 00:00.');
      expect(variant).toContain('https://www.mycelet.com/forum/moderation');
    }

    const body = (await res.json()) as { rapport: { moderering: unknown } };
    expect(body.rapport.moderering).toEqual({
      maalt: true,
      antall: 2,
      eldsteTimer: 30,
      overFrist: true,
      fristUtloper: '2026-09-14T22:00:00.000Z',
      fristTekst: 'i dag kl. 00:00',
      haster: true,
      varsel: '2 åpne rapporter i forumet — den eldste har ventet 30 t, fristen på 24 t gikk ut i dag kl. 00:00'
    });
    expect(warnings.find((w) => w.msg === 'dagsrapport.rapporter_over_frist')?.ctx).toEqual({ antall: 2, eldsteTimer: 30, fristTimer: 24 });
  });

  it('spør med konsollens regel for «åpen», og leser bare tidsstempelet', async () => {
    await kjor();
    const mot = kall.filter((k) => k.tabell === 'reports');
    expect(mot.find((k) => k.metode === 'select')?.args).toEqual(['created_at', { count: 'exact' }]);
    expect(mot.find((k) => k.metode === 'in')?.args).toEqual(['status', ['pending', 'reviewed']]);
    expect(mot.find((k) => k.metode === 'order')?.args).toEqual(['created_at', { ascending: true }]);
    expect(mot.find((k) => k.metode === 'limit')?.args).toEqual([1]);
  });

  it('ingen åpne: ingen varsling noe sted', async () => {
    const res = await kjor();
    expect(res.status).toBe(200);
    const e = sendt();
    expect(e.emne).not.toContain('⚠️');
    expect(e.tekst).toMatch(/åpne rapporter i forumet \.+ 0\n/);
    expect(warnings.map((w) => w.msg)).not.toContain('dagsrapport.rapporter_over_frist');
    expect(warnings.map((w) => w.msg)).not.toContain('dagsrapport.aapne_rapporter_feilet');
  });

  it('åpne innenfor fristen varsles i e-posten, men ikke som «over frist» i loggen', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(3) }], count: 1, error: null };
    await kjor();
    const e = sendt();
    expect(e.emne).toContain('⚠️ 1 åpen rapport — frist i morgen kl. 03:00');
    expect(e.tekst).toContain('Behandle den før det: https://www.mycelet.com/forum/moderation');
    expect(warnings.map((w) => w.msg)).not.toContain('dagsrapport.rapporter_over_frist');
  });

  it('feiler lesingen, går rapporten ut likevel — med «ikke målt», ikke «0»', async () => {
    rapporterSvar = { data: null, count: null, error: { message: 'connection reset' } };

    const res = await kjor();
    expect(res.status).toBe(200);

    const e = sendt();
    expect(e.emne).not.toContain('⚠️');
    for (const variant of [e.html, e.tekst]) {
      expect(variant).toContain('ikke målt — tabellen reports svarte ikke');
    }
    expect(warnings.find((w) => w.msg === 'dagsrapport.aapne_rapporter_feilet')?.ctx).toEqual({ message: 'connection reset', mangler: false });
  });
});
