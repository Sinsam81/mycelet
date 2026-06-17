import { fetchWeatherSummary, type WeatherSummary } from '@/lib/weather';

export interface WeatherBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface WeatherSample {
  lat: number;
  lon: number;
  weather: WeatherSummary;
}

export function weatherSamplePoints(bounds: WeatherBounds): { lat: number; lon: number }[] {
  const latSpan = Math.max(0, bounds.maxLat - bounds.minLat);
  const lngSpan = Math.max(0, bounds.maxLng - bounds.minLng);
  const latCount = latSpan > 0.6 ? 2 : 1;
  const lngCount = lngSpan > 1.4 ? 3 : lngSpan > 0.55 ? 2 : 1;
  const points: { lat: number; lon: number }[] = [];

  for (let i = 0; i < latCount; i++) {
    const lat = bounds.minLat + (latSpan * (i + 0.5)) / latCount;
    for (let j = 0; j < lngCount; j++) {
      const lon = bounds.minLng + (lngSpan * (j + 0.5)) / lngCount;
      points.push({ lat, lon });
    }
  }
  return points;
}

export async function fetchWeatherSamplesForBounds(bounds: WeatherBounds): Promise<WeatherSample[]> {
  const points = weatherSamplePoints(bounds);
  const samples = await Promise.all(
    points.map(async (point) => {
      const weather = await fetchWeatherSummary(point);
      return weather ? { ...point, weather } : null;
    })
  );
  return samples.filter((sample): sample is WeatherSample => sample !== null);
}

export function nearestWeatherSample(samples: WeatherSample[], lat: number, lon: number): WeatherSample | null {
  let best: WeatherSample | null = null;
  let bestD = Infinity;
  const lonScale = Math.cos((lat * Math.PI) / 180);
  for (const sample of samples) {
    const dLat = sample.lat - lat;
    const dLon = (sample.lon - lon) * lonScale;
    const d = dLat * dLat + dLon * dLon;
    if (d < bestD) {
      bestD = d;
      best = sample;
    }
  }
  return best;
}

export function weatherSourceSummary(samples: WeatherSample[]): string {
  const sources = [...new Set(samples.map((sample) => sample.weather.source))].sort();
  return sources.length ? sources.join('+') : 'unavailable';
}
