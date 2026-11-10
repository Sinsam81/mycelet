import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { _resetAllBuckets } from '@/lib/rate-limit';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Døgngrensa på AI-identifikasjon — den eneste kostnaden per bruker som ikke
 * har en hard grense noe annet sted.
 *
 * Testene kjører hele POST-handleren mot en liten tabell i minnet, fordi det
 * som skal bevises er REKKEFØLGEN: raden reserveres FØR det betalte kallet og
 * gis tilbake når kallet ikke kostet noe. Den forrige mocken svarte et fast
 * tall på hver telling og kunne derfor ikke se feilen den skulle vokte mot —
 * at parallelle kall alle så samme forbruk og alle slapp gjennom.
 *
 * Grensa gjelder gratiskontoer: FREE_DAILY_AI_LIMIT, med oppgraderingsteksten
 * (daily_quota). Betalte kontoer og prøveperioder har ingen døgngrense — det
 * er det «ubegrenset» på salgsflatene betyr (se siste describe).
 */

type Rad = { id: number; user_id: string; created_at: string };

const BRUKER = 'gratisbruker';
let rader: Rad[] = [];
let nesteId = 1;
let feilrader: Array<Record<string, unknown>> = [];
let slettet: number[] = [];
let mockPaid = false;
/** Reservasjons-insert-en svarer med feil (tabellen skrivebeskyttet e.l.). */
let reserverFeiler = false;
/** Tjenesterollen mangler helt: createAdminClient kaster. */
let adminMangler = false;
/** Reservefunn i den gamle findings-tellingen. */
let legacyFunn = 0;

function seed(antall: number) {
  for (let i = 0; i < antall; i++) {
    rader.push({ id: nesteId++, user_id: BRUKER, created_at: new Date().toISOString() });
  }
}

const KANTARELL = {
  id: 1,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  edibility: 'edible',
  primary_image_url: null,
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9
};

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (adminMangler) throw new Error('SUPABASE_SERVICE_ROLE_KEY mangler');
    return {
      from: (tabell: string) => {
        const filtre: Array<(r: Rad) => boolean> = [];
        let modus: 'select' | 'insert' | 'delete' = 'select';
        let innsatt: Rad | null = null;
        let insertFeil: { message: string } | null = null;
        const treff = () => rader.filter((r) => filtre.every((f) => f(r)));
        const builder = {
          // Etter insert() betyr select('id') «gi meg raden tilbake».
          select: () => builder,
          eq: (kol: keyof Rad, verdi: unknown) => {
            filtre.push((r) => r[kol] === verdi);
            return builder;
          },
          gte: (kol: keyof Rad, verdi: string | number) => {
            filtre.push((r) => r[kol] >= verdi);
            return builder;
          },
          lte: (kol: keyof Rad, verdi: string | number) => {
            filtre.push((r) => r[kol] <= verdi);
            return builder;
          },
          insert: (rad: Record<string, unknown>) => {
            modus = 'insert';
            if (tabell === 'ai_identifiseringsfeil') {
              feilrader.push(rad);
            } else if (reserverFeiler) {
              insertFeil = { message: 'insert avvist' };
            } else {
              innsatt = { id: nesteId++, user_id: String(rad.user_id), created_at: new Date().toISOString() };
              rader.push(innsatt);
            }
            return builder;
          },
          delete: () => {
            modus = 'delete';
            return builder;
          },
          single: async () => ({ data: innsatt, error: insertFeil }),
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            let svar: unknown;
            if (modus === 'select') {
              svar = { count: treff().length, error: null };
            } else if (modus === 'delete') {
              const bort = treff();
              slettet.push(...bort.map((r) => r.id));
              rader = rader.filter((r) => !bort.includes(r));
              svar = { error: null };
            } else {
              svar = { error: insertFeil };
            }
            return Promise.resolve(svar).then(resolve, reject);
          }
        };
        return builder;
      }
    };
  }
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({
    tier: mockPaid ? 'premium' : 'free',
    // 'trialing' med vilje: en prøveuke gir samme tilgang som en betalt plan.
    status: mockPaid ? 'trialing' : 'none',
    paid: mockPaid,
    aiDailyLimit: mockPaid ? null : FREE_DAILY_AI_LIMIT
  })
}));

vi.mock('@/lib/supabase/server', () => {
  const table = (name: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      // Historikkraden (migrasjon 055) skrives med ØKTKLIENTEN. Uten denne
      // ville insert kastet, og recordIdentification ville svelget kastet —
      // skrivestien hadde vært helt utestet.
      insert: async () => ({ error: null }),
      ilike: () => builder,
      in: () => builder,
      eq: () => builder,
      gte: () => builder,
      lte: () => builder,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({ data: name === 'mushroom_species' ? KANTARELL : null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          name === 'findings' ? { count: legacyFunn, error: null } : { data: [], error: null }
        ).then(resolve)
    };
    return builder;
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: BRUKER } }, error: null }) },
      from: table
    })
  };
});

const { POST } = await import('../route');

function makeRequest(body: unknown = { image: 'x'.repeat(100) }) {
  return new NextRequest('https://mycelet.com/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const OK_SVAR = () =>
  new Response(
    JSON.stringify({
      result: {
        is_plant: { binary: false },
        classification: {
          suggestions: [
            { name: 'Cantharellus cibarius', probability: 0.92, details: { common_names: [], edibility: 'edible' } }
          ]
        }
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

let kindwiseKall = 0;
function stubKindwise(svar: () => Response | Promise<Response> = OK_SVAR) {
  vi.stubGlobal('fetch', async () => {
    kindwiseKall += 1;
    return svar();
  });
}

beforeEach(() => {
  rader = [];
  nesteId = 1;
  feilrader = [];
  slettet = [];
  mockPaid = false;
  reserverFeiler = false;
  adminMangler = false;
  legacyFunn = 0;
  kindwiseKall = 0;
  // Burst-vernet (20/min) er nøklet på bruker-ID og deles ellers av alle
  // testene i fila.
  _resetAllBuckets();
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  stubKindwise();
});

describe('gratiskvoten på AI-identifikasjon', () => {
  it('kall nummer fem slipper gjennom', async () => {
    seed(FREE_DAILY_AI_LIMIT - 1);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).freeQuotaRemaining).toBe(0);
  });

  it('kall nummer seks avvises med 429 og kode daily_quota', async () => {
    seed(FREE_DAILY_AI_LIMIT);
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    // Koden er det klienten forgrener på — teksten er oversatt og kan endres.
    expect(body.code).toBe('daily_quota');
    expect(body.error).toContain(String(FREE_DAILY_AI_LIMIT));
  });

  it('et avvist kall koster oss ingenting hos leverandøren — og skriver ingenting', async () => {
    seed(FREE_DAILY_AI_LIMIT + 10);
    await POST(makeRequest());
    expect(kindwiseKall).toBe(0);
    expect(rader).toHaveLength(FREE_DAILY_AI_LIMIT + 10);
  });

  it('et vellykket gratis-kall telles opp — uten dette nås grensa aldri', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Nøyaktig ÉN rad: reservasjonen ER kvoteraden, ikke en i tillegg.
    expect(rader).toHaveLength(1);
    expect((await res.json()).freeQuotaRemaining).toBe(FREE_DAILY_AI_LIMIT - 1);
  });
});

describe('reservasjonen før det betalte kallet', () => {
  it('to parallelle kall på 4 av 5: ett går til Kindwise, ett får 429', async () => {
    // Selve feilen: begge telte 4, begge slapp gjennom, og raden ble først
    // skrevet etter sekundene hos Kindwise.
    seed(FREE_DAILY_AI_LIMIT - 1);
    const svar = await Promise.all([POST(makeRequest()), POST(makeRequest())]);
    expect(svar.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(kindwiseKall).toBe(1);
    expect(rader).toHaveLength(FREE_DAILY_AI_LIMIT);
  });

  it('ti parallelle kall fra en fersk gratiskonto gir aldri flere enn kvoten hos Kindwise', async () => {
    const svar = await Promise.all(Array.from({ length: 10 }, () => POST(makeRequest())));
    expect(kindwiseKall).toBe(FREE_DAILY_AI_LIMIT);
    expect(svar.filter((r) => r.status === 200)).toHaveLength(FREE_DAILY_AI_LIMIT);
    expect(svar.filter((r) => r.status === 429)).toHaveLength(10 - FREE_DAILY_AI_LIMIT);
    // De avviste har gitt plassen sin tilbake.
    expect(rader).toHaveLength(FREE_DAILY_AI_LIMIT);
  });

  it('Kindwise avviser kallet → reservasjonen gis tilbake, brukeren belastes ikke', async () => {
    stubKindwise(() => new Response('Invalid image data', { status: 502 }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    expect(rader).toHaveLength(0);
    expect(slettet).toHaveLength(1);
    expect(feilrader).toEqual([{ status: 502 }]);
  });

  it('Kindwise svarer aldri → reservasjonen gis tilbake', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(504);
    expect(rader).toHaveLength(0);
    expect(feilrader).toEqual([{ status: 0 }]);
  });

  it('svaret stopper midt i kroppen ETTER et OK → kreditten er brukt, raden står', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
    }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(504);
    expect(rader).toHaveLength(1);
    expect(slettet).toHaveLength(0);
  });

  it('en ugyldig payload reserverer ingenting', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(rader).toHaveLength(0);
    expect(slettet).toHaveLength(0);
    expect(kindwiseKall).toBe(0);
  });

  it('feiler reservasjonen, går kallet videre på forhåndssjekken — aldri en 500', async () => {
    reserverFeiler = true;
    seed(FREE_DAILY_AI_LIMIT - 1);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(kindwiseKall).toBe(1);
  });

  it('… men forhåndssjekken holder fortsatt taket når reservasjonen feiler', async () => {
    reserverFeiler = true;
    seed(FREE_DAILY_AI_LIMIT);
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(kindwiseKall).toBe(0);
  });

  it('uten tjenesterollen brukes den gamle funn-tellingen, og ingenting reserveres', async () => {
    adminMangler = true;
    legacyFunn = FREE_DAILY_AI_LIMIT - 1;
    expect((await POST(makeRequest())).status).toBe(200);
    legacyFunn = FREE_DAILY_AI_LIMIT;
    const avvist = await POST(makeRequest());
    expect(avvist.status).toBe(429);
    expect((await avvist.json()).code).toBe('daily_quota');
    expect(rader).toHaveLength(0);
  });
});

describe('betalte kontoer og prøveperioder', () => {
  beforeEach(() => {
    mockPaid = true;
  });

  it('betalende kunde rammes ikke av GRATISkvoten', async () => {
    seed(FREE_DAILY_AI_LIMIT + 20);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // null = ingen kvotelinje i UI-et.
    expect((await res.json()).freeQuotaRemaining).toBeNull();
  });

  it('har ingen døgngrense så lenge planen selges som «ubegrenset»', async () => {
    // Salgsflatene lover ubegrenset AI-identifikasjon, uten forbehold. Et tak
    // for betalende — også et rent misbrukstak — kan derfor ikke innføres i
    // ruta alene: tallet og teksten er eierens beslutning, og forbeholdet må
    // inn i prisside og vilkår i SAMME endring. Feiler denne testen fordi noen
    // har lagt inn et tak, er det de to linjene under som skal endres først.
    expect(nb.Pricing.premiumFeature1).toMatch(/ubegrenset/i);
    expect(sv.Pricing.premiumFeature1).toMatch(/obegränsad/i);

    seed(500);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(kindwiseKall).toBe(1);
  });

  it('ti parallelle kall fra en betalt konto går alle til Kindwise', async () => {
    const svar = await Promise.all(Array.from({ length: 10 }, () => POST(makeRequest())));
    expect(svar.every((r) => r.status === 200)).toBe(true);
    expect(kindwiseKall).toBe(10);
    // … og hvert av dem står i kostnadsregnskapet.
    expect(rader).toHaveLength(10);
  });

  it('betalende kunde telles OGSÅ opp — kostnaden gjelder alle', async () => {
    // Hvert kall koster oss det samme hos Kindwise uansett hvem som gjorde
    // det. Teller vi bare gratisbrukere, kan ingen svare på hva de betalte
    // kontoene koster — eller se om én konto bruker urimelig mye.
    await POST(makeRequest());
    expect(rader).toHaveLength(1);
  });

  it('raden skrives først når Kindwise har svart OK — ingen reservasjon å gi tilbake', async () => {
    stubKindwise(() => new Response('Invalid image data', { status: 502 }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    expect(rader).toHaveLength(0);
    expect(slettet).toHaveLength(0);
  });

  it('uten tjenesterollen får en betalende kunde fortsatt svaret sitt', async () => {
    adminMangler = true;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });
});
