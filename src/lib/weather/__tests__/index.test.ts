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
    // Placeholder key → Frost is skipped (isRealKey false); routing falls
    // through to OpenWeather, which has no key set here.
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

describe('fetchFrost (via Norway coords with key)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    vi.stubEnv('MET_FROST_CLIENT_ID', 'frost-client-id-abcdef123456');
    vi.stubEnv('OPENWEATHER_API_KEY', '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function frostData(items: unknown[]): Response {
    return mockJson({ data: items });
  }
  // Fixtures are built at describe-eval time (before fake timers engage), so
  // anchor them to the same fixed clock the tests set via setSystemTime.
  const NOW = new Date('2026-08-15T12:00:00Z').getTime();
  function frostItem(sourceId: string, daysAgo: number, observations: unknown[]) {
    return {
      sourceId,
      referenceTime: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      observations
    };
  }

  // Daily aggregates over the window — temp/humidity (means), rain, extremes.
  // 15d-ago point is outside the 14d window. Latest day (1d ago) wins for
  // "current" temp/humidity.
  const DAILY = [
    frostItem('SN18700:0', 15, [{ elementId: 'sum(precipitation_amount P1D)', value: 5 }]),
    frostItem('SN18700:0', 10, [
      { elementId: 'mean(air_temperature P1D)', value: 11 },
      { elementId: 'sum(precipitation_amount P1D)', value: 3 }
    ]),
    frostItem('SN18700:0', 6, [
      { elementId: 'mean(air_temperature P1D)', value: 12 },
      { elementId: 'mean(relative_humidity P1D)', value: 80 },
      { elementId: 'sum(precipitation_amount P1D)', value: 2 },
      { elementId: 'min(air_temperature P1D)', value: 5 },
      { elementId: 'max(air_temperature P1D)', value: 18 }
    ]),
    frostItem('SN18700:0', 2, [
      { elementId: 'mean(air_temperature P1D)', value: 12 },
      { elementId: 'mean(relative_humidity P1D)', value: 81 },
      { elementId: 'sum(precipitation_amount P1D)', value: 4 },
      { elementId: 'min(air_temperature P1D)', value: 7 },
      { elementId: 'max(air_temperature P1D)', value: 20 }
    ]),
    frostItem('SN18700:0', 1, [
      { elementId: 'mean(air_temperature P1D)', value: 13 },
      { elementId: 'mean(relative_humidity P1D)', value: 82 },
      { elementId: 'sum(precipitation_amount P1D)', value: 6 },
      { elementId: 'min(air_temperature P1D)', value: 9 },
      { elementId: 'max(air_temperature P1D)', value: 22 }
    ])
  ];

  function frostFetch() {
    return vi.fn(async (url: unknown, _init?: unknown) => {
      const u = String(url);
      if (u.includes('/sources/v0.jsonld')) return frostData([{ id: 'SN18700' }, { id: 'SN90450' }]);
      if (u.includes('/observations')) return frostData(DAILY);
      throw new Error(`Unmocked URL: ${u}`);
    });
  }

  it('returns a met_frost summary from a single daily-aggregate query', async () => {
    const fetchSpy = frostFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(OSLO);
    expect(result).not.toBeNull();
    expect(result?.source).toBe('met_frost');
    expect(result?.temperatureC).toBe(13); // latest daily mean temp
    expect(result?.humidityPct).toBe(82); // latest daily mean humidity
    expect(result?.rain3dMm).toBeCloseTo(10, 1); // 2d=4 + 1d=6
    expect(result?.rain7dMm).toBeCloseTo(12, 1); // + 6d=2
    expect(result?.rain14dMm).toBeCloseTo(15, 1); // + 10d=3 (15d excluded)
    expect(result?.minTemp7dC).toBe(5);
    expect(result?.maxTemp7dC).toBe(22);
    // First call is the nearest-station lookup
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/sources/v0.jsonld');
    // Exactly one observations call (no separate instant query)
    const obsCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/observations'));
    expect(obsCalls).toHaveLength(1);
  });

  it('sends HTTP Basic auth derived from the client id', async () => {
    const fetchSpy = frostFetch();
    vi.stubGlobal('fetch', fetchSpy);

    await fetchWeatherSummary(OSLO);

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
    expect(authHeader.startsWith('Basic ')).toBe(true);
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('frost-client-id-abcdef123456:');
  });

  it('returns null when no station is found nearby', async () => {
    const fetchSpy = vi.fn(async (url: unknown) => {
      if (String(url).includes('/sources')) return frostData([]);
      throw new Error('should not reach observations');
    });
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchWeatherSummary(OSLO)).toBeNull();
  });

  it('returns null when temperature data is missing', async () => {
    // Daily query returns rain but no mean temp → no usable summary.
    const dailyNoTemp = [
      frostItem('SN18700:0', 1, [{ elementId: 'sum(precipitation_amount P1D)', value: 6 }])
    ];
    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/sources')) return frostData([{ id: 'SN18700' }]);
      return frostData(dailyNoTemp);
    });
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchWeatherSummary(OSLO)).toBeNull();
  });

  it('defaults humidity to 0 when no humidity is reported', async () => {
    const dailyNoHumidity = [
      frostItem('SN18700:0', 1, [
        { elementId: 'mean(air_temperature P1D)', value: 14 },
        { elementId: 'sum(precipitation_amount P1D)', value: 3 }
      ])
    ];
    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/sources')) return frostData([{ id: 'SN18700' }]);
      return frostData(dailyNoHumidity);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchWeatherSummary(OSLO);
    expect(result?.temperatureC).toBe(14);
    expect(result?.humidityPct).toBe(0);
  });

  it('skips Frost entirely when the key is the placeholder', async () => {
    vi.stubEnv('MET_FROST_CLIENT_ID', 'your-api-key-here');
    const fetchSpy = vi.fn().mockResolvedValue(mockJson({ data: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    expect(await fetchWeatherSummary(OSLO)).toBeNull();
    for (const url of fetchSpy.mock.calls.map((c) => String(c[0]))) {
      expect(url).not.toContain('frost.met.no');
    }
  });
});
