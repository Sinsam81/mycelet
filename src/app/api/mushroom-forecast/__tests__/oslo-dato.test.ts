import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { assessMushroomDay } from '@/lib/prediction/mushroom-day';
import { observedRainWindows } from '@/lib/weather/windows';
import type { WeatherSummary } from '@/lib/weather';
import type { DailyForecast } from '@/lib/weather/forecast';

/**
 * «I dag» i sjudagersstripen er dagen i Oslo, ikke i UTC.
 *
 * Ruta tok dagen fra `now.toISOString().slice(0, 10)`. Mellom midnatt og
 * kl. 01/02 norsk tid er det i går: stripen viste «I dag» for dagen som
 * nettopp var slutt, og kalte dagen leseren faktisk sto i for morgendagens
 * ukedag. En som åpnet appen kl. 00.30 natt til onsdag så «I dag, ons, tor …»
 * — der «ons» var i dag.
 */

// Serveren går i UTC, og det er der feilen bor. Se samme linje i
// mushroom-day/__tests__/oslo-dato.test.ts.
const OPPRINNELIG_SONE = process.env.TZ;
process.env.TZ = 'UTC';

let oppslag = 0;
let sprak: 'nb' | 'sv' = 'nb';
let prognose: DailyForecast[] = [];

const VAER: WeatherSummary = {
  source: 'met_frost',
  temperatureC: 13,
  humidityPct: 85,
  humidityEstimated: false,
  rain3dMm: 12,
  rain7dMm: 28,
  rain14dMm: 56,
  minTemp7dC: 8,
  maxTemp7dC: 17,
  soilMoistureIndex: 0.7,
  precipDailyMm: Array(14).fill(4)
};

/** Det buildWeek gir assessMushroomDay for dag 0. */
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
vi.mock('@/lib/weather/forecast', () => ({ fetchDailyForecast: async () => prognose }));

const { GET } = await import('../route');

/**
 * Prognosen slik MET gir den: døgn i UTC, fra og med det døgnet vi står i.
 * `fraUtc` er UTC-datoen for første døgn.
 */
function metPrognose(fraUtc: string, antall = 9): DailyForecast[] {
  return Array.from({ length: antall }, (_, i) => {
    const d = new Date(`${fraUtc}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), tempC: 13, precipMm: 4, humidityPct: 85 };
  });
}

interface Svar {
  today: { score: number; title: string };
  days: Array<{ date: string; label: string; isToday: boolean }>;
}

let klient = 0;
async function hent(lat: string): Promise<Svar> {
  klient += 1;
  const res = await GET(
    new NextRequest(`https://mycelet.com/api/mushroom-forecast?lat=${lat}&lon=10.75`, {
      headers: { 'x-forwarded-for': `10.7.0.${klient}` }
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Svar;
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

describe('/api/mushroom-forecast: stripen starter på dagen i Oslo', () => {
  it('kl. 00.30 natt til onsdag er «I dag» onsdag, og neste søyle er torsdag', async () => {
    // 22.30 UTC tirsdag 15. september = 00.30 onsdag 16. september i Oslo.
    vi.setSystemTime(new Date('2026-09-15T22:30:00Z'));
    // MET har fortsatt et døgn for tirsdag (de to siste timene av det i UTC).
    prognose = metPrognose('2026-09-15');

    const { days } = await hent('59.91');
    expect(days[0]).toMatchObject({ date: '2026-09-16', isToday: true, label: 'I dag' });
    expect(days[1]).toMatchObject({ date: '2026-09-17', isToday: false, label: 'tor' });
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22'
    ]);
    // Dagen som er over, står ikke i stripen — og ingen dag står to ganger.
    expect(days.some((d) => d.date === '2026-09-15')).toBe(false);
    expect(new Set(days.map((d) => d.date)).size).toBe(days.length);
  });

  it('vintertid: kl. 00.30 er forskyvningen én time', async () => {
    // 23.30 UTC fredag 20. november = 00.30 lørdag 21. november i Oslo.
    vi.setSystemTime(new Date('2026-11-20T23:30:00Z'));
    prognose = metPrognose('2026-11-20');
    const { days } = await hent('59.92');
    expect(days[0]).toMatchObject({ date: '2026-11-21', isToday: true });
    expect(days[1]).toMatchObject({ date: '2026-11-22', label: 'søn' });
  });

  it('midt på dagen er stripen den samme som før', async () => {
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
    prognose = metPrognose('2026-09-15');
    const { days } = await hent('59.93');
    expect(days[0]).toMatchObject({ date: '2026-09-15', isToday: true });
    expect(days[1]).toMatchObject({ date: '2026-09-16', label: 'ons' });
    expect(days).toHaveLength(7);
  });

  it('en svensk leser får svenske ukedager fra samme dag', async () => {
    sprak = 'sv';
    vi.setSystemTime(new Date('2026-09-18T22:30:00Z')); // 00.30 lørdag 19. i Stockholm
    prognose = metPrognose('2026-09-18');
    const { days } = await hent('59.94');
    expect(days[0].date).toBe('2026-09-19');
    expect(days[1]).toMatchObject({ date: '2026-09-20', label: 'sön' });
  });
});

describe('/api/mushroom-forecast: måneden og dagen følger Oslo', () => {
  it('1. juni kl. 00.30 vurderes som juni — ikke mai, som er utenom sesongen', async () => {
    vi.setSystemTime(new Date('2026-05-31T22:30:00Z'));
    prognose = metPrognose('2026-05-31');

    const iOslo = assessMushroomDay(VAERGRUNNLAG, 6, 'nb', 1);
    const iUtc = assessMushroomDay(VAERGRUNNLAG, 5, 'nb', 31);
    expect(iUtc.title).not.toBe(iOslo.title);

    const { today, days } = await hent('59.95');
    expect(today.title).toBe(iOslo.title);
    expect(today.score).toBe(iOslo.score);
    expect(days[0].date).toBe('2026-06-01');
  });
});

describe('/api/mushroom-forecast: mellomlageret skifter dag ved midnatt i Oslo', () => {
  it('et svar fra før midnatt brukes ikke etter midnatt', async () => {
    prognose = metPrognose('2026-09-15');
    vi.setSystemTime(new Date('2026-09-15T21:50:00Z')); // 23.50 i Oslo
    const forMidnatt = await hent('60.10');
    vi.setSystemTime(new Date('2026-09-15T22:10:00Z')); // 00.10 i Oslo
    const etterMidnatt = await hent('60.10');

    expect(oppslag).toBe(2);
    expect(forMidnatt.days[0].date).toBe('2026-09-15');
    expect(etterMidnatt.days[0].date).toBe('2026-09-16');
  });

  it('… og midnatt i UTC er ikke lenger et dagskifte', async () => {
    prognose = metPrognose('2026-09-15');
    vi.setSystemTime(new Date('2026-09-15T23:50:00Z')); // 01.50 i Oslo
    await hent('60.20');
    vi.setSystemTime(new Date('2026-09-16T00:10:00Z')); // 02.10 i Oslo
    await hent('60.20');
    expect(oppslag).toBe(1);
  });

  it('språket er fortsatt del av nøkkelen', async () => {
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
    prognose = metPrognose('2026-09-15');
    const norsk = await hent('60.30');
    sprak = 'sv';
    const svensk = await hent('60.30');
    expect(oppslag).toBe(2);
    expect(norsk.days[1].label).toBe('ons');
    expect(svensk.days[1].label).toBe('ons');
    expect(norsk.days[5].label).toBe('søn');
    expect(svensk.days[5].label).toBe('sön');
  });
});
