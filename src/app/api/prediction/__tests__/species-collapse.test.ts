import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Rasteret har én flis PER ART per rute. Kalt uten artsfilter ga
 * `get_prediction_tiles_in_bounds` derfor sju rader på samme koordinat, og ruta
 * tok konfidensvektet snitt over alle sammen — altså på tvers av arter.
 *
 * 1. august 2026 betydde det at Nesodden viste «19/100 — svake forhold» midt i
 * kantarellsesongen, fordi kantarell på 60 ble midlet med vanlig morkel på 2.
 * Det samme snittet på ekte data etter kollapsen er 55.
 *
 * Radene under er hentet ut av produksjonsdatabasen den dagen.
 *
 * Testen går gjennom HELE ruta, ikke bare hjelperen, fordi feilen lå i
 * koblingen: en kollapsfunksjon som ikke kalles fikser ingenting.
 */

const KANTARELL = { id: 1, norwegian_name: 'Kantarell', swedish_name: 'Kantarell', latin_name: 'Cantharellus cibarius', genus: 'Cantharellus', season_start: 7, season_end: 10, peak_season_start: 8, peak_season_end: 9, habitat: null, mycorrhizal_partners: null };

/** Ett sted, sju arter — nøyaktig slik rasteret lagrer det. */
const EN_RUTE = [
  { id: 't1', center_lat: 59.78, center_lng: 10.65, score: 60, species_id: 1, confidence: 50, components: { vegetation: 40, moisture: 30, terrain: 20, history: 10 } },
  { id: 't2', center_lat: 59.78, center_lng: 10.65, score: 34, species_id: 7, confidence: 50, components: {} },
  { id: 't3', center_lat: 59.78, center_lng: 10.65, score: 33, species_id: 2, confidence: 50, components: {} },
  { id: 't4', center_lat: 59.78, center_lng: 10.65, score: 12, species_id: 3, confidence: 50, components: {} },
  { id: 't5', center_lat: 59.78, center_lng: 10.65, score: 8, species_id: 4, confidence: 50, components: {} },
  { id: 't6', center_lat: 59.78, center_lng: 10.65, score: 3, species_id: 20, confidence: 50, components: {} },
  { id: 't7', center_lat: 59.78, center_lng: 10.65, score: 2, species_id: 19, confidence: 50, components: {} }
];

/** Andre rute på Nesodden, samme sju arter. */
const ANDRE_RUTE = [
  { id: 'u1', center_lat: 59.84, center_lng: 10.65, score: 54, species_id: 1, confidence: 50, components: {} },
  { id: 'u2', center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 2, confidence: 50, components: {} },
  { id: 'u3', center_lat: 59.84, center_lng: 10.65, score: 18, species_id: 7, confidence: 50, components: {} },
  { id: 'u4', center_lat: 59.84, center_lng: 10.65, score: 7, species_id: 4, confidence: 50, components: {} },
  { id: 'u5', center_lat: 59.84, center_lng: 10.65, score: 7, species_id: 3, confidence: 50, components: {} },
  { id: 'u6', center_lat: 59.84, center_lng: 10.65, score: 2, species_id: 20, confidence: 50, components: {} },
  { id: 'u7', center_lat: 59.84, center_lng: 10.65, score: 2, species_id: 19, confidence: 50, components: {} }
];

const NESODDEN = [...EN_RUTE, ...ANDRE_RUTE].sort((a, b) => b.score - a.score);

let tileRows = NESODDEN;
let paid = true;

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

// Tile-banen klarer seg uten vær — scoren er forhåndsberegnet.
vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: paid ? 'premium' : 'free', status: 'active', paid, aiDailyLimit: null })
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: async () => ({ data: tileRows, error: null }) })
}));

function speciesTable() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: KANTARELL, error: null })
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
async function predict(query = '') {
  n += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/prediction?lat=59.79&lon=10.65&radiusKm=15${query}`, {
      headers: { 'x-forwarded-for': `10.2.0.${n}` }
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  tileRows = NESODDEN;
  paid = true;
});

describe('scoren uten artsfilter', () => {
  it('er ikke lenger et snitt på tvers av arter', async () => {
    const { body } = await predict();
    // Snittet over alle 14 radene er 19. Det tallet skal ikke kunne komme igjen.
    const snittAlleRader = Math.round(NESODDEN.reduce((s, t) => s + t.score, 0) / NESODDEN.length);
    expect(snittAlleRader).toBe(19);
    expect(body.score).not.toBe(19);
  });

  it('er snittet av beste art per rute — (60 + 54) / 2', async () => {
    const { body } = await predict();
    expect(body.score).toBe(57);
  });

  it('gir «gode forhold», ikke «svake»', async () => {
    const { body } = await predict();
    expect(body.condition).toBe('good');
  });

  it('sier hvilken art tallet gjelder', async () => {
    const { body } = await predict();
    expect(body.leadingSpecies).toMatchObject({ id: 1, norwegianName: 'Kantarell' });
  });

  it('teller steder, ikke rader', async () => {
    const { body } = await predict();
    expect(body.counts.findingsInArea).toBe(2); // to ruter, ikke fjorten fliser
  });
});

describe('sirklene på kartet', () => {
  it('én per sted, ikke sju oppå hverandre', async () => {
    const { body } = await predict();
    expect(body.hotspots).toHaveLength(2);
    const posisjoner = new Set(body.hotspots.map((h: { lat: number; lng: number }) => `${h.lat},${h.lng}`));
    expect(posisjoner.size).toBe(2);
  });

  it('bærer arten, så tooltipen kan navngi den', async () => {
    const { body } = await predict();
    for (const h of body.hotspots) expect(h.speciesId).toBe(1);
  });

  it('viser den beste arten på stedet — ikke den dårligste, som før', async () => {
    const { body } = await predict();
    const sor = body.hotspots.find((h: { lat: number }) => h.lat === 59.78);
    expect(sor.score).toBe(60); // kantarell
    expect(sor.score).not.toBe(2); // vanlig morkel, i august
  });

  it('gratisbrukere får fortsatt grovkornet posisjon og avrundet score', async () => {
    paid = false;
    const { body } = await predict();
    expect(body.access).toBe('free_limited');
    for (const h of body.hotspots) {
      expect(h.score % 5).toBe(0);
      expect(String(h.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });
});

describe('med artsfilter satt', () => {
  it('rører ikke tallet — RPC-en har allerede filtrert', async () => {
    tileRows = NESODDEN.filter((t) => t.species_id === 19); // vanlig morkel: 2 og 2
    const { body } = await predict('&speciesId=19');
    expect(body.score).toBe(2);
    expect(body.hotspots).toHaveLength(2);
  });

  it('lar være å slå opp ledende art — den står allerede i `species`', async () => {
    tileRows = NESODDEN.filter((t) => t.species_id === 1);
    const { body } = await predict('&speciesId=1');
    expect(body.leadingSpecies).toBeUndefined();
    expect(body.species?.norwegianName).toBe('Kantarell');
  });
});
