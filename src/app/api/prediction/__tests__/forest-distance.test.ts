import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildExplanation } from '@/lib/utils/prediction-explanation';

/**
 * «Skog her (NIBIO): granskog, bonitet 20» beskrev en skog 15,5 km unna.
 *
 * Ruta hentet alle fliser i en boks på ±15 km og plukket den HØYEST SCORENDE
 * med skogdata som «skogen her». For et punkt i Oslo sentrum (59,91/10,75) ga
 * det flisa på 59,78/10,65 — en ekte NIBIO-måling, bare fra et helt annet sted.
 * Ordet «her» var usant, og fordi habitatbegrunnelsen henger på den samme
 * flisa, leste brukeren en begrunnelse om et annet sted enn hen så på.
 *
 * Testen går gjennom HELE ruta og videre inn i teksten brukeren faktisk leser,
 * fordi feilen lå i koblingen mellom de to: å velge riktig flis hjelper ikke
 * hvis setningen fortsatt sier «her», og omvendt.
 */

const OSLO = { lat: 59.91, lon: 10.75 };

/** Ekte skogdata, langt unna: flisa fra funnet, 15,5 km sør for brukeren. */
const FJERN_FLIS = {
  id: 'fjern',
  center_lat: 59.78,
  center_lng: 10.65,
  score: 60,
  species_id: 1,
  confidence: 50,
  components: {
    vegetation: 40,
    moisture: 30,
    terrain: 20,
    history: 10,
    forest: { forestType: 'gran', productivity: 20, volumePerHa: 428, source: 'sr16' },
    habitat: { score: 0.9, reasons: ['Treslag (gran) matcher artens partnere.'] }
  }
};

/** Flisa brukeren faktisk er i nærheten av — ~2 km unna, og dårligere skog. */
const NAER_FLIS = {
  id: 'naer',
  center_lat: 59.9,
  center_lng: 10.78,
  score: 31,
  species_id: 1,
  confidence: 50,
  components: {
    vegetation: 15,
    moisture: 20,
    terrain: 10,
    history: 0,
    forest: { forestType: 'lauv', productivity: 11, volumePerHa: 90, source: 'sr16' },
    habitat: { score: 0.5, reasons: ['Løvskog — delvis match for artens partnere.'] }
  }
};

/** Nærmest av alle, men uten skogdata (by/vann) — skal hoppes over. */
const NAERMEST_UTEN_SKOG = {
  id: 'by',
  center_lat: 59.912,
  center_lng: 10.752,
  score: 22,
  species_id: 1,
  confidence: 50,
  components: { vegetation: 0, moisture: 10, terrain: 5, history: 0, forest: null }
};

let tileRows: unknown[] = [NAERMEST_UTEN_SKOG, FJERN_FLIS, NAER_FLIS];

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

// Tile-banen klarer seg uten vær — scoren er forhåndsberegnet.
vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: async () => ({ data: tileRows, error: null }) })
}));

function speciesTable() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null })
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
    from: () => speciesTable(),
    rpc: async () => ({ data: tileRows, error: null })
  })
}));

const { GET } = await import('../route');

let n = 0;
async function predict() {
  n += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/prediction?lat=${OSLO.lat}&lon=${OSLO.lon}&radiusKm=15`, {
      headers: { 'x-forwarded-for': `10.3.0.${n}` }
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  tileRows = [NAERMEST_UTEN_SKOG, FJERN_FLIS, NAER_FLIS];
});

describe('skogdataene i prediksjonssvaret', () => {
  it('kommer fra nærmeste flis med skog, ikke den best scorende i boksen', async () => {
    const { body } = await predict();
    expect(body.forest.forestType).toBe('lauv');
    expect(body.forest.productivity).toBe(11);
    // Granskogen med bonitet 20 er ekte — den ligger bare 15,5 km unna.
    expect(body.forest.forestType).not.toBe('gran');
    expect(body.forest.productivity).not.toBe(20);
  });

  it('opplyser hvor langt unna de er målt', async () => {
    const { body } = await predict();
    expect(body.forest.distanceKm).toBeGreaterThan(1.5);
    expect(body.forest.distanceKm).toBeLessThan(2.5);
  });

  it('hopper over fliser uten skogdata selv om de ligger nærmere', async () => {
    const { body } = await predict();
    expect(body.forest).not.toBeNull();
    expect(body.forest.forestType).toBe('lauv');
  });

  it('henter habitatbegrunnelsen fra den samme flisa', async () => {
    const { body } = await predict();
    expect(body.habitat.reasons[0]).toContain('Løvskog');
  });

  it('gir null skog når ingen flis i boksen har skogdata', async () => {
    tileRows = [NAERMEST_UTEN_SKOG];
    const { body } = await predict();
    expect(body.forest).toBeNull();
  });
});

describe('setningen brukeren leser', () => {
  it('sier ikke «her» om skog som er målt et par kilometer unna', async () => {
    const { body } = await predict();
    const lines = buildExplanation({
      weather: { temperatureC: 15, humidityPct: 80, rain3dMm: 5, rain7dMm: 12, rain14dMm: 22 },
      forest: {
        forestType: body.forest.forestType,
        productivity: body.forest.productivity,
        volumePerHa: body.forest.volumePerHa,
        habitatScore: body.habitat?.score ?? null,
        habitatReasons: body.habitat?.reasons ?? [],
        source: body.forest.source,
        distanceKm: body.forest.distanceKm
      },
      month: 8,
      locale: 'nb'
    });
    const head = lines.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(head?.text).not.toContain('Skog her');
    expect(head?.text).toContain('Nærmeste skogdata');
    expect(head?.text).toContain('2,0 km unna');
    expect(head?.text).toContain('løvskog');
  });
});
