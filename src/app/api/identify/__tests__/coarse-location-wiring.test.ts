import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Hva denne fila vokter: at ruta FAKTISK grovkorner posisjonen før den sender
 * den til Kindwise — ikke bare at hjelperen `coarsenLocation` regner riktig.
 *
 * Hjelperen har 35 egne tester. Likevel kunne man fjerne kallet i route.ts og
 * sende brukerens eksakte GPS-punkt til en tredjepart i Tsjekkia med hele
 * testpakken grønn. Nettet lå på hjelperen, ikke på koblingen — nøyaktig samme
 * feilklasse som species-names.test.ts ble skrevet for: «hjelperen fantes og
 * var testet, men ruta kalte den ikke».
 *
 * Testene går derfor gjennom POST-handleren og leser kroppen som faktisk ble
 * sendt ut på nettet.
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

/** Kroppene som ble sendt til Kindwise, i rekkefølge. */
let sentBodies: Array<Record<string, unknown>> = [];

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://mycelet.com/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'x'.repeat(100), ...body })
  });
}

beforeEach(() => {
  sentBodies = [];
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    expect(String(url)).toContain('mushroom.kindwise.com');
    sentBodies.push(JSON.parse(String(init?.body ?? '{}')));
    return new Response(
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
  });
});

/** Kjører ruta og gir kroppen som forlot oss. */
async function bodySentFor(location: Record<string, unknown>) {
  const res = await POST(makeRequest(location));
  expect(res.status).toBe(200);
  expect(sentBodies).toHaveLength(1);
  return sentBodies[0];
}

describe('posisjonen som forlater oss', () => {
  it('sendes som midten av 0,1°-ruta — ikke brukerens punkt', async () => {
    const sent = await bodySentFor({ latitude: 59.9123, longitude: 10.7456 });
    expect(sent.latitude).toBe(59.95);
    expect(sent.longitude).toBe(10.75);
  });

  it('inneholder ALDRI det eksakte punktet brukeren sendte inn', async () => {
    const exactLat = 59.9123;
    const exactLon = 10.7456;
    const sent = await bodySentFor({ latitude: exactLat, longitude: exactLon });
    expect(sent.latitude).not.toBe(exactLat);
    expect(sent.longitude).not.toBe(exactLon);
    // Og punktet skal ikke ligge skjult noe annet sted i kroppen heller.
    const serialised = JSON.stringify(sent);
    expect(serialised).not.toContain(String(exactLat));
    expect(serialised).not.toContain(String(exactLon));
  });

  it('to punkter i samme rute blir umulige å skille fra hverandre', async () => {
    const first = await bodySentFor({ latitude: 59.9123, longitude: 10.7456 });
    sentBodies = [];
    const second = await bodySentFor({ latitude: 59.9987, longitude: 10.7001 });
    expect(second.latitude).toBe(first.latitude);
    expect(second.longitude).toBe(first.longitude);
  });

  it('uten posisjon sendes ingen posisjonsfelter i det hele tatt', async () => {
    const sent = await bodySentFor({});
    expect(sent).not.toHaveProperty('latitude');
    expect(sent).not.toHaveProperty('longitude');
  });

  it('ugyldig posisjon sendes heller ikke videre', async () => {
    const sent = await bodySentFor({ latitude: 999, longitude: 10.7456 });
    expect(sent).not.toHaveProperty('latitude');
    expect(sent).not.toHaveProperty('longitude');
  });

  it('bildet sendes fortsatt — grovkorningen tar ikke ned kallet', async () => {
    const sent = await bodySentFor({ latitude: 59.9123, longitude: 10.7456 });
    expect(Array.isArray(sent.images)).toBe(true);
  });
});
