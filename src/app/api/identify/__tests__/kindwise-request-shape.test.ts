import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Hva denne fila vokter: SELVE FORMEN på forespørselen til Kindwise.
 *
 * Fram til 29. sep 2026 sendte ruta `language` og `details` i JSON-kroppen.
 * Hos Kindwise er de URL-parametre, og kroppen tar bare bilder, posisjon og
 * «modifiers». Hvert eneste kall fikk 400 «Unknown modifier: language=`no`»,
 * ruta svarte 502 «Identifikasjon feilet», og 2 050 kreditter lå urørt i
 * fire måneder. De andre testene mocker fetch og leste bare kroppen — en
 * feil URL og et par ekstra felt var usynlige for dem.
 */

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

/** Rader skrevet med tjenesterollen, per tabell — kvoteteller og feilteller. */
const adminInserts: Array<{ tabell: string; rad: Record<string, unknown> }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabell: string) => ({
      insert: async (rad: Record<string, unknown>) => {
        adminInserts.push({ tabell, rad });
        return { error: null };
      }
    })
  })
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
        Promise.resolve({ data: name === 'mushroom_species' ? KANTARELL : null, error: null }),
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

type Kall = { url: URL; body: Record<string, unknown> };
let kall: Kall[] = [];
let svar: Array<() => Response> = [];

const OK_SVAR = () =>
  new Response(
    JSON.stringify({
      result: {
        is_mushroom: { binary: true },
        classification: {
          suggestions: [
            { name: 'Cantharellus cibarius', probability: 0.92, details: { common_names: [], edibility: 'edible' } }
          ]
        }
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

const SPRAK_AVVIST = () =>
  new Response('Unknown modifier: language=`no`. Available modifiers: [similar_images=true]', {
    status: 400,
    headers: { 'content-type': 'text/plain' }
  });

function makeRequest() {
  return new NextRequest('https://mycelet.com/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'x'.repeat(100), latitude: 59.9, longitude: 10.7 })
  });
}

beforeEach(() => {
  kall = [];
  adminInserts.length = 0;
  svar = [OK_SVAR];
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    kall.push({ url: new URL(String(url)), body: JSON.parse(String(init?.body ?? '{}')) });
    const neste = svar.shift() ?? OK_SVAR;
    return neste();
  });
});

describe('forespørselen til Kindwise', () => {
  it('sender details og language som URL-parametre', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(kall).toHaveLength(1);
    const { url } = kall[0];
    expect(url.origin + url.pathname).toBe('https://mushroom.kindwise.com/api/v1/identification');
    expect(url.searchParams.get('language')).toBe('no');
    expect(url.searchParams.get('details')?.split(',')).toEqual(
      expect.arrayContaining(['common_names', 'taxonomy', 'description', 'edibility'])
    );
  });

  it('kroppen inneholder BARE bilder, posisjon og similar_images', async () => {
    await POST(makeRequest());
    const { body } = kall[0];
    expect(Object.keys(body).sort()).toEqual(['images', 'latitude', 'longitude', 'similar_images']);
    expect(body.similar_images).toBe(true);
    expect(Array.isArray(body.images)).toBe(true);
    // De to som drepte funksjonen skal aldri tilbake i kroppen.
    expect(body).not.toHaveProperty('language');
    expect(body).not.toHaveProperty('details');
  });

  it('avvist språkkode → ett nytt kall uten language, og brukeren får svaret', async () => {
    svar = [SPRAK_AVVIST, OK_SVAR];
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(kall).toHaveLength(2);
    expect(kall[0].url.searchParams.get('language')).toBe('no');
    expect(kall[1].url.searchParams.get('language')).toBeNull();
    expect(kall[1].url.searchParams.get('details')).toBe(kall[0].url.searchParams.get('details'));
    expect(kall[1].body).toEqual(kall[0].body);
  });

  it('en annen 400 prøves IKKE på nytt — den er 502 til brukeren', async () => {
    svar = [() => new Response('Invalid image data', { status: 400 })];
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    expect(kall).toHaveLength(1);
    expect((await res.json()).code).toBe('provider_failed');
  });

  it('et avvist svar skriver én rad i ai_identifiseringsfeil med statusen — uten bruker-ID', async () => {
    // Uten denne raden er «alle kall feiler» og «ingen bruker AI-en» samme
    // tall i dagsrapporten (migrasjon 073). Kvoteraden skal IKKE skrives:
    // kallet kostet ingenting.
    svar = [() => new Response('Invalid image data', { status: 400 })];
    await POST(makeRequest());
    expect(adminInserts).toEqual([{ tabell: 'ai_identifiseringsfeil', rad: { status: 400 } }]);
  });

  it('et vellykket svar skriver kvoteraden, ikke feilraden', async () => {
    await POST(makeRequest());
    expect(adminInserts.map((i) => i.tabell)).toEqual(['ai_identifications']);
  });

  it('is_mushroom fra Mushroom.id leses som isPlant', async () => {
    const res = await POST(makeRequest());
    expect((await res.json()).isPlant).toBe(true);
  });
});
