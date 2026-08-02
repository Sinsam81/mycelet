import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Sesongpilla i AI-resultatet («Utenom sesong» / «Utanför säsong») og
 * ×0,7-nedrangeringen bak den kom fra det HÅNDSATTE katalogvinduet.
 *
 * Piggsopp (id 7) står med sep–nov i katalogen, mens 1219 av 4305 daterte funn
 * er gjort i august. Fotograferte brukeren en piggsopp i august, fortalte appen
 * altså at det korrekte svaret ikke kunne stemme — på den ene flaten som finnes
 * for å gjøre folk mer treffsikre.
 *
 * Testen går gjennom POST-handleren, ikke bare hjelperen: feilen lå i hvilket
 * vindu ruta valgte, og et vindu kan byttes tilbake uten at en ren
 * hjelpertest merker det.
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
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${n}` },
    body: JSON.stringify({ image: 'x'.repeat(100) })
  });
}

beforeEach(() => {
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  vi.stubGlobal('fetch', async () =>
    new Response(
      JSON.stringify({
        result: {
          is_plant: { binary: false },
          classification: {
            suggestions: [
              { name: 'Hydnum repandum', probability: 0.9, details: { common_names: [], edibility: 'edible' } }
            ]
          }
        }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
});

async function topSuggestionOn(isoDate: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoDate));
  const res = await POST(makeRequest());
  const body = await res.json();
  return body.suggestions?.[0];
}

describe('sesongpilla på AI-forslaget', () => {
  it('piggsopp i august merkes IKKE «utenom sesong»', async () => {
    const top = await topSuggestionOn('2026-08-15T10:00:00Z');
    expect(top.inSeason).toBe(true);
  });

  it('piggsopp i september er fortsatt topp-sesong', async () => {
    const top = await topSuggestionOn('2026-09-15T10:00:00Z');
    expect(top.inSeason).toBe(true);
    expect(top.peakSeason).toBe(true);
  });

  it('piggsopp i februar er fortsatt utenom sesong — vinduet er ikke slått av', async () => {
    const top = await topSuggestionOn('2026-02-15T10:00:00Z');
    expect(top.inSeason).toBe(false);
  });
});
