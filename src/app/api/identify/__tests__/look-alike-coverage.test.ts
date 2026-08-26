import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 24 av 45 spiselige arter i katalogen har NULL forvekslingsrader. For dem
 * rendret ruta et helt rent resultat: ingen advarsel, og ingen forbehold.
 *
 * Det er ikke til å skille fra en art vi har sjekket og funnet trygg — og
 * landingssiden lover samtidig at forslaget «alltid» kommer med farlige
 * forvekslingsarter tydelig merket.
 *
 * Ruta skiller nå tre tilstander. Testene under fastholder at de FAKTISK er
 * forskjellige i svaret, ikke bare i typen.
 */

let lookAlikeRows: unknown[] = [];
let lookAlikeError: { message: string } | null = null;
let speciesRow: Record<string, unknown> | null = null;

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

const HVIT_FLUESOPP = {
  id: 99,
  norwegian_name: 'Grønn fluesopp',
  swedish_name: 'Lömsk flugsvamp',
  primary_image_url: null,
  edibility: 'deadly'
};

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
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
      maybeSingle: () => Promise.resolve({ data: name === 'mushroom_species' ? speciesRow : null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (name === 'look_alikes') {
          return Promise.resolve({ data: lookAlikeError ? null : lookAlikeRows, error: lookAlikeError }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
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
async function identify() {
  n += 1;
  const res = await POST(
    new NextRequest('https://mycelet.com/api/identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${n}` },
      body: JSON.stringify({ image: 'x'.repeat(100) })
    })
  );
  const body = await res.json();
  return { status: res.status, body, top: body.suggestions?.[0] };
}

beforeEach(() => {
  lookAlikeRows = [];
  lookAlikeError = null;
  speciesRow = KANTARELL;
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

describe('de tre tilstandene er faktisk forskjellige i svaret', () => {
  it('rader finnes → present, og advarselen følger med', async () => {
    lookAlikeRows = [
      { species_id: 1, danger_level: 'critical', similarity_description: null, difference_description: null, la: HVIT_FLUESOPP }
    ];
    const { top } = await identify();
    expect(top.lookAlikeData).toBe('present');
    expect(top.dangerousLookAlikes?.[0]?.name).toBe('Grønn fluesopp');
  });

  it('arten finnes hos oss, men ingen rader → none_recorded', async () => {
    lookAlikeRows = [];
    const { top } = await identify();
    expect(top.lookAlikeData).toBe('none_recorded');
    expect(top.dangerousLookAlikes ?? []).toHaveLength(0);
  });

  it('spørringen feilet → unavailable', async () => {
    lookAlikeError = { message: 'boom' };
    const { top, body } = await identify();
    expect(top.lookAlikeData).toBe('unavailable');
    expect(body.safetyDataIncomplete).toBe(true);
  });

  it('arten er ikke i katalogen vår → unavailable, ikke none_recorded', async () => {
    // Uten speciesId har vi ingen dekning å love. «Ingen registrert» ville
    // vært en påstand om en art vi ikke kjenner.
    speciesRow = null;
    const { top } = await identify();
    expect(top.speciesId).toBeUndefined();
    expect(top.lookAlikeData).toBe('unavailable');
  });
});

describe('feilen dette ble skrevet for', () => {
  it('«ingen rader» og «rader finnes, ingen farlige» gir IKKE samme svar', async () => {
    lookAlikeRows = [];
    const utenRader = (await identify()).top;

    lookAlikeRows = [
      { species_id: 1, danger_level: 'low', similarity_description: null, difference_description: null, la: { id: 50, norwegian_name: 'Falsk kantarell', swedish_name: 'Falsk kantarell', edibility: 'edible', primary_image_url: null } }
    ];
    const medUfarligRad = (await identify()).top;

    // Begge har null FARLIGE forvekslingsarter å vise. Før skilnaden fantes
    // rendret de identisk. Nå kan klienten se forskjell.
    expect(utenRader.lookAlikeData).toBe('none_recorded');
    expect(medUfarligRad.lookAlikeData).toBe('present');
    expect(utenRader.lookAlikeData).not.toBe(medUfarligRad.lookAlikeData);
  });

  it('feltet finnes på hvert forslag, ikke bare på det øverste', async () => {
    // safetyDataIncomplete var globalt for hele svaret. Dekningen varierer per
    // art, så tilstanden må ligge per forslag.
    const { body } = await identify();
    for (const s of body.suggestions) expect(s.lookAlikeData).toBeDefined();
  });
});
