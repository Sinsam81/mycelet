import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { _resetAllBuckets } from '@/lib/rate-limit';
import { PROVIDER_DECIMALS } from '@/lib/privacy/provider-precision';
import type { ForestProperties } from '@/lib/nibio/types';
import type { WeatherSummary } from '@/lib/weather';

/**
 * «Soppbilder på kartet» får kartutsnittet, og regner prøvepunktene sine ut
 * fra det. Står kartet sentrert på brukeren, ligger GPS-posisjonen i tallene:
 * et lite utsnitt gir ETT værpunkt — midten — og med et odde rutenett er den
 * midterste rutas senter det samme punktet. Ruta sendte dem med alle
 * desimalene til værleverandøren, NIBIO/CORINE og Kartverket.
 *
 * Søskenet til /api/prediction (provider-precision.ts). Testen lar midtpunktene
 * bomme på skog, så også de forskjøvne skogprøvene er med.
 */

type Punkt = { lat: number; lon: number };
const sett: { vaer: Punkt[]; skog: Punkt[]; hoyde: Punkt[] } = { vaer: [], skog: [], hoyde: [] };
/** Så mange skogoppslag svarer «ikke skog» før resten treffer. */
let skogbom = 0;

const VAER: WeatherSummary = {
  source: 'met_frost',
  temperatureC: 14,
  humidityPct: 85,
  humidityEstimated: false,
  rain3dMm: 12,
  rain7dMm: 30,
  rain14dMm: 55,
  minTemp7dC: 9,
  maxTemp7dC: 18,
  soilMoistureIndex: 0.7,
  precipDailyMm: Array(14).fill(4)
};

const GRANSKOG: ForestProperties = {
  forestType: 'gran',
  ageYears: 80,
  productivity: 14,
  volumePerHa: 220,
  source: 'sr16'
};

const KANTARELL = {
  id: 1,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  genus: 'Cantharellus',
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9,
  habitat: ['barskog'],
  mycorrhizal_partners: ['gran', 'bjørk'],
  primary_image_url: 'https://upload.wikimedia.org/kantarell.jpg',
  edibility: 'edible'
};

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
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
    from: () => ({
      select: () => ({
        not: async () => ({ data: [KANTARELL], error: null })
      })
    })
  })
}));
vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async (punkt: Punkt) => {
    sett.vaer.push(punkt);
    return VAER;
  }
}));
vi.mock('@/lib/forest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/forest')>()),
  getForestProperties: async (punkt: Punkt) => {
    sett.skog.push(punkt);
    return sett.skog.length <= skogbom ? null : GRANSKOG;
  }
}));
vi.mock('@/lib/terrain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/terrain')>()),
  getElevation: async (punkt: Punkt) => {
    sett.hoyde.push(punkt);
    return { elevationM: 180, terrainClass: 'Skog' };
  }
}));

const { GET } = await import('../route');

/** Antall desimaler i tallet slik det ville stått i en URL. */
function desimaler(tall: number): number {
  const [, brok = ''] = String(tall).split('.');
  return brok.length;
}

/** Der brukeren står, med presisjonen en GPS-fix og et kartsenter faktisk har. */
const BRUKER = { lat: 59.123456789, lon: 10.987654321 };

/** Et utsnitt sentrert på brukeren, slik map.getBounds() gir det. */
function hent(n: number) {
  const params = new URLSearchParams({
    minLat: String(BRUKER.lat - 0.02),
    maxLat: String(BRUKER.lat + 0.02),
    minLng: String(BRUKER.lon - 0.04),
    maxLng: String(BRUKER.lon + 0.04),
    n: String(n)
  });
  return GET(new NextRequest(`https://mycelet.com/api/prediction/species-spots?${params}`));
}

beforeAll(() => {
  // September: kantarellen er i sesong uansett når testen kjøres.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  sett.vaer = [];
  sett.skog = [];
  sett.hoyde = [];
  skogbom = 0;
  _resetAllBuckets();
});

describe('/api/prediction/species-spots og eksterne stedsoppslag', () => {
  it('værleverandøren får kartsenteret avrundet — ikke brukerens posisjon', async () => {
    const res = await hent(6);
    expect(res.status).toBe(200);
    // Et lite utsnitt gir ett prøvepunkt: midten av kartet.
    expect(sett.vaer).toEqual([{ lat: 59.123, lon: 10.988 }]);
  });

  it('sender aldri mer enn tre desimaler til skog og høyde', async () => {
    // n=5: den midterste rutas senter ER kartsenteret.
    const res = await hent(5);
    expect(res.status).toBe(200);
    expect((await res.json()).spots.length).toBeGreaterThan(0);

    // Alle 25 rutene må faktisk ha blitt slått opp — ellers tester vi ingenting.
    expect(sett.skog).toHaveLength(25);
    expect(sett.hoyde).toHaveLength(25);
    for (const punkt of [...sett.vaer, ...sett.skog, ...sett.hoyde]) {
      expect(desimaler(punkt.lat), `lat ${punkt.lat}`).toBeLessThanOrEqual(PROVIDER_DECIMALS);
      expect(desimaler(punkt.lon), `lon ${punkt.lon}`).toBeLessThanOrEqual(PROVIDER_DECIMALS);
    }
    // Den midterste ruta: avrundet, ikke punktet brukeren står i.
    expect(sett.skog).toContainEqual({ lat: 59.123, lon: 10.988 });
    expect(sett.hoyde).toContainEqual({ lat: 59.123, lon: 10.988 });
  });

  it('også de forskjøvne skogprøvene avrundes', async () => {
    // Alle midtpunktene bommer, så hver rute prøver et kvadrantsenter.
    skogbom = 25;
    const res = await hent(5);
    expect(res.status).toBe(200);
    expect(sett.skog.length).toBeGreaterThan(25);
    for (const punkt of sett.skog) {
      expect(desimaler(punkt.lat), `lat ${punkt.lat}`).toBeLessThanOrEqual(PROVIDER_DECIMALS);
      expect(desimaler(punkt.lon), `lon ${punkt.lon}`).toBeLessThanOrEqual(PROVIDER_DECIMALS);
    }
  });

  it('nåla står fortsatt i rutas eksakte midtpunkt — bare oppslaget er avrundet', async () => {
    const body = await (await hent(5)).json();
    const nål = body.spots[0];
    // Fem desimaler, som før. En nål på tre desimaler ville flyttet seg inntil
    // ~110 m og latt som om avrundingen var rutenettet.
    expect(desimaler(nål.lat)).toBeGreaterThan(PROVIDER_DECIMALS);
    expect(desimaler(nål.lng)).toBeGreaterThan(PROVIDER_DECIMALS);
  });
});
