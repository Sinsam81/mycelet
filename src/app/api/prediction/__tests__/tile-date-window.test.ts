import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * `tileDate` er UTC-datoen, mens flisjobben er planlagt «15 1 * * *» (UTC).
 * Mellom midnatt UTC og cron-en har kjørt finnes det derfor ingen fliser for
 * dagens dato, og ruta falt til den nøytrale fallback-formelen: annen modell,
 * tomt hotspot-lag, ingen skogdata og ingen artsnavn ved siden av tallet.
 *
 * Ruta prøver nå gårsdagens raster i det vinduet — ETT døgn tilbake, aldri mer —
 * og oppgir hvilken dags raster tallet står på.
 */

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

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

/** Hvilke datoer rasteret faktisk har fliser for. */
let datesWithTiles = new Set<string>(['2026-08-01']);
const requestedDates: string[] = [];

function tile() {
  return {
    id: 'flis-1',
    center_lat: 59.79,
    center_lng: 10.65,
    score: 62,
    species_id: 901,
    confidence: 70,
    components: {
      vegetation: 70,
      moisture: 60,
      terrain: 80,
      history: 0,
      forest: { forestType: 'gran', productivity: 17, volumePerHa: 300, source: 'sr16' },
      habitat: { score: 0.9, reasons: ['Treslag (gran) matcher artens partnere.'], reasonsSv: [] }
    }
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_fn: string, args: { p_tile_date: string }) => {
      requestedDates.push(args.p_tile_date);
      return { data: datesWithTiles.has(args.p_tile_date) ? [tile()] : [], error: null };
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
    maybeSingle: async () => ({ data: { id: 901, norwegian_name: 'Kantarell', swedish_name: 'Kantarell' }, error: null })
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
      headers: { 'x-forwarded-for': `10.12.0.${n}` }
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  datesWithTiles = new Set(['2026-08-01']);
  requestedDates.length = 0;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('flisdato i vinduet før nattens jobb', () => {
  it('bruker gårsdagens raster i stedet for den nøytrale fallback-formelen', async () => {
    // 00:30 UTC 2. august — cron-en (01:15 UTC) har ikke kjørt ennå.
    vi.setSystemTime(new Date('2026-08-02T00:30:00Z'));
    const { body } = await predict();

    expect(body.source).toBe('prediction_tiles');
    expect(body.tileDate).toBe('2026-08-01');
    expect(requestedDates).toEqual(['2026-08-02', '2026-08-01']);
  });

  it('går aldri mer enn ett døgn tilbake', async () => {
    vi.setSystemTime(new Date('2026-08-02T00:30:00Z'));
    datesWithTiles = new Set(['2026-07-25']); // jobben har vært nede i en uke
    const { body } = await predict();

    // Da skal den nøytrale fallback-banen slå til — ikke en uke gammel flis.
    expect(body.source).toBe('computed_fallback');
    expect(requestedDates).toEqual(['2026-08-02', '2026-08-01']);
  });

  it('prøver ikke gårsdagen resten av døgnet', async () => {
    vi.setSystemTime(new Date('2026-08-02T14:00:00Z'));
    const { body } = await predict();

    expect(body.source).toBe('computed_fallback');
    expect(requestedDates).toEqual(['2026-08-02']);
  });

  it('bruker dagens raster når det finnes, og sier hvilken dato', async () => {
    vi.setSystemTime(new Date('2026-08-02T14:00:00Z'));
    datesWithTiles = new Set(['2026-08-02']);
    const { body } = await predict();

    expect(body.source).toBe('prediction_tiles');
    expect(body.tileDate).toBe('2026-08-02');
    expect(requestedDates).toEqual(['2026-08-02']);
  });
});
