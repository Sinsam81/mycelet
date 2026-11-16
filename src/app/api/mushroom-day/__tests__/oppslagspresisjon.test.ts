import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PROVIDER_DECIMALS } from '@/lib/privacy/provider-precision';
import type { WeatherSummary } from '@/lib/weather';

/**
 * Punktet /api/mushroom-day får, er leserens posisjon. Dagens klienter sender
 * to desimaler, men ruta er åpen og sendte det hun fikk urørt til
 * værleverandøren — søskenet til /api/prediction, som alt runder av
 * (provider-precision.ts).
 */

const sett: Array<{ lat: number; lon: number }> = [];

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

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/weather', () => ({
  fetchWeatherSummary: async (punkt: { lat: number; lon: number }) => {
    sett.push(punkt);
    return VAER;
  }
}));

const { GET } = await import('../route');

/** Antall desimaler i tallet slik det ville stått i en URL. */
function desimaler(tall: number): number {
  const [, brok = ''] = String(tall).split('.');
  return brok.length;
}

let klient = 0;
function hent(lat: string, lon: string) {
  klient += 1;
  return GET(
    new NextRequest(`https://mycelet.com/api/mushroom-day?lat=${lat}&lon=${lon}`, {
      headers: { 'x-forwarded-for': `10.4.0.${klient}` }
    })
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T09:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  sett.length = 0;
});

describe('/api/mushroom-day og værleverandøren', () => {
  it('sender aldri mer enn tre desimaler ut av huset', async () => {
    const res = await hent('59.123456789', '10.987654321');
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).score).toBe('number');

    expect(sett).toEqual([{ lat: 59.123, lon: 10.988 }]);
    expect(desimaler(sett[0].lat)).toBeLessThanOrEqual(PROVIDER_DECIMALS);
    expect(desimaler(sett[0].lon)).toBeLessThanOrEqual(PROVIDER_DECIMALS);
  });

  it('lar et punkt som alt er grovt, stå urørt', async () => {
    // Det klientene faktisk sender i dag. Avrundingen skal ikke flytte det.
    await hent('60.39', '5.32');
    expect(sett).toEqual([{ lat: 60.39, lon: 5.32 }]);
  });

  it('avviser fortsatt ugyldige koordinater før noe slås opp', async () => {
    expect((await hent('91', '10')).status).toBe(400);
    expect((await hent('', '')).status).toBe(400);
    expect(sett).toEqual([]);
  });
});
