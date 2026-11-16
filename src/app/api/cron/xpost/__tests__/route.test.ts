import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * X-posteren og en natt uten lagrede regionscorer.
 *
 * E-postvarselet brobygger et hull på én–to dager i region_daily_scores
 * (src/lib/alerts/historikk.ts). X-posteren leste bare raden for nøyaktig
 * datoen før, så det samme omslaget gikk ut på e-post og aldri på X — og
 * bunnteksten i e-posten sier at omslagene også publiseres åpent der.
 *
 * Reglene er testet som rene funksjoner i src/lib/x/__tests__/innlegg.test.ts.
 * Denne fila låser at SELVE RUTA bruker dem: Supabase, X og Resend er
 * erstattet, så ingenting postes og ingenting skrives herfra.
 */

interface Score {
  region: string;
  tile_date: string;
  score: number;
}

let scorer: Score[] = [];
let xInnlegg: Array<{ dato: string; type: string; tekst: string }> = [];
let hendelser: unknown[] = [];
let postet: string[] = [];
let presse: Array<{ til: string; emne: string; tekst: string }> = [];

vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: (h: string | null) => h === 'Bearer hemmelig' }));
const logger = vi.hoisted(() => {
  const l = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => l };
  return l;
});
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logger }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock('@/lib/x/klient', () => ({
  manglendeXKonfig: () => [],
  postTilX: async (tekst: string) => {
    postet.push(tekst);
    return { ok: true, tweetId: `post-${postet.length}` };
  }
}));
vi.mock('@/lib/email/send', () => ({
  sendEpost: async (args: { til: string; emne: string; tekst: string }) => {
    presse.push(args);
    return { ok: true, detalj: 'sendt' };
  }
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabell: string) => {
      // Kjedbar OG ventbar, som supabase-byggeren. Svaret regnes ut idet
      // kjeden ventes på — én gang per spørring, som i ruta.
      const bygger = (op: 'select' | 'upsert' | 'update', payload?: unknown) => {
        const grense: { fra?: string; til?: string } = {};
        const svar = () => {
          if (tabell === 'region_daily_scores') {
            return {
              data: scorer.filter((r) => (!grense.fra || r.tile_date >= grense.fra) && (!grense.til || r.tile_date <= grense.til)),
              error: null
            };
          }
          if (tabell === 'x_innlegg' && op === 'upsert') {
            const rad = payload as { dato: string; type: string; tekst: string };
            // unique (dato, type) + ignoreDuplicates: en dag som alt har raden gir ingen rad tilbake.
            if (xInnlegg.some((x) => x.dato === rad.dato && x.type === rad.type)) return { data: [], error: null };
            xInnlegg.push(rad);
            return { data: [{ id: `x-${xInnlegg.length}` }], error: null };
          }
          if (tabell === 'varsel_hendelser' && op === 'upsert') {
            hendelser.push(payload);
            return { error: null };
          }
          return { data: null, error: null };
        };
        const b: Record<string, unknown> = {
          select: () => b,
          order: () => b,
          limit: () => b,
          eq: () => b,
          gte: (_kol: string, v: string) => ((grense.fra = v), b),
          lte: (_kol: string, v: string) => ((grense.til = v), b),
          maybeSingle: async () => {
            if (tabell !== 'region_daily_scores') return { data: null, error: null };
            const siste = scorer.map((r) => r.tile_date).sort().pop();
            return { data: siste ? { tile_date: siste } : null, error: null };
          },
          then: (ok: (v: unknown) => unknown, feil?: (e: unknown) => unknown) => Promise.resolve(svar()).then(ok, feil)
        };
        return b;
      };
      return {
        select: () => bygger('select'),
        upsert: (payload: unknown) => bygger('upsert', payload),
        update: (payload: unknown) => bygger('update', payload)
      };
    }
  })
}));

const { GET } = await import('../route');

/** Dagene rundt omslaget. 10. september 2026 er en torsdag — ingen ukesoppsummering. */
const D_MINUS_3 = '2026-09-07';
const D_MINUS_2 = '2026-09-08';
const D_MINUS_1 = '2026-09-09';
const D = '2026-09-10';
const D_PLUSS_1 = '2026-09-11';

/** Kjører cronen slik Vercel gjør: 05:30 UTC den dagen. */
async function kjor(dag: string) {
  vi.setSystemTime(new Date(`${dag}T05:30:00.000Z`));
  const res = await GET({
    headers: new Headers({ authorization: 'Bearer hemmelig', 'x-request-id': 't' }),
    url: 'http://x/api/cron/xpost',
    nextUrl: new URL('http://x/api/cron/xpost')
  } as unknown as NextRequest);
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('PRESSE_VARSEL_TIL', 'eier@example.com');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.mycelet.com');
  scorer = [];
  xInnlegg = [];
  hendelser = [];
  postet = [];
  presse = [];
  logger.warn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('X-posteren — en natt uten lagrede regionscorer', () => {
  it('uten hull: omslaget postes som «i natt», og står i fasitloggen', async () => {
    scorer = [
      { region: 'Oslo', tile_date: D_MINUS_2, score: 66 },
      { region: 'Oslo', tile_date: D_MINUS_1, score: 70 },
      { region: 'Oslo', tile_date: D, score: 89 }
    ];
    const svar = await kjor(D);
    expect(svar).toMatchObject({ ok: true, tileDate: D, publisert: 1 });
    expect(postet).toHaveLength(1);
    expect(postet[0]).toContain('Soppvarselet slo ut i natt: forholdene i Oslo snudde — fra 66 til 89 av 100 siste uka.');
    expect(hendelser).toEqual([[{ region: 'Oslo', dato: D, fra_score: 66, til_score: 89 }]]);
    expect(presse[0].tekst).toContain('forholdene i Oslo snudde i natt');
    expect(logger.warn).not.toHaveBeenCalledWith('xpost.hull_i_historikk', expect.anything());
  });

  it('raden for D−1 mangler: omslaget postes likevel på D — uten «i natt» — og ikke en gang til på D+1', async () => {
    // ⚠️ REGRESJONSVAKT. Oslo er 70 på D−2 og 89 på D; natta imellom ble det
    // ikke lagret noe. E-postvarselet går ut på D. Før: ingen post på D (ingen
    // «i går»), ingen på D+1 («allerede bra») — omslaget kom aldri på X.
    scorer = [
      { region: 'Oslo', tile_date: D_MINUS_3, score: 66 },
      { region: 'Oslo', tile_date: D_MINUS_2, score: 70 },
      { region: 'Oslo', tile_date: D, score: 89 }
    ];
    const svar = await kjor(D);
    expect(svar).toMatchObject({ ok: true, tileDate: D, publisert: 1 });
    expect(postet).toHaveLength(1);
    expect(postet[0]).toContain('Soppvarselet slo ut: forholdene i Oslo snudde — fra 66 til 89 av 100 siste uka.');
    expect(postet[0]).not.toContain('i natt');
    // Samme rad som e-postvarselet skriver: (region, dato) for dagen påstanden gikk ut.
    expect(hendelser).toEqual([[{ region: 'Oslo', dato: D, fra_score: 66, til_score: 89 }]]);
    // Pitchen til eieren daterer heller ikke omslaget.
    expect(presse).toHaveLength(1);
    expect(presse[0].tekst).toContain('forholdene i Oslo har snudd — fra 66 til 89 av 100');
    expect(presse[0].tekst).not.toContain('snudde i natt');
    // Hullet skal ses i loggen, som i e-postcronen.
    expect(logger.warn).toHaveBeenCalledWith('xpost.hull_i_historikk', { tileDate: D, regioner: 1 });

    // Dagen etter er gårsdagen målt og over terskelen: ingenting nytt.
    scorer.push({ region: 'Oslo', tile_date: D_PLUSS_1, score: 91 });
    expect(await kjor(D_PLUSS_1)).toMatchObject({ ok: true, grunn: 'ingenting-aa-poste' });
    expect(postet).toHaveLength(1);
  });

  it('hullet gjelder bare regionen det står i: en region med målt gårsdag gjør ikke posten «i natt» alene', async () => {
    scorer = [
      { region: 'Oslo', tile_date: D_MINUS_2, score: 70 },
      { region: 'Oslo', tile_date: D, score: 89 },
      { region: 'Bergen', tile_date: D_MINUS_1, score: 68 },
      { region: 'Bergen', tile_date: D, score: 92 }
    ];
    await kjor(D);
    expect(postet).toHaveLength(1);
    expect(postet[0]).toContain('Soppvarselet slo ut: Bergen (68→92 av 100) og Oslo (70→89).');
    expect(postet[0]).not.toContain('i natt');
    // Pitchen er per region: Bergen er målt mot gårsdagen, Oslo ikke.
    expect(presse[0].tekst).toContain('forholdene i Bergen snudde i natt');
    expect(presse[0].tekst).toContain('forholdene i Oslo har snudd');
  });

  it('tre umålte dager er manglende data: ingen post', async () => {
    scorer = [
      { region: 'Oslo', tile_date: '2026-09-06', score: 70 },
      { region: 'Oslo', tile_date: D, score: 89 }
    ];
    expect(await kjor(D)).toMatchObject({ ok: true, grunn: 'ingenting-aa-poste' });
    expect(postet).toEqual([]);
    expect(presse).toEqual([]);
    expect(hendelser).toEqual([]);
  });

  it('over terskelen på begge sider av hullet: ikke et omslag', async () => {
    scorer = [
      { region: 'Oslo', tile_date: D_MINUS_3, score: 70 },
      { region: 'Oslo', tile_date: D_MINUS_2, score: 88 },
      { region: 'Oslo', tile_date: D, score: 90 }
    ];
    expect(await kjor(D)).toMatchObject({ ok: true, grunn: 'ingenting-aa-poste' });
    expect(postet).toEqual([]);
  });
});
