import { describe, expect, it } from 'vitest';
import { chooseWeatherBackgrounds, splitTemporalRows } from '../weather-validation.mjs';

function row(occurrenceId, observedAt, latitude = 60, longitude = 10) {
  return { occurrenceId, observedAt, latitude, longitude };
}

describe('weather validation', () => {
  it('fits on the past and reserves the newest observations for evaluation', () => {
    const split = splitTemporalRows([
      row(4, '2024-08-01'),
      row(2, '2022-08-01'),
      row(5, '2025-08-01'),
      row(1, '2021-08-01'),
      row(3, '2023-08-01')
    ], 0.4);

    expect(split.train.map((item) => item.occurrenceId)).toEqual([1, 2, 3]);
    expect(split.test.map((item) => item.occurrenceId)).toEqual([4, 5]);
    expect(split.trainThrough).toBe('2023-08-01');
  });

  it('prefers local same-year backgrounds before weaker fallbacks', () => {
    const presence = row(10, '2024-08-15', 60, 10);
    const matches = chooseWeatherBackgrounds(
      presence,
      [
        row(1, '2020-08-15', 60.01, 10.01),
        row(2, '2024-08-16', 60.1, 10.1),
        row(3, '2024-08-17', 65, 20)
      ],
      2
    );

    expect(matches.map((match) => match.row.occurrenceId)).toEqual([2, 3]);
    expect(matches.map((match) => match.tier)).toEqual(['local_same_year', 'regional_same_year']);
  });

  it('falls back to the same region and month when no nearby year matches exist', () => {
    const matches = chooseWeatherBackgrounds(
      row(10, '2024-09-10', 60, 10),
      [row(1, '2010-09-11', 65, 20)],
      1
    );

    expect(matches[0].tier).toBe('regional_month_fallback');
  });
});
