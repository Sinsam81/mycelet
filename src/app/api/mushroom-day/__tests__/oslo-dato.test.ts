import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { observedRainWindows } from '@/lib/weather/windows';
import type { WeatherSummary } from '@/lib/weather';

/**
 * «I dag» er dagen i Oslo, ikke i UTC.
 *
 * Ruta tok måneden og dagen fra serverens klokke. Serveren går i UTC, så
 * mellom midnatt og kl. 01/02 norsk tid var «i dag» fortsatt i går — og ved et
 * månedsskifte fortsatt forrige måned. 1. juni kl. 00.30 svarte den som om det
 * var mai, og mai er utenom sesongen.
 */

// Serveren går i UTC, og det er DER feilen bor. Uten denne linja ville testen
// lest maskinens egen sone — og på en maskin som står i Oslo gir den gamle
// koden riktig svar ved en tilfeldighet. Hver testfil kjører i sin egen
// prosess, så dette smitter ikke; sonen settes likevel tilbake til slutt.
const OPPRINNELIG_SONE = process.env.TZ;
process.env.TZ = 'UTC';

let oppslag = 0;
/** Leserens språk. Teksten i svaret følger det, så det er del av nøkkelen. */
let sprak: 'nb' | 'sv' = 'nb';

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

/** Det ruta gir assessMushroomDay for VAER — så testen kan regne ut fasiten selv. */
const VAERGRUNNLAG = {
  temperatureC: VAER.temperatureC,
  humidityPct: VAER.humidityPct,
  ...observedRainWindows(VAER),
  minTemp7dC: VAER.minTemp7dC,
  maxTemp7dC: VAER.maxTemp7dC,
  soilMoistureIndex: VAER.soilMoistureIndex,
  precipDailyMm: VAER.precipDailyMm
};

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async () => {
    oppslag += 1;
    return VAER;
  }
}));

const { GET } = await import('../route');

let klient = 0;
async function hent(lat: string) {
  klient += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/mushroom-day?lat=${lat}&lon=10.75`, {
      headers: { 'x-forwarded-for': `10.6.0.${klient}` }
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { score: number; title: string; message: string };
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterAll(() => {
  vi.useRealTimers();
  if (OPPRINNELIG_SONE === undefined) delete process.env.TZ;
  else process.env.TZ = OPPRINNELIG_SONE;
});

beforeEach(() => {
  oppslag = 0;
  sprak = 'nb';
});

describe('/api/mushroom-day: måneden og dagen følger Oslo', () => {
  it('1. juni kl. 00.30 i Oslo er juni — ikke mai, som er utenom sesongen', async () => {
    // 22.30 UTC 31. mai = 00.30 1. juni i Oslo (sommertid).
    vi.setSystemTime(new Date('2026-05-31T22:30:00Z'));

    const iOslo = assessMushroomDay(VAERGRUNNLAG, 6, 'nb', 1);
    const iUtc = assessMushroomDay(VAERGRUNNLAG, 5, 'nb', 31);
    // De to dagene MÅ gi forskjellig svar, ellers viser testen ingenting.
    expect(iUtc.title).not.toBe(iOslo.title);

    const svar = await hent('59.91');
    expect(svar.title).toBe(iOslo.title);
    expect(svar.message).toBe(iOslo.message);
    expect(svar.score).toBe(iOslo.score);
  });

  it('midt på dagen er ingenting endret', async () => {
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
    const svar = await hent('59.93');
    expect(svar).toMatchObject(assessMushroomDay(VAERGRUNNLAG, 9, 'nb', 15));
  });
});

describe('/api/mushroom-day: mellomlageret skifter dag ved midnatt i Oslo', () => {
  it('et svar fra før midnatt brukes ikke etter midnatt', async () => {
    // 23.50 → 00.10 i Oslo: ti minutter fra hverandre, men to forskjellige
    // dager. Nøkkelen sto på UTC-datoen, som er den samme for begge.
    vi.setSystemTime(new Date('2026-09-15T21:50:00Z'));
    await hent('60.10');
    expect(oppslag).toBe(1);

    vi.setSystemTime(new Date('2026-09-15T22:10:00Z'));
    await hent('60.10');
    expect(oppslag).toBe(2);
  });

  it('… og midnatt i UTC er ikke lenger et dagskifte', async () => {
    // 01.50 → 02.10 i Oslo: samme dag for leseren.
    vi.setSystemTime(new Date('2026-09-15T23:50:00Z'));
    await hent('60.20');
    vi.setSystemTime(new Date('2026-09-16T00:10:00Z'));
    await hent('60.20');
    expect(oppslag).toBe(1);
  });

  it('vintertid: dagskiftet ligger én time fra UTC, ikke to', async () => {
    // 23.50 → 00.10 i Oslo i november er 22.50 → 23.10 UTC.
    vi.setSystemTime(new Date('2026-11-20T22:50:00Z'));
    await hent('60.25');
    vi.setSystemTime(new Date('2026-11-20T23:10:00Z'));
    await hent('60.25');
    expect(oppslag).toBe(2);

    // … og 22.50 → 23.10 i Oslo (21.50 → 22.10 UTC) er samme dag. Om sommeren
    // er 22.00 UTC midnatt; en fast forskyvning på to timer ville delt her.
    oppslag = 0;
    vi.setSystemTime(new Date('2026-11-21T21:50:00Z'));
    await hent('60.26');
    vi.setSystemTime(new Date('2026-11-21T22:10:00Z'));
    await hent('60.26');
    expect(oppslag).toBe(1);
  });

  it('samme sted, samme dag og samme språk gir fortsatt ett oppslag', async () => {
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
    await hent('60.30');
    await hent('60.30');
    expect(oppslag).toBe(1);
  });

  it('språket er fortsatt del av nøkkelen: en svensk leser får ikke det norske svaret', async () => {
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
    const norsk = await hent('60.40');
    sprak = 'sv';
    const svensk = await hent('60.40');
    expect(oppslag).toBe(2);
    expect(svensk.title).toBe(assessMushroomDay(VAERGRUNNLAG, 9, 'sv', 15).title);
    expect(svensk.title).not.toBe(norsk.title);
  });
});
