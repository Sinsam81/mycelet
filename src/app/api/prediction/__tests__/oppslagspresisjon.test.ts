import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PROVIDER_DECIMALS } from '@/lib/privacy/provider-precision';

/**
 * Punktet /api/prediction får, er enhetens GPS-posisjon eller kartsenteret —
 * ofte nettopp der brukeren står i sitt eget soppsted. Ruta sendte det med
 * full presisjon videre til værleverandøren, og i fallback-banen også til
 * skog- og høydeoppslaget. /api/findings og /api/spot-feedback rundet allerede
 * av; denne ruta var søskenet som ble glemt.
 *
 * Testen går gjennom fallback-banen, fordi det er den som kaller alle tre.
 */

type Punkt = { lat: number; lon: number };
const sett: { vaer: Punkt[]; skog: Punkt[]; hoyde: Punkt[] } = { vaer: [], skog: [], hoyde: [] };

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async (punkt: Punkt) => {
    sett.vaer.push(punkt);
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
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
}));

// Ingen fliser for området → fallback-banen.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: async () => ({ data: [], error: null }) })
}));

vi.mock('@/lib/forest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forest')>()),
  getForestProperties: async (punkt: Punkt) => {
    sett.skog.push(punkt);
    return null;
  }
}));

vi.mock('@/lib/terrain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/terrain')>()),
  getElevation: async (punkt: Punkt) => {
    sett.hoyde.push(punkt);
    return null;
  }
}));

vi.mock('@/lib/supabase/paged-rpc', () => ({
  fetchRpcPaged: async () => ({ rows: [], truncated: false })
}));

function speciesTable() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: null, error: null })
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
    from: () => speciesTable(),
    rpc: async () => ({ data: [], error: null })
  })
}));

const { GET } = await import('../route');

/** Antall desimaler i tallet slik det ville stått i en URL. */
function desimaler(tall: number): number {
  const [, brok = ''] = String(tall).split('.');
  return brok.length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T09:00:00Z'));
  sett.vaer = [];
  sett.skog = [];
  sett.hoyde = [];
});

afterAll(() => {
  vi.useRealTimers();
});

describe('/api/prediction og eksterne stedsoppslag', () => {
  it('sender aldri mer enn tre desimaler til vær, skog og høyde', async () => {
    const res = await GET(
      new NextRequest('https://mycelet.com/api/prediction?lat=59.123456789&lon=10.987654321&radiusKm=15', {
        headers: { 'x-forwarded-for': '10.7.5.1' }
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe('computed_fallback');

    // Alle tre må faktisk ha blitt kalt — ellers tester vi ingenting.
    expect(sett.vaer).toHaveLength(1);
    expect(sett.skog).toHaveLength(1);
    expect(sett.hoyde).toHaveLength(1);

    for (const punkt of [...sett.vaer, ...sett.skog, ...sett.hoyde]) {
      expect(punkt).toEqual({ lat: 59.123, lon: 10.988 });
      expect(desimaler(punkt.lat)).toBeLessThanOrEqual(PROVIDER_DECIMALS);
      expect(desimaler(punkt.lon)).toBeLessThanOrEqual(PROVIDER_DECIMALS);
    }
  });
});
