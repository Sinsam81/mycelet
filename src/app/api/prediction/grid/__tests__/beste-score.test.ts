import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { CONDITION_THRESHOLDS } from '@/lib/utils/prediction';
import { MIN_SKOGDEKNING, nesteSteg } from '@/lib/map/lovende-sok';

/**
 * «⭐ Lovende» utenfor sesong.
 *
 * Ruta svarer med en tom liste når ingen rute når bunngrensen for «lovende» —
 * det er riktig. Men kartet kunne ikke skille den tomme lista fra «ingen skog
 * her»: det utvidet søket til 35 km over fire kall og ba så en bruker midt i
 * skogen om å flytte kartet nærmere skog. Svaret bærer nå også `bestScore`, så
 * kartet kan stoppe etter første kall og si at det er forholdene
 * (src/lib/map/lovende-sok.ts).
 *
 * Testen går gjennom hele ruta med appens egne formler, for begge årstidene.
 * Datoen er låst — ruta leser måned og dag i året fra klokka.
 */

const NORDMARKA = { lat: 60.05, lng: 10.65 };
const RADIUS_DEG = 0.045; // ~5 km i bredde, som klienten ber om først

let currentUserId = 'bruker-0';
let paidUser = true;
let skogFinnes = true;

const VINTER = {
  temperatureC: -2,
  humidityPct: 88,
  rain3dMm: 4,
  rain7dMm: 9,
  rain14dMm: 20,
  minTemp7dC: -8,
  maxTemp7dC: 1,
  soilMoistureIndex: 0.5
};
const HOST = {
  temperatureC: 13.4,
  humidityPct: 82,
  rain3dMm: 4.2,
  rain7dMm: 19,
  rain14dMm: 41.6,
  minTemp7dC: 7,
  maxTemp7dC: 18,
  soilMoistureIndex: 0.62
};
let vaer: typeof VINTER = VINTER;

vi.mock('@/lib/forest', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/forest')>();
  return {
    ...original,
    getForestProperties: async () =>
      skogFinnes
        ? { forestType: 'gran', ageYears: null, productivity: 14, volumePerHa: 250, source: 'sr16' as const }
        : null
  };
});

vi.mock('@/lib/terrain', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/terrain')>();
  return { ...original, getElevation: async () => ({ elevationM: 250, terrainClass: 'Skog' }) };
});

vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async () => ({
    source: 'met_frost' as const,
    humidityEstimated: false,
    precipDailyMm: null,
    ...vaer
  })
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({
    tier: paidUser ? 'premium' : 'free',
    status: 'active',
    paid: paidUser,
    aiDailyLimit: null
  })
}));

vi.mock('@/lib/supabase/paged-rpc', () => ({
  fetchRpcPaged: async () => ({ rows: [], truncated: false })
}));

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

interface Svar {
  cells: { lat: number; lng: number; score: number }[];
  coverage: number;
  bestScore?: number | null;
  access: string;
  n: number;
}

let kall = 0;
async function rutenett(ekstra: Record<string, string> = { top: '12' }): Promise<{ status: number; body: Svar }> {
  kall += 1;
  currentUserId = `bruker-beste-${kall}`; // egen ratelimit-bøtte per kall
  const params = new URLSearchParams({
    minLat: String(NORDMARKA.lat - RADIUS_DEG),
    maxLat: String(NORDMARKA.lat + RADIUS_DEG),
    minLng: String(NORDMARKA.lng - RADIUS_DEG * 2),
    maxLng: String(NORDMARKA.lng + RADIUS_DEG * 2),
    n: '7',
    ...ekstra
  });
  const res = await GET(new NextRequest(`https://mycelet.com/api/prediction/grid?${params.toString()}`));
  return { status: res.status, body: (await res.json()) as Svar };
}

beforeEach(() => {
  // Bare Date — ruta bruker ekte tidsavbrudd rundt skogoppslagene.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-15T09:00:00Z'));
  paidUser = true;
  skogFinnes = true;
  vaer = VINTER;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('/api/prediction/grid?top= — den beste ruta følger med også når ingen er lovende', () => {
  it('granskog i januar: ingen lovende ruter, men skogen er der og tallet sier hvor langt unna', async () => {
    const { status, body } = await rutenett();
    expect(status).toBe(200);
    // Bunngrensen står: ingenting kalles lovende.
    expect(body.cells).toEqual([]);
    // Skogen er målt i hver rute …
    expect(body.coverage).toBe(1);
    // … og den beste av dem ligger langt under grensen.
    expect(typeof body.bestScore).toBe('number');
    expect(body.bestScore as number).toBeLessThan(CONDITION_THRESHOLDS.moderate - 10);
    expect(body.bestScore as number).toBeGreaterThanOrEqual(0);
  });

  it('kartet stopper på det svaret: ett kall, og det er forholdene som får skylden', async () => {
    const { body } = await rutenett();
    expect(
      nesteSteg({
        serverCellsEmpty: body.cells.length === 0,
        coverage: body.coverage,
        bestScore: body.bestScore,
        radiusIndex: 0
      })
    ).toBe('stopp_forhold');
  });

  it('gratisbrukere får det samme tallet — ett regionalt tall, ikke et sted', async () => {
    paidUser = false;
    const { status, body } = await rutenett();
    expect(status).toBe(200);
    expect(body.access).toBe('free_limited');
    expect(body.n).toBe(5);
    expect(body.cells).toEqual([]);
    expect(body.coverage).toBeGreaterThanOrEqual(MIN_SKOGDEKNING);
    expect(typeof body.bestScore).toBe('number');
    expect(body.bestScore as number).toBeLessThan(CONDITION_THRESHOLDS.moderate);
  });

  it('ingen skog i noen rute: tallet er null og dekningen 0 — da skal kartet utvide som før', async () => {
    skogFinnes = false;
    const { body } = await rutenett();
    expect(body.cells).toEqual([]);
    expect(body.coverage).toBe(0);
    expect(body.bestScore).toBeNull();
    expect(
      nesteSteg({ serverCellsEmpty: true, coverage: body.coverage, bestScore: body.bestScore, radiusIndex: 0 })
    ).toBe('utvid');
  });

  it('i sesong er tallet scoren til det beste av stedene som returneres', async () => {
    vi.setSystemTime(new Date('2026-09-01T09:00:00Z'));
    vaer = HOST;
    const { body } = await rutenett();
    expect(body.cells.length).toBeGreaterThan(0);
    expect(body.bestScore).toBe(Math.max(...body.cells.map((c) => c.score)));
    expect(body.bestScore as number).toBeGreaterThanOrEqual(CONDITION_THRESHOLDS.moderate);
  });

  it('varmekart-modus (uten top) er uendret: ingen bestScore', async () => {
    const { status, body } = await rutenett({});
    expect(status).toBe(200);
    expect('bestScore' in body).toBe(false);
    expect(body.coverage).toBe(1);
  });
});
