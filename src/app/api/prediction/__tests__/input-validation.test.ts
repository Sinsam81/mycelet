import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/prediction er offentlig og nåbar utlogget. Den var den eneste av de fem
 * koordinatrutene uten nærværs- og områdesjekk:
 *
 *   Number(url.searchParams.get('lat'))  →  Number(null) === 0
 *   Number.isFinite(0)                   →  true
 *
 * Et kall uten `lat` svarte derfor HTTP 200 med en troverdig score for 0°N —
 * Guineabukta — og et kall uten `lon` for Nordsjøen. Ingenting i svaret sa at
 * inndata var tomme. Samme sak for lat=91 / lon=200.
 *
 * `speciesId` gikk rått inn i en int-parameter i RPC-en, så «1.5» eller «1e308»
 * ga HTTP 500 med PostgreSQLs egen feiltekst tilbake til den som spurte.
 */

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

/** Sant hvis noe i det hele tatt slapp forbi valideringen. */
let weatherCalls = 0;
vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async () => {
    weatherCalls += 1;
    return {
      source: 'met_frost',
      temperatureC: 15,
      humidityPct: 80,
      rain3dMm: 7,
      rain7dMm: 14,
      rain14dMm: 24,
      minTemp7dC: 9,
      maxTemp7dC: 21,
      soilMoistureIndex: 0.6,
      dailyPrecipMm: null
    };
  }
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'free', status: 'none', paid: false, aiDailyLimit: 3 })
}));

/** RPC-en som ville fått et ugyldig artsnummer. Teller kall for å bevise vakten. */
let tileRpcCalls = 0;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => {
      tileRpcCalls += 1;
      return { data: [], error: null };
    }
  })
}));

vi.mock('@/lib/forest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forest')>()),
  getForestProperties: async () => null
}));

vi.mock('@/lib/terrain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/terrain')>()),
  getElevation: async () => null
}));

vi.mock('@/lib/supabase/paged-rpc', () => ({
  fetchRpcPaged: async () => ({ rows: [], truncated: false })
}));

vi.mock('@/lib/supabase/server', () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: null, error: null })
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from: () => builder,
      rpc: async () => ({ data: [], error: null })
    })
  };
});

const { GET } = await import('../route');

let n = 0;
async function call(query: string) {
  n += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/prediction${query}`, {
      // Egen IP per kall, ellers slår rate limit inn midt i suiten.
      headers: { 'x-forwarded-for': `10.7.0.${n}` }
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  weatherCalls = 0;
  tileRpcCalls = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T09:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('koordinatvalidering', () => {
  it('avviser kall helt uten parametere i stedet for å svare for 0°N 0°Ø', async () => {
    const { status, body } = await call('');
    expect(status).toBe(400);
    expect(body.score).toBeUndefined();
    expect(weatherCalls).toBe(0);
  });

  it('avviser manglende lon (0°Ø ligger i Nordsjøen)', async () => {
    const { status } = await call('?lat=59.91');
    expect(status).toBe(400);
  });

  it('avviser manglende lat (0°N ligger i Guineabukta)', async () => {
    const { status } = await call('?lon=10.75');
    expect(status).toBe(400);
  });

  it('avviser tom streng, ikke bare fravær', async () => {
    const { status } = await call('?lat=59.91&lon=');
    expect(status).toBe(400);
  });

  it('avviser breddegrad utenfor jorden', async () => {
    expect((await call('?lat=91&lon=10.75')).status).toBe(400);
    expect((await call('?lat=-91&lon=10.75')).status).toBe(400);
  });

  it('avviser lengdegrad utenfor jorden', async () => {
    expect((await call('?lat=59.91&lon=200')).status).toBe(400);
    expect((await call('?lat=59.91&lon=-181')).status).toBe(400);
  });

  it('slipper fortsatt gjennom et ekte punkt', async () => {
    const { status, body } = await call('?lat=59.91&lon=10.75');
    expect(status).toBe(200);
    expect(typeof body.score).toBe('number');
  });

  it('slipper gjennom et eksplisitt 0,0 bare når begge er skrevet ut', async () => {
    // Null Island er en gyldig koordinat. Poenget er at den må BES om.
    const { status } = await call('?lat=0&lon=0');
    expect(status).toBe(200);
  });
});

describe('artsnummer', () => {
  it('avviser desimaltall i stedet for å la Postgres feile', async () => {
    const { status, body } = await call('?lat=59.91&lon=10.75&speciesId=1.5');
    expect(status).toBe(400);
    expect(tileRpcCalls).toBe(0);
    // Og feilteksten skal ikke være databasens.
    expect(body.error).not.toMatch(/integer|postgres|syntax/i);
  });

  it('avviser tall som ikke er heltall i int-området', async () => {
    expect((await call('?lat=59.91&lon=10.75&speciesId=1e308')).status).toBe(400);
    expect((await call('?lat=59.91&lon=10.75&speciesId=-5')).status).toBe(400);
    expect((await call('?lat=59.91&lon=10.75&speciesId=0')).status).toBe(400);
  });

  it('slipper gjennom et ekte artsnummer', async () => {
    const { status } = await call('?lat=59.91&lon=10.75&speciesId=7');
    expect(status).toBe(200);
    expect(tileRpcCalls).toBe(1);
  });

  it('behandler ugyldig tekst som «ingen art», som før', async () => {
    // Number('x') er NaN → speciesId blir NaN, ikke et tall RPC-en kan feile på.
    const { status } = await call('?lat=59.91&lon=10.75&speciesId=x');
    expect(status).toBe(400);
  });
});
