import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHistoricalFrostFeatures } from '@/lib/weather/historical-frost';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('historical Frost weather features', () => {
  it('uses stations valid on the occurrence date and computes bounded weather windows', async () => {
    vi.stubEnv('MET_FROST_CLIENT_ID', 'frost-client-id-abcdef');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      expect(String(new Headers(init?.headers).get('Authorization'))).toMatch(/^Basic /);

      if (url.pathname.includes('/sources/')) {
        expect(url.searchParams.get('validtime')).toBe('2024-08-10');
        return jsonResponse({ data: [{ id: 'SN1' }, { id: 'SN2' }] });
      }

      expect(url.searchParams.get('referencetime')).toBe('2024-07-28/2024-08-11');
      return jsonResponse({
        data: [
          {
            sourceId: 'SN1:0',
            referenceTime: '2024-08-10T00:00:00Z',
            observations: [
              { elementId: 'mean(air_temperature P1D)', value: 15 },
              { elementId: 'mean(relative_humidity P1D)', value: 82 },
              { elementId: 'sum(precipitation_amount P1D)', value: 4 },
              { elementId: 'min(air_temperature P1D)', value: 8 },
              { elementId: 'max(air_temperature P1D)', value: 19 }
            ]
          },
          {
            sourceId: 'SN1:0',
            referenceTime: '2024-08-08T00:00:00Z',
            observations: [
              { elementId: 'sum(precipitation_amount P1D)', value: 2 },
              { elementId: 'min(air_temperature P1D)', value: 6 },
              { elementId: 'max(air_temperature P1D)', value: 17 }
            ]
          },
          {
            sourceId: 'SN1:0',
            referenceTime: '2024-08-04T00:00:00Z',
            observations: [{ elementId: 'sum(precipitation_amount P1D)', value: 3 }]
          }
        ]
      });
    });

    const result = await fetchHistoricalFrostFeatures({ lat: 60, lon: 10, observedAt: '2024-08-10' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      provider: 'met_frost',
      temperatureC: 15,
      humidityPct: 82,
      rain3dMm: 6,
      rain7dMm: 9,
      rain14dMm: 9,
      minTemp7dC: 6,
      maxTemp7dC: 19,
      sourceStationIds: ['frost:SN1']
    });
    expect(result.soilMoistureIndex).not.toBeNull();
  });

  it('keeps missing humidity nullable', async () => {
    vi.stubEnv('MET_FROST_CLIENT_ID', 'frost-client-id-abcdef');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'SN1' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              sourceId: 'SN1:0',
              referenceTime: '2024-08-10T00:00:00Z',
              observations: [{ elementId: 'mean(air_temperature P1D)', value: 12 }]
            }
          ]
        })
      );

    const result = await fetchHistoricalFrostFeatures({ lat: 60, lon: 10, observedAt: '2024-08-10' });
    expect(result.humidityPct).toBeNull();
    expect(result.rain14dMm).toBeNull();
  });
});
