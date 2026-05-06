import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWeatherSummary } from '../index';

// Coordinates we use across tests
const STOCKHOLM = { lat: 59.3293, lon: 18.0686 };
const OSLO = { lat: 59.9139, lon: 10.7522 };
const LONDON = { lat: 51.5074, lon: -0.1278 };

// Helper: build a mocked Response
function mockJson(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body
  } as unknown as Response;
}

describe('fetchWeatherSummary — region routing', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns null for non-Nordic coords when no OpenWeather key configured', async () => {
    vi.stubEnv('OPENWEATHER_API_KEY', '');
    vi.stubEnv('MET_FROST_CLIENT_ID', '');
    const result = await fetchWeatherSummary(LONDON);
    expect(result).toBeNull();
  });

  it('returns null for Norway coords when MET_FROST_CLIENT_ID is the placeholder', async () => {
    // Frost adapter is a stub returning null; routing should also fall through
    // to OpenWeather, which has no key set here.
    vi.stubEnv('MET_FROST_CLIENT_ID', 'your-api-key-here');
    vi.stubEnv('OPENWEATHER_API_KEY', '');
    const result = await fetchWeatherSummary(OSLO);
    expect(result).toBeNull();
  });

  it('routes Sweden coords to SMHI even without any API key configured', async () => {
    vi.stubEnv('MET_FROST_CLIENT_ID', '');
    vi.stubEnv('OPENWEATHER_API_KEY', '');

    // SMHI returns no active stations everywhere → null. Verifies routing
    // attempted SMHI rather than just falling through.
    const fetchSpy = vi.fn().mockResolvedValue(mockJson({ station: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(STOCKHOLM);
    expect(result).toBeNull();
    // 5 station-list calls (one per parameter) before bailing on no temp/rain
    expect(fetchSpy).toHaveBeenCalled();
    const firstUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(firstUrl).toContain('opendata-download-metobs.smhi.se');
  });
});

describe('fetchSmhi (via Sweden coords)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    vi.stubEnv('MET_FROST_CLIENT_ID', '');
    vi.stubEnv('OPENWEATHER_API_KEY', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function smhiStation(key: string, lat: number, lon: number, active = true) {
    return { key, name: `Station ${key}`, latitude: lat, longitude: lon, active };
  }

  function smhiDataPoint(daysAgo: number, value: number) {
    const ms = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    return { date: ms, value: String(value), quality: 'G' };
  }

  it('returns null when SMHI station list returns nothing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockJson({ station: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(STOCKHOLM);
    expect(result).toBeNull();
  });

  it('returns null when only inactive stations exist', async () => {
    const inactive = [smhiStation('1', 59.3, 18.0, false)];
    const fetchSpy = vi.fn().mockResolvedValue(mockJson({ station: inactive }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(STOCKHOLM);
    expect(result).toBeNull();
  });

  it('returns a smhi-source summary when temp + rain stations both have data', async () => {
    // Stations near Stockholm
    const near = smhiStation('100', 59.34, 18.05);
    const far = smhiStation('200', 65.0, 25.0);

    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);

      // Station list endpoints
      if (u.endsWith('/parameter/1.json')) return mockJson({ station: [near, far] });
      if (u.endsWith('/parameter/5.json')) return mockJson({ station: [near] });
      if (u.endsWith('/parameter/6.json')) return mockJson({ station: [near] });
      if (u.endsWith('/parameter/19.json')) return mockJson({ station: [near] });
      if (u.endsWith('/parameter/20.json')) return mockJson({ station: [near] });

      // Air temp (param 1) — latest reading
      if (u.includes('parameter/1/station/100/period/latest-hour')) {
        return mockJson({ value: [smhiDataPoint(0, 16.5)] });
      }
      // Daily precip (param 5) — last 30 days, mix of values
      if (u.includes('parameter/5/station/100/period/latest-months')) {
        return mockJson({
          value: [
            smhiDataPoint(15, 5.0), // outside 14d
            smhiDataPoint(10, 3.0),
            smhiDataPoint(6, 2.0),
            smhiDataPoint(2, 4.0),
            smhiDataPoint(1, 6.0)
          ]
        });
      }
      // Humidity (param 6)
      if (u.includes('parameter/6/station/100/period/latest-hour')) {
        return mockJson({ value: [smhiDataPoint(0, 78)] });
      }
      // Min temp daily (param 19)
      if (u.includes('parameter/19/station/100/period/latest-months')) {
        return mockJson({
          value: [smhiDataPoint(6, 9), smhiDataPoint(5, 11), smhiDataPoint(2, 7)]
        });
      }
      // Max temp daily (param 20)
      if (u.includes('parameter/20/station/100/period/latest-months')) {
        return mockJson({
          value: [smhiDataPoint(6, 22), smhiDataPoint(5, 24), smhiDataPoint(2, 19)]
        });
      }

      throw new Error(`Unmocked URL: ${u}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(STOCKHOLM);
    expect(result).not.toBeNull();
    expect(result?.source).toBe('smhi');
    expect(result?.temperatureC).toBe(16.5);
    expect(result?.humidityPct).toBe(78);
    // rain3d covers last 3 days: today (1d ago=6.0) + 2d ago=4.0 = 10.0
    expect(result?.rain3dMm).toBeCloseTo(10.0, 1);
    // rain7d covers last 7 days: 1d=6.0 + 2d=4.0 + 6d=2.0 = 12.0
    expect(result?.rain7dMm).toBeCloseTo(12.0, 1);
    // rain14d adds 10d=3.0 → 15.0; 15d is outside window
    expect(result?.rain14dMm).toBeCloseTo(15.0, 1);
    // min over last 7d: should be 7
    expect(result?.minTemp7dC).toBe(7);
    // max over last 7d: should be 24
    expect(result?.maxTemp7dC).toBe(24);
  });

  it('uses nearest active station by approximate distance', async () => {
    const veryClose = smhiStation('CLOSE', 59.33, 18.07); // ~50m from Stockholm
    const farther = smhiStation('FAR', 60.0, 18.0); // ~75km north

    const calledStations: string[] = [];

    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('.json') && u.includes('/parameter/') && !u.includes('/station/')) {
        return mockJson({ station: [farther, veryClose] });
      }
      // Capture which station was queried for data
      const match = u.match(/\/station\/([^/]+)\//);
      if (match) calledStations.push(match[1]);
      // Make every data call valid so the function reaches the data-fetch
      // step on at least temp + rain (mandatory).
      if (u.includes('parameter/1/')) return mockJson({ value: [smhiDataPoint(0, 12)] });
      if (u.includes('parameter/5/')) return mockJson({ value: [smhiDataPoint(0, 1)] });
      if (u.includes('parameter/6/')) return mockJson({ value: [smhiDataPoint(0, 70)] });
      if (u.includes('parameter/19/')) return mockJson({ value: [smhiDataPoint(0, 8)] });
      if (u.includes('parameter/20/')) return mockJson({ value: [smhiDataPoint(0, 18)] });
      throw new Error(`Unmocked URL: ${u}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    await fetchWeatherSummary(STOCKHOLM);

    // Every captured station ID should be the close one — never the far one
    expect(calledStations.length).toBeGreaterThan(0);
    for (const stn of calledStations) {
      expect(stn).toBe('CLOSE');
    }
  });

  it('survives partial data: returns null if temp data missing entirely', async () => {
    const station = smhiStation('100', 59.34, 18.05);
    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('.json') && !u.includes('/station/')) {
        return mockJson({ station: [station] });
      }
      // Air temp returns no data points → temperatureC null → fetchSmhi returns null
      if (u.includes('parameter/1/')) return mockJson({ value: [] });
      // Everything else has data
      if (u.includes('parameter/5/')) return mockJson({ value: [smhiDataPoint(0, 5)] });
      if (u.includes('parameter/6/')) return mockJson({ value: [smhiDataPoint(0, 60)] });
      if (u.includes('parameter/19/')) return mockJson({ value: [smhiDataPoint(0, 4)] });
      if (u.includes('parameter/20/')) return mockJson({ value: [smhiDataPoint(0, 16)] });
      throw new Error(`Unmocked URL: ${u}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(STOCKHOLM);
    expect(result).toBeNull();
  });
});

describe('fetchOpenWeather (via non-Nordic coords with key)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    vi.stubEnv('MET_FROST_CLIENT_ID', '');
    vi.stubEnv('OPENWEATHER_API_KEY', 'real-openweather-key-12345678');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns an openweather-source summary for non-Nordic coords', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJson({
        list: [
          { main: { temp: 17.4, humidity: 72 }, rain: { '3h': 1.5 } },
          { main: { temp: 17.0, humidity: 73 }, rain: { '3h': 2.0 } },
          { main: { temp: 16.8, humidity: 75 } } // no rain
        ]
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(LONDON);
    expect(result).not.toBeNull();
    expect(result?.source).toBe('openweather');
    expect(result?.temperatureC).toBe(17.4);
    expect(result?.humidityPct).toBe(72);
    // rain3d is sum of first 24 entries; here first 3 entries have 1.5 + 2.0 = 3.5
    expect(result?.rain3dMm).toBeCloseTo(3.5, 1);
    expect(result?.rain14dMm).toBeNull();
    expect(result?.minTemp7dC).toBeNull();
    expect(result?.maxTemp7dC).toBeNull();
  });

  it('returns null when OpenWeather responds non-OK', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(LONDON);
    expect(result).toBeNull();
  });

  it('does NOT call OpenWeather for Sweden coords (uses SMHI instead)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockJson({ station: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchWeatherSummary(STOCKHOLM);

    // Verify no openweather URL was hit
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    for (const url of calls) {
      expect(url).not.toContain('openweathermap.org');
    }
  });
});
