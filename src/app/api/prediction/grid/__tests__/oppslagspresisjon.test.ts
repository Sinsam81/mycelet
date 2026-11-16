import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Rutenettet og eksterne stedsoppslag.
 *
 * «⭐ Lovende» legger en boks rundt enhetens GPS-posisjon — ofte der brukeren
 * står i sitt eget soppsted — og ruta slår opp vær, skog og høyde for punkter
 * regnet ut fra boksen. Midtpunktet i boksen ER posisjonen: det gikk med full
 * presisjon til værleverandøren (prøven midt i boksen) og til skog- og
 * høydeoppslaget (midtruta). /api/prediction, /api/findings og
 * /api/spot-feedback rundet alt av; rutenettet var søskenet som sto igjen.
 *
 * Testen går gjennom hele ruta og ser på punktene de tre oppslagene faktisk får.
 */

type Punkt = { lat: number; lon: number };
const sett: { vaer: Punkt[]; skog: Punkt[]; hoyde: Punkt[] } = { vaer: [], skog: [], hoyde: [] };

/** Enhetens posisjon, med flere desimaler enn noe oppslag trenger. */
const ENHET = { lat: 59.123456789, lng: 10.987654321 };
/** Det eneste som skal forlate serveren av den: tre desimaler (~100 m). */
const AVRUNDET = { lat: 59.123, lng: 10.988 };
const GRID_N = 7;

let currentUserId = 'bruker-0';

vi.mock('@/lib/forest', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/forest')>();
  return {
    ...original,
    getForestProperties: async (punkt: Punkt) => {
      sett.skog.push(punkt);
      // Skog i hvert midtpunkt, så ingen kvadrantpunkter prøves — da er
      // skogoppslagene nøyaktig rutenettet.
      return { forestType: 'gran', ageYears: null, productivity: 14, volumePerHa: 250, source: 'sr16' as const };
    }
  };
});

vi.mock('@/lib/terrain', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/terrain')>();
  return {
    ...original,
    getElevation: async (punkt: Punkt) => {
      sett.hoyde.push(punkt);
      return { elevationM: 200, terrainClass: 'Skog' };
    }
  };
});

vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async (punkt: Punkt) => {
    sett.vaer.push(punkt);
    return {
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
    };
  }
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

const logg = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
vi.mock('@/lib/log/request', () => ({
  createRequestLogger: () => ({ ...logg, child: () => logg })
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
}));

let avkortet = false;
vi.mock('@/lib/supabase/paged-rpc', () => ({
  fetchRpcPaged: async () => ({ rows: [], truncated: avkortet })
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

/** Boksen kartet ber om: ±radius rundt utgangspunktet, som i generateTopSpots. */
function boksRundt(punkt: { lat: number; lng: number }, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((punkt.lat * Math.PI) / 180));
  return {
    minLat: punkt.lat - latDelta,
    maxLat: punkt.lat + latDelta,
    minLng: punkt.lng - lngDelta,
    maxLng: punkt.lng + lngDelta
  };
}

let kall = 0;
async function lovende(punkt: { lat: number; lng: number }, radiusKm = 5) {
  kall += 1;
  currentUserId = `bruker-presisjon-${kall}`; // egen ratelimit-bøtte per kall
  const boks = boksRundt(punkt, radiusKm);
  const params = new URLSearchParams({
    minLat: String(boks.minLat),
    maxLat: String(boks.maxLat),
    minLng: String(boks.minLng),
    maxLng: String(boks.maxLng),
    n: String(GRID_N),
    top: '12'
  });
  const res = await GET(new NextRequest(`https://mycelet.com/api/prediction/grid?${params.toString()}`));
  return { status: res.status, body: (await res.json()) as { cells: { lat: number; lng: number }[] }, boks };
}

const naer = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const erPunkt = (p: Punkt, maal: { lat: number; lng: number }) => naer(p.lat, maal.lat) && naer(p.lon, maal.lng);
/** Avstand i grader — nok til å si «dette er (ikke) samme punkt». */
const avstandGrader = (p: Punkt, maal: { lat: number; lng: number }) =>
  Math.max(Math.abs(p.lat - maal.lat), Math.abs(p.lon - maal.lng));

beforeEach(() => {
  // Bare Date — ruta bruker ekte tidsavbrudd rundt skogoppslagene.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T09:00:00Z'));
  sett.vaer = [];
  sett.skog = [];
  sett.hoyde = [];
  avkortet = false;
  logg.warn.mockClear();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('/api/prediction/grid og eksterne stedsoppslag', () => {
  it('enhetens eksakte posisjon når verken vær, skog eller høyde', async () => {
    const { status } = await lovende(ENHET);
    expect(status).toBe(200);

    // Alle tre må faktisk ha blitt kalt — ellers tester vi ingenting.
    expect(sett.vaer).toHaveLength(1); // liten boks → én værprøve, midt i
    expect(sett.skog).toHaveLength(GRID_N * GRID_N);
    expect(sett.hoyde).toHaveLength(GRID_N * GRID_N);

    // Uten festingen lå værprøven og midtruta NØYAKTIG på enhetens posisjon.
    // Nå ligger ingen oppslag nærmere den enn avrundingen flyttet midtpunktet.
    const flyttet = Math.max(Math.abs(ENHET.lat - AVRUNDET.lat), Math.abs(ENHET.lng - AVRUNDET.lng));
    expect(flyttet).toBeGreaterThan(3e-4); // ~40 m — testpunktet er valgt så det synes
    for (const punkt of [...sett.vaer, ...sett.skog, ...sett.hoyde]) {
      expect(avstandGrader(punkt, ENHET)).toBeGreaterThan(flyttet - 1e-9);
    }
  });

  it('det som går ut i stedet, er posisjonen med tre desimaler: værprøven og midtruta', async () => {
    await lovende(ENHET);
    expect(erPunkt(sett.vaer[0], AVRUNDET)).toBe(true);
    expect(sett.skog.filter((p) => erPunkt(p, AVRUNDET))).toHaveLength(1);
    expect(sett.hoyde.filter((p) => erPunkt(p, AVRUNDET))).toHaveLength(1);
  });

  it('rutenettet er det samme, bare flyttet: like mange ruter med samme avstand mellom seg', async () => {
    const { boks } = await lovende(ENHET);
    const latSteg = (boks.maxLat - boks.minLat) / GRID_N;
    const lngSteg = (boks.maxLng - boks.minLng) / GRID_N;

    const bredder = [...new Set(sett.skog.map((p) => p.lat.toFixed(9)))].map(Number).sort((a, b) => a - b);
    const lengder = [...new Set(sett.skog.map((p) => p.lon.toFixed(9)))].map(Number).sort((a, b) => a - b);
    expect(bredder).toHaveLength(GRID_N);
    expect(lengder).toHaveLength(GRID_N);
    for (let i = 1; i < GRID_N; i++) {
      expect(bredder[i] - bredder[i - 1]).toBeCloseTo(latSteg, 8);
      expect(lengder[i] - lengder[i - 1]).toBeCloseTo(lngSteg, 8);
    }
    // Hele nettet ligger symmetrisk rundt det avrundede punktet.
    expect((bredder[0] + bredder[GRID_N - 1]) / 2).toBeCloseTo(AVRUNDET.lat, 8);
    expect((lengder[0] + lengder[GRID_N - 1]) / 2).toBeCloseTo(AVRUNDET.lng, 8);
  });

  it('to posisjoner noen meter fra hverandre gir nøyaktig de samme oppslagene', async () => {
    await lovende({ lat: 59.12341, lng: 10.98761 });
    const forste = { vaer: [...sett.vaer], skog: [...sett.skog] };
    sett.vaer = [];
    sett.skog = [];
    sett.hoyde = [];
    await lovende({ lat: 59.12338, lng: 10.98774 });
    expect(erPunkt(sett.vaer[0], { lat: forste.vaer[0].lat, lng: forste.vaer[0].lon })).toBe(true);
    // Midtruta er den samme i begge.
    expect(sett.skog.filter((p) => erPunkt(p, { lat: 59.123, lng: 10.988 }))).toHaveLength(1);
    expect(forste.skog.filter((p) => erPunkt(p, { lat: 59.123, lng: 10.988 }))).toHaveLength(1);
  });

  it('serverloggen får boksen grovt (~1 km), ikke posisjonen', async () => {
    avkortet = true;
    await lovende(ENHET);
    const linje = logg.warn.mock.calls.find(([hendelse]) => hendelse === 'prediction_grid.occurrences_truncated');
    expect(linje).toBeTruthy();
    const felt = (linje as unknown as [string, Record<string, number>])[1];
    for (const kant of ['minLat', 'minLng', 'maxLat', 'maxLng']) {
      const [, brok = ''] = String(felt[kant]).split('.');
      expect(brok.length, kant).toBeLessThanOrEqual(2);
    }
  });
});
