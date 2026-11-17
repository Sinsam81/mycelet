import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/identify vurderer «i sesong» ut fra måneden. Serveren går i UTC, så
 * `new Date().getMonth()` svarte for forrige måned i en til to timer etter
 * midnatt ved hvert månedsskifte. Ruta bruker nå Oslo-måneden
 * (src/lib/api/oslo-dag.ts); denne testen går gjennom POST-handleren med
 * falske klokker og ser hvilken måned berikelsen får.
 *
 * Mockene er de samme som i season-pill.test.ts.
 */

/** Ekte rad: piggsopp, med katalogvinduet slik det står i migrasjonene. */
const PIGGSOPP = {
  id: 7,
  norwegian_name: 'Piggsopp',
  swedish_name: 'Blek taggsvamp',
  edibility: 'edible',
  primary_image_url: null,
  season_start: 9,
  season_end: 11,
  peak_season_start: 9,
  peak_season_end: 10
};

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

const maaneder = vi.hoisted(() => [] as number[]);
vi.mock('@/lib/identifications/enrich', async (importOriginal) => {
  const ekte = await importOriginal<typeof import('@/lib/identifications/enrich')>();
  return {
    ...ekte,
    enrichSuggestions: (...args: Parameters<typeof ekte.enrichSuggestions>) => {
      maaneder.push(args[2].month);
      return ekte.enrichSuggestions(...args);
    }
  };
});

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) })
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
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
      gte: () => builder,
      lte: () => builder,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({ data: name === 'mushroom_species' ? PIGGSOPP : null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
    };
    return builder;
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
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
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.8.0.${n}` },
    body: JSON.stringify({ image: 'x'.repeat(100) })
  });
}

beforeEach(() => {
  maaneder.length = 0;
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  vi.stubGlobal('fetch', async () =>
    new Response(
      JSON.stringify({
        result: {
          is_plant: { binary: false },
          classification: {
            suggestions: [{ name: 'Hydnum repandum', probability: 0.9, details: { common_names: [], edibility: 'edible' } }]
          }
        }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function maanedKl(iso: string): Promise<number> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  const res = await POST(makeRequest());
  expect(res.status).toBe(200);
  return maaneder[maaneder.length - 1];
}

describe('/api/identify vurderer sesongen i Oslo-måneden', () => {
  it('1. november kl. 00.30 i Oslo er november, selv om UTC fortsatt er 31. oktober', async () => {
    expect(await maanedKl('2026-10-31T23:30:00Z')).toBe(11);
  });

  it('1. juni kl. 01.30 i Oslo (sommertid) er juni', async () => {
    expect(await maanedKl('2026-05-31T23:30:00Z')).toBe(6);
  });

  it('kl. 23.30 i Oslo 31. mai er fortsatt mai', async () => {
    expect(await maanedKl('2026-05-31T21:30:00Z')).toBe(5);
  });
});
