import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';

/**
 * Gratiskvoten på AI-identifikasjon er den eneste kostnaden per bruker som
 * ikke har en hard grense noe annet sted. I produksjon er den ALDRI utløst:
 * `ai_identifications` har null rader, så det femte kallet har aldri skjedd
 * hos en ekte gratisbruker. Koden var altså implementert, men uverifisert.
 *
 * Testene her kjører hele POST-handleren og dekker de fire tilstandene som
 * betyr noe: under grensa, på grensa, betalende kunde, og at telleren faktisk
 * skrives etter et vellykket kall (uten den teller ingenting opp mot grensa).
 */

let mockUsage = 0;
let mockPaid = false;
let insertCount = 0;

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
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: mockUsage, error: null }).then(resolve),
        insert: async () => {
          insertCount += 1;
          return { error: null };
        }
      };
      return builder;
    }
  })
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({
    tier: mockPaid ? 'premium' : 'free',
    status: mockPaid ? 'active' : 'none',
    paid: mockPaid,
    aiDailyLimit: mockPaid ? null : FREE_DAILY_AI_LIMIT
  })
}));

vi.mock('@/lib/supabase/server', () => {
  const table = (name: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      ilike: () => builder,
      in: () => builder,
      eq: () => builder,
      gte: () => builder,
      lte: () => builder,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({ data: name === 'mushroom_species' ? KANTARELL : null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
    };
    return builder;
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'gratisbruker' } }, error: null }) },
      from: table
    })
  };
});

const { POST } = await import('../route');

let n = 0;
function makeRequest() {
  n += 1;
  return new NextRequest('https://mycelet.com/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.4.0.${n}` },
    body: JSON.stringify({ image: 'x'.repeat(100) })
  });
}

beforeEach(() => {
  mockUsage = 0;
  mockPaid = false;
  insertCount = 0;
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  vi.stubGlobal('fetch', async () =>
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
    )
  );
});

describe('gratiskvoten på AI-identifikasjon', () => {
  it('kall nummer fem slipper gjennom', async () => {
    mockUsage = FREE_DAILY_AI_LIMIT - 1;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it('kall nummer seks avvises med 429 og kode daily_quota', async () => {
    mockUsage = FREE_DAILY_AI_LIMIT;
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    // Koden er det klienten forgrener på — teksten er oversatt og kan endres.
    expect(body.code).toBe('daily_quota');
    expect(body.error).toContain(String(FREE_DAILY_AI_LIMIT));
  });

  it('et avvist kall koster oss ingenting hos leverandøren', async () => {
    mockUsage = FREE_DAILY_AI_LIMIT + 10;
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await POST(makeRequest());
    expect(spy).not.toHaveBeenCalled();
  });

  it('betalende kunde rammes ikke av kvoten', async () => {
    mockPaid = true;
    mockUsage = FREE_DAILY_AI_LIMIT + 100;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it('et vellykket gratis-kall telles opp — uten dette nås grensa aldri', async () => {
    mockUsage = 0;
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(insertCount).toBe(1);
  });

  it('betalende kunde telles OGSÅ opp — kvoten gjelder gratis, kostnaden gjelder alle', async () => {
    // Denne testen sa tidligere det motsatte. Ruta ble endret med vilje, og
    // begrunnelsen står ved insert-en: hvert kall koster oss det samme hos
    // Kindwise uansett hvem som gjorde det. Teller vi bare gratisbrukere, kan
    // ingen svare på hva de betalte kontoene faktisk koster — og en betalt
    // konto har ingen døgngrense i dag.
    //
    // Kvote-SJEKKEN er uendret: spørringen mot forbruket kjører fortsatt bare
    // for !capabilities.paid, noe testen over («betalende kunde rammes ikke av
    // kvoten») fastholder. Det er forskjell på å telle og å begrense.
    mockPaid = true;
    await POST(makeRequest());
    expect(insertCount).toBe(1);
  });
});
