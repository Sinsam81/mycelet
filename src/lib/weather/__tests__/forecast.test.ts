import { describe, expect, it } from 'vitest';
import { aggregateDailyForecast, type ForecastTimeStep } from '@/lib/weather/forecast';

const steps: ForecastTimeStep[] = [
  // Day 1 — two hourly steps (use next_1_hours), then one with only next_6_hours.
  { time: '2026-09-01T06:00:00Z', data: { instant: { details: { air_temperature: 10, relative_humidity: 80 } }, next_1_hours: { details: { precipitation_amount: 1 } }, next_6_hours: { details: { precipitation_amount: 6 } } } },
  { time: '2026-09-01T07:00:00Z', data: { instant: { details: { air_temperature: 12, relative_humidity: 90 } }, next_1_hours: { details: { precipitation_amount: 2 } } } },
  { time: '2026-09-01T12:00:00Z', data: { instant: { details: { air_temperature: 14, relative_humidity: 70 } }, next_6_hours: { details: { precipitation_amount: 3 } } } },
  // Day 2 — one step.
  { time: '2026-09-02T06:00:00Z', data: { instant: { details: { air_temperature: 8, relative_humidity: 60 } }, next_6_hours: { details: { precipitation_amount: 0 } } } }
];

describe('aggregateDailyForecast', () => {
  it('groups timesteps into per-day buckets, sorted by date', () => {
    const days = aggregateDailyForecast(steps);
    expect(days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('sums precipitation, preferring the 1-hour window over the overlapping 6-hour one', () => {
    const [day1] = aggregateDailyForecast(steps);
    // 1 (next_1h) + 2 (next_1h) + 3 (next_6h, no 1h on that step) = 6 — NOT counting the 6mm next_6h on the first step.
    expect(day1.precipMm).toBe(6);
  });

  it('averages temperature and humidity per day', () => {
    const [day1] = aggregateDailyForecast(steps);
    expect(day1.tempC).toBe(12); // (10 + 12 + 14) / 3
    expect(day1.humidityPct).toBe(80); // (80 + 90 + 70) / 3
  });

  it('handles an empty timeseries', () => {
    expect(aggregateDailyForecast([])).toEqual([]);
  });
});
