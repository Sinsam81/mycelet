import { describe, expect, it } from 'vitest';
import { nullableNumber, parseSmhiCsv } from '../weather-features.mjs';

describe('SMHI corrected-archive parsing', () => {
  it('parses hourly and instantaneous rows', () => {
    const rows = parseSmhiCsv(`header;ignored
2025-09-05;13:00:00;14,6;G
2025-09-05;14:00:00;not-a-number;G`);

    expect(rows).toEqual([
      {
        date: '2025-09-05',
        time: Date.parse('2025-09-05T13:00:00Z'),
        value: 14.6
      }
    ]);
  });

  it('parses daily aggregate and extreme rows by representative date', () => {
    const rows = parseSmhiCsv(
      '2025-09-04 06:00:01;2025-09-05 06:00:00;2025-09-04;7.2;G'
    );

    expect(rows).toEqual([
      {
        date: '2025-09-04',
        time: Date.parse('2025-09-04T12:00:00Z'),
        value: 7.2
      }
    ]);
  });
});

describe('weather feature number coercion', () => {
  it('preserves missing values instead of converting them to zero', () => {
    expect(nullableNumber(null)).toBeNull();
    expect(nullableNumber(undefined)).toBeNull();
    expect(nullableNumber('')).toBeNull();
    expect(nullableNumber('0')).toBe(0);
    expect(nullableNumber('12.5')).toBe(12.5);
  });
});
