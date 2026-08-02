import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Flisbanen leste habitatbegrunnelsen rått fra `prediction_tiles`, der
 * cron-jobben hadde skrevet den på norsk. En svensk leser fikk derfor
 * «Treslag (gran) matcher artens partnere.» midt i en ellers svensk
 * forklaringsliste — mens de tre søskenrutene (grid, species-spots og
 * fallback-banen) oversetter riktig.
 *
 * Generatoren lagrer nå begge språk i flisa. Er `reasonsSv` ikke der (en flis
 * skrevet før endringen), skal begrunnelsen UTELATES for svenske lesere — ikke
 * vises på norsk.
 */

let locale: 'nb' | 'sv' = 'nb';
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => locale }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async () => ({
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
  })
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
}));

/** Én flis med skogdata og habitatbegrunnelse i begge språk. */
let habitatComponent: Record<string, unknown> | null = {
  score: 0.9,
  reasons: ['Treslag (gran) matcher artens partnere.'],
  reasonsSv: ['Trädslaget (gran) matchar artens värdträd.']
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({
      data: [
        {
          id: 'flis-1',
          center_lat: 59.79,
          center_lng: 10.65,
          score: 60,
          species_id: 901,
          confidence: 70,
          components: {
            vegetation: 70,
            moisture: 60,
            terrain: 80,
            history: 0,
            forest: { forestType: 'gran', productivity: 17, volumePerHa: 300, source: 'sr16' },
            habitat: habitatComponent
          }
        }
      ],
      error: null
    })
  })
}));

vi.mock('@/lib/supabase/server', () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({
      data: { id: 901, norwegian_name: 'Kantarell', swedish_name: 'Kantarell' },
      error: null
    })
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
      from: () => builder,
      rpc: async () => ({ data: [], error: null })
    })
  };
});

const { GET } = await import('../route');

let n = 0;
async function predict() {
  n += 1;
  const res = await GET(
    new NextRequest('https://mycelet.com/api/prediction?lat=59.79&lon=10.65&radiusKm=15', {
      headers: { 'x-forwarded-for': `10.11.0.${n}` }
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T09:00:00Z'));
  locale = 'nb';
  habitatComponent = {
    score: 0.9,
    reasons: ['Treslag (gran) matcher artens partnere.'],
    reasonsSv: ['Trädslaget (gran) matchar artens värdträd.']
  };
});

afterAll(() => {
  vi.useRealTimers();
});

describe('habitatbegrunnelse fra flisbanen', () => {
  it('svarer faktisk fra flisbanen', async () => {
    const { body } = await predict();
    expect(body.source).toBe('prediction_tiles');
  });

  it('gir norsk leser den norske begrunnelsen', async () => {
    const { body } = await predict();
    expect(body.habitat.reasons).toEqual(['Treslag (gran) matcher artens partnere.']);
  });

  it('gir svensk leser den svenske begrunnelsen, ikke den norske', async () => {
    locale = 'sv';
    const { body } = await predict();
    expect(body.habitat.reasons).toEqual(['Trädslaget (gran) matchar artens värdträd.']);
    expect(JSON.stringify(body.habitat)).not.toContain('matcher artens partnere');
  });

  it('beholder habitatscoren i begge språk', async () => {
    locale = 'sv';
    const { body } = await predict();
    expect(body.habitat.score).toBe(0.9);
  });

  it('utelater begrunnelsen heller enn å vise norsk, på fliser fra før endringen', async () => {
    habitatComponent = { score: 0.9, reasons: ['Treslag (gran) matcher artens partnere.'] };
    locale = 'sv';
    const { body } = await predict();
    expect(body.habitat.score).toBe(0.9);
    expect(body.habitat.reasons).toEqual([]);
  });
});
