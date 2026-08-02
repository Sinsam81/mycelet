import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Toppstedene skal komme ut av ruta med en OMRÅDERAPPORT, ikke bare en score
 * og et par stikkord.
 *
 * Ruta satt allerede på flere felt enn den sendte ut: volum per hektar,
 * markfukt, kilden til skogdataene, funn i nærheten — og hele rutenettet, som
 * er det eneste «nabolaget» vi har målt. Testen går gjennom hele ruta og inn i
 * teksten brukeren faktisk leser, fordi poenget ikke er at feltene finnes, men
 * at de kommer fram.
 */

const NESODDEN = { lat: 59.85, lng: 10.66 };
const RADIUS_DEG = 0.045; // ~5 km i bredde, som klienten ber om

let currentUserId = 'bruker-0';
let paidUser = true;

/** Skogen varierer med breddegraden, så rutenettet får et ekte nabolag. */
vi.mock('@/lib/forest', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/forest')>();
  return {
    ...original,
    getForestProperties: async ({ lat }: { lat: number }) => {
      // Den nordligste raden er rikere granskog enn resten — den blir toppstedet.
      const rik = lat > NESODDEN.lat + 0.03;
      return {
        forestType: rik ? 'gran' : 'furu',
        ageYears: null,
        productivity: rik ? 20 : 11,
        volumePerHa: rik ? 214 : 78,
        source: 'sr16' as const
      };
    }
  };
});

vi.mock('@/lib/terrain', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/terrain')>();
  return { ...original, getElevation: async () => ({ elevationM: 90, terrainClass: 'Skog' }) };
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
  getBillingCapabilities: () => ({
    tier: paidUser ? 'premium' : 'free',
    status: 'active',
    paid: paidUser,
    aiDailyLimit: null
  })
}));

/**
 * Midtpunktet i den nordvestligste rutenettcella, regnet ut med samme formel
 * som ruta bruker (7×7 over boksen). Den nordligste raden er den rike skogen,
 * og cellene der scorer likt, så den vestligste kommer først i topplista.
 * Funnene legges der, så funn-linja i rapporten har noe å telle.
 */
const GRID_N = 7;
const TOP_CELL = {
  lat: NESODDEN.lat - RADIUS_DEG + ((2 * RADIUS_DEG) / GRID_N) * (GRID_N - 0.5),
  lng: NESODDEN.lng - RADIUS_DEG * 2 + ((4 * RADIUS_DEG) / GRID_N) * 0.5
};

/** To registrerte funn innenfor 500 m av den cella. */
const OCCURRENCES = [
  { latitude: TOP_CELL.lat, longitude: TOP_CELL.lng, species_id: 1 },
  { latitude: TOP_CELL.lat + 0.001, longitude: TOP_CELL.lng, species_id: 1 }
];

vi.mock('@/lib/supabase/paged-rpc', () => ({
  fetchRpcPaged: async () => ({ rows: OCCURRENCES, truncated: false })
}));

const ARTER = [
  {
    id: 1,
    norwegian_name: 'Kantarell',
    swedish_name: 'Kantarell',
    latin_name: 'Cantharellus cibarius',
    genus: 'Cantharellus',
    season_start: 1,
    season_end: 12,
    peak_season_start: 1,
    peak_season_end: 12,
    habitat: ['barskog'],
    mycorrhizal_partners: ['gran'],
    edibility: 'edible'
  }
];

function speciesTable() {
  const result = { data: ARTER, error: null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: async () => ({ data: ARTER[0], error: null }),
    // Ruta venter på select(...) direkte i artslista-grenen.
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }) },
    from: () => speciesTable(),
    rpc: async () => ({ data: OCCURRENCES, error: null })
  })
}));

const { GET } = await import('../route');

interface Cell {
  lat: number;
  lng: number;
  score: number;
  report?: { sections: { id: string; heading: string; lines: string[] }[] };
}

let call = 0;
async function topSpots(): Promise<Cell[]> {
  call += 1;
  currentUserId = `bruker-${call}`; // egen ratelimit-bøtte per kall
  const params = new URLSearchParams({
    minLat: String(NESODDEN.lat - RADIUS_DEG),
    maxLat: String(NESODDEN.lat + RADIUS_DEG),
    minLng: String(NESODDEN.lng - RADIUS_DEG * 2),
    maxLng: String(NESODDEN.lng + RADIUS_DEG * 2),
    n: '7',
    top: '3'
  });
  const res = await GET(new NextRequest(`https://mycelet.com/api/prediction/grid?${params.toString()}`));
  const body = await res.json();
  return (body.cells ?? []) as Cell[];
}

function sectionLines(cell: Cell, id: string): string {
  return (cell.report?.sections.find((s) => s.id === id)?.lines ?? []).join(' ');
}

beforeEach(() => {
  paidUser = true;
});

describe('områderapporten i /api/prediction/grid?top=', () => {
  it('følger med på hvert toppsted, med alle tre delene', async () => {
    const cells = await topSpots();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.report?.sections.map((s) => s.id)).toEqual(['forest', 'conditions', 'distinctive']);
    }
  });

  it('sender ut volum per hektar, som ruta hadde men holdt for seg selv', async () => {
    const [best] = await topSpots();
    expect(sectionLines(best, 'forest')).toContain('214 m³ per hektar');
  });

  it('sier hvor skogdataene er målt, ikke bare hva de sier', async () => {
    const [best] = await topSpots();
    const forest = sectionLines(best, 'forest');
    expect(forest).toContain('målt i selve punktet');
    expect(forest).toContain('granskog');
    expect(forest).toContain('Bonitet 20');
  });

  it('tar med nedbør, markfukt og luftfuktighet i forholdene nå', async () => {
    const [best] = await topSpots();
    const conditions = sectionLines(best, 'conditions');
    expect(conditions).toContain('42 mm nedbør siste 14 døgn');
    expect(conditions).toContain('Markfukt 0,62');
    expect(conditions).toContain('Luftfuktighet 82 %');
  });

  it('sammenligner med de andre rutene i søket og sier hvor stor ruta er', async () => {
    const [best] = await topSpots();
    const why = sectionLines(best, 'distinctive');
    expect(why).toMatch(/median \d+ for de \d+ rutene vi målte i søket/);
    expect(why).toMatch(/Punktet står for en rute på omtrent \d+,\d × \d+,\d km/);
    expect(why).toContain('Forholdene i regionen er');
  });

  it('teller registrerte funn i nærheten og sier hva tallet er verdt', async () => {
    const [best] = await topSpots();
    const why = sectionLines(best, 'distinctive');
    expect(why).toContain('2 registrerte funn innenfor 500 m');
    expect(why).toContain('følger stier og veier');
  });

  it('gir ingen rapport til gratisbrukere — rapporten er premium-halvdelen', async () => {
    paidUser = false;
    const cells = await topSpots();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.report).toBeUndefined();
  });
});
