import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Fallback-banen svarer der det ikke finnes prediksjonsfliser — altså i det
 * meste av landet, hver dag.
 *
 * Flisbanen navngir arten tallet gjelder (PR #113): «Kantarell 57/100 gode
 * forhold». Fallback-banen gjorde ikke det. Den regnet ett artsløst tall og
 * sendte det til NØYAKTIG samme panel, på nøyaktig samme 0-100-flate. To ulike
 * størrelser, samme ansikt, og ingenting i svaret sa hvilken av dem brukeren
 * så på.
 *
 * Testene her holder de to banene sammen: fallback-banen skal stille samme
 * spørsmål som rasteret — hvilken av prediksjonsartene ligger best an her nå —
 * og når den ikke får svar på det, skal den la `leadingSpecies` stå tom slik at
 * panelet kan si at tallet ikke gjelder én art.
 *
 * Datoen er låst til 15. august: kantarell er i sesong, morkel er ikke.
 */

// Ingen fenologikurve for disse id-ene, så scoringen faller tilbake på de
// håndkodede sesongmånedene. Det gjør testen uavhengig av det genererte
// fenologidatasettet.
const KANTARELL = {
  id: 901,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  genus: 'Cantharellus',
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9,
  habitat: null,
  mycorrhizal_partners: null,
  edibility: 'edible'
};

const VANLIG_MORKEL = {
  id: 902,
  norwegian_name: 'Vanlig morkel',
  swedish_name: 'Rundmurkla',
  latin_name: 'Morchella esculenta',
  genus: 'Morchella',
  season_start: 4,
  season_end: 5,
  peak_season_start: 4,
  peak_season_end: 5,
  habitat: null,
  mycorrhizal_partners: null,
  edibility: 'edible'
};

/** Dødelig art med sesong hele året — skal aldri kunne navngis som «best nå». */
const HVIT_FLUESOPP = {
  id: 903,
  norwegian_name: 'Hvit fluesopp',
  swedish_name: 'Vit flugsvamp',
  latin_name: 'Amanita virosa',
  genus: 'Amanita',
  season_start: 1,
  season_end: 12,
  peak_season_start: 8,
  peak_season_end: 9,
  habitat: null,
  mycorrhizal_partners: null,
  edibility: 'deadly'
};

let candidateRows: unknown[] = [KANTARELL, VANLIG_MORKEL];
let candidateError: { message: string } | null = null;
/** Raden ?speciesId slår opp. */
let requestedSpecies: unknown = KANTARELL;

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

// Fallback-banen krever vær. Milde augustforhold: ikke så gode at scoren
// klapper i taket på 100 (der ville artsmultiplikatoren blitt usynlig).
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

// Ingen fliser for området → fallback-banen.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: async () => ({ data: [], error: null }) })
}));

// Ekte skogdata krever nett. Null her betyr habitatFit = 1 for alle arter, så
// rangeringen styres av tidsdelen alene — den validerte delen av modellen.
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

function speciesTable() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    // Kandidatlista hentes med .in('latin_name', …) og ventes på direkte.
    in: async () => ({ data: candidateRows, error: candidateError }),
    maybeSingle: async () => ({ data: requestedSpecies, error: null })
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
    from: () => speciesTable(),
    // get_findings_in_bounds — ingen funn i boksen.
    rpc: async () => ({ data: [], error: null })
  })
}));

const { GET } = await import('../route');

let n = 0;
async function predict(query = '') {
  n += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/prediction?lat=59.79&lon=10.65&radiusKm=15${query}`, {
      headers: { 'x-forwarded-for': `10.9.0.${n}` }
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-15T09:00:00Z'));
  candidateRows = [KANTARELL, VANLIG_MORKEL];
  candidateError = null;
  requestedSpecies = KANTARELL;
});

afterAll(() => {
  vi.useRealTimers();
});

describe('fallback-banen uten artsfilter', () => {
  it('svarer faktisk fra fallback-banen', async () => {
    const { status, body } = await predict();
    expect(status).toBe(200);
    expect(body.source).toBe('computed_fallback');
  });

  it('sier hvilken art tallet gjelder, som flisbanen gjør', async () => {
    const { body } = await predict();
    expect(body.leadingSpecies).toMatchObject({ id: 901, norwegianName: 'Kantarell' });
  });

  it('velger arten som går NÅ — kantarell i august, ikke morkel', async () => {
    const { body } = await predict();
    expect(body.leadingSpecies.id).toBe(901);
    expect(body.leadingSpecies.id).not.toBe(902);
  });

  it('sender svensk navn videre, så svenske lesere får sitt', async () => {
    const { body } = await predict();
    expect(body.leadingSpecies.swedishName).toBe('Kantarell');
  });

  it('tallet er artens tall, ikke det artsløse grunntallet', async () => {
    const { body } = await predict();
    // Uten fiksen er score === baseScore på hår: ingen art betyr ingen
    // artsmultiplikator. Det er nettopp det som gjorde tallet til en annen
    // størrelse enn flisbanens.
    expect(body.speciesFit).not.toBeNull();
    expect(body.score).not.toBe(body.baseScore);
  });

  it('navngir aldri en dødelig art, uansett hvor godt den ligger an', async () => {
    candidateRows = [HVIT_FLUESOPP];
    const { body } = await predict();
    expect(body.leadingSpecies).toBeUndefined();
    // Og da faller tallet tilbake på det artsløse — panelet sier fra selv.
    expect(body.score).toBe(body.baseScore);
    expect(body.speciesFit).toBeNull();
  });
});

describe('når fallback-banen ikke KAN navngi arten', () => {
  it('lar leadingSpecies stå tom når artsspørringen feiler', async () => {
    candidateRows = [];
    candidateError = { message: 'timeout' };
    const { status, body } = await predict();
    // Prediksjonen skal fortsatt komme — den skal bare ikke utgi seg for å
    // være et artstall.
    expect(status).toBe(200);
    expect(body.leadingSpecies).toBeUndefined();
    expect(body.score).toBe(body.baseScore);
  });

  it('lar leadingSpecies stå tom når ingen kandidater finnes', async () => {
    candidateRows = [];
    const { body } = await predict();
    expect(body.leadingSpecies).toBeUndefined();
  });
});

describe('fallback-banen med artsfilter', () => {
  it('navngir arten i `species` og lar leadingSpecies stå tom', async () => {
    const { body } = await predict('&speciesId=901');
    expect(body.species?.norwegianName).toBe('Kantarell');
    expect(body.leadingSpecies).toBeUndefined();
  });

  it('regner på den valgte arten, ikke på den beste', async () => {
    requestedSpecies = VANLIG_MORKEL;
    const { body } = await predict('&speciesId=902');
    expect(body.species?.norwegianName).toBe('Vanlig morkel');
    // Morkel i august: sesongfaktoren kollapser, og tallet skal følge etter.
    expect(body.speciesFit).toBeLessThan(0.2);
  });
});
