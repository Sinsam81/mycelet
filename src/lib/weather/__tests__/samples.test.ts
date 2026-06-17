import { describe, expect, it } from 'vitest';
import { nearestWeatherSample, weatherSamplePoints, weatherSourceSummary, type WeatherSample } from '../samples';

const WEATHER = {
  source: 'met_frost' as const,
  temperatureC: 12,
  humidityPct: 80,
  rain3dMm: 10,
  rain7dMm: 20,
  rain14dMm: 30,
  minTemp7dC: 6,
  maxTemp7dC: 18,
  soilMoistureIndex: 0.7
};

describe('weatherSamplePoints', () => {
  it('uses one sample for compact local bounds', () => {
    expect(weatherSamplePoints({ minLat: 59.9, minLng: 10.6, maxLat: 60.1, maxLng: 10.9 })).toHaveLength(1);
  });

  it('caps larger prediction bounds at six samples', () => {
    expect(weatherSamplePoints({ minLat: 58, minLng: 10, maxLat: 59.5, maxLng: 13 })).toHaveLength(6);
  });
});

describe('nearestWeatherSample', () => {
  it('returns the closest weather sample', () => {
    const samples: WeatherSample[] = [
      { lat: 60, lon: 10, weather: WEATHER },
      { lat: 61, lon: 12, weather: { ...WEATHER, source: 'smhi' } }
    ];
    expect(nearestWeatherSample(samples, 60.1, 10.2)?.weather.source).toBe('met_frost');
    expect(nearestWeatherSample(samples, 60.9, 11.8)?.weather.source).toBe('smhi');
  });

  it('summarizes unique sources', () => {
    const samples: WeatherSample[] = [
      { lat: 60, lon: 10, weather: WEATHER },
      { lat: 61, lon: 12, weather: { ...WEATHER, source: 'smhi' } }
    ];
    expect(weatherSourceSummary(samples)).toBe('met_frost+smhi');
  });
});
