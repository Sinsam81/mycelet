import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { dayOfYearOf } from '@/lib/prediction/phenology';

/**
 * Rutenettet regner med Oslo-dagen, både for måneden og for dagen i året.
 *
 * Serveren går i UTC. Ruta tok måneden fra Oslo-datoen, men dagen i året fra
 * UTC (`dayOfYearOf(new Date())`). Mellom midnatt og kl. 01 (vintertid) eller
 * 02 (sommertid) norsk tid ble hver rute da regnet med to forskjellige dager —
 * 1. september kl. 00.30 var måneden september, men fenologien ble slått opp
 * for 31. august — og med en annen dag enn /api/prediction og species-spots,
 * som tegner det samme kartet. Se src/lib/api/oslo-dag.ts.
 *
 * Testen går gjennom hele ruta og ser hvilken dag hver rute faktisk regnes med.
 */

const NORDMARKA = { lat: 60.05, lng: 10.65 };
const RADIUS_DEG = 0.045;

/** Det computeCellPrediction fikk, én rad per rute. */
const regnetMed: Array<{ month: number; dayOfYear: number | undefined }> = [];

vi.mock('@/lib/prediction/cell-score', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prediction/cell-score')>();
  return {
    ...original,
    computeCellPrediction: (input: Parameters<typeof original.computeCellPrediction>[0]) => {
      regnetMed.push({ month: input.month, dayOfYear: input.dayOfYear });
      return original.computeCellPrediction(input);
    }
  };
});

vi.mock('@/lib/forest', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/forest')>();
  return {
    ...original,
    getForestProperties: async () => ({
      forestType: 'gran',
      ageYears: null,
      productivity: 14,
      volumePerHa: 250,
      source: 'sr16' as const
    })
  };
});

vi.mock('@/lib/terrain', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/terrain')>();
  return { ...original, getElevation: async () => ({ elevationM: 250, terrainClass: 'Skog' }) };
});

vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async () => ({
    source: 'met_frost' as const,
    temperatureC: 13.4,
    humidityPct: 82,
    humidityEstimated: false,
    rain3dMm: 4.2,
    rain7dMm: 19,
    rain14dMm: 41.6,
    minTemp7dC: 7,
    maxTemp7dC: 18,
    soilMoistureIndex: 0.62,
    precipDailyMm: null
  })
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
}));

vi.mock('@/lib/supabase/paged-rpc', () => ({
  fetchRpcPaged: async () => ({ rows: [], truncated: false })
}));

let currentUserId = 'bruker-0';

function speciesTable() {
  const result = { data: [], error: null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
    from: () => speciesTable(),
    rpc: async () => ({ data: [], error: null })
  })
}));

const { GET } = await import('../route');

let kall = 0;
/** Ett varmekart over Nordmarka, slik kartet ber om det, kl. `utc`. */
async function rutenettKl(utc: string) {
  vi.setSystemTime(new Date(utc));
  kall += 1;
  currentUserId = `bruker-oslo-dag-${kall}`; // egen ratelimit-bøtte per kall
  const params = new URLSearchParams({
    minLat: String(NORDMARKA.lat - RADIUS_DEG),
    maxLat: String(NORDMARKA.lat + RADIUS_DEG),
    minLng: String(NORDMARKA.lng - RADIUS_DEG * 2),
    maxLng: String(NORDMARKA.lng + RADIUS_DEG * 2),
    n: '3'
  });
  const res = await GET(new NextRequest(`https://mycelet.com/api/prediction/grid?${params.toString()}`));
  // Én linje per kombinasjon ruta brukte. Riktig svar er nøyaktig én.
  const dager = [...new Set(regnetMed.map(({ month, dayOfYear }) => `måned ${month}, dag ${dayOfYear}`))];
  return { status: res.status, ruter: regnetMed.length, dager };
}

beforeEach(() => {
  // Bare Date — ruta bruker ekte tidsavbrudd rundt skogoppslagene.
  vi.useFakeTimers({ toFake: ['Date'] });
  regnetMed.length = 0;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('/api/prediction/grid regner med Oslo-dagen', () => {
  const OVER_MIDNATT = [
    {
      navn: 'sommertid: 1. september kl. 00.30 i Oslo er dag 244, ikke UTC-ens 31. august',
      utc: '2026-08-31T22:30:00Z',
      utcDag: 243,
      forventet: 'måned 9, dag 244'
    },
    {
      navn: 'vintertid: 1. desember kl. 00.30 i Oslo er dag 335, ikke UTC-ens 30. november',
      utc: '2026-11-30T23:30:00Z',
      utcDag: 334,
      forventet: 'måned 12, dag 335'
    },
    {
      navn: 'årsskiftet: 1. januar kl. 00.30 i Oslo er dag 1, ikke UTC-ens dag 365',
      utc: '2026-12-31T23:30:00Z',
      utcDag: 365,
      forventet: 'måned 1, dag 1'
    }
  ];

  for (const { navn, utc, utcDag, forventet } of OVER_MIDNATT) {
    it(navn, async () => {
      // Premisset: på dette tidspunktet er UTC-dagen en annen enn Oslo-dagen.
      expect(dayOfYearOf(new Date(utc))).toBe(utcDag);

      const { status, ruter, dager } = await rutenettKl(utc);
      expect(status).toBe(200);
      expect(ruter).toBeGreaterThan(0);
      expect(dager).toEqual([forventet]);
    });
  }

  it('kl. 23.30 i Oslo er det fortsatt samme dag — ruta hopper ikke en dag fram', async () => {
    const { status, ruter, dager } = await rutenettKl('2026-08-31T21:30:00Z');
    expect(status).toBe(200);
    expect(ruter).toBeGreaterThan(0);
    expect(dager).toEqual(['måned 8, dag 243']);
  });
});
