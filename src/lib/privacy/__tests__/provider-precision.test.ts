import { describe, expect, it } from 'vitest';
import { PROVIDER_DECIMALS, roundForProviderLookup } from '@/lib/privacy/provider-precision';

describe('roundForProviderLookup', () => {
  it('drops precision beyond ~100 m before the point leaves us', () => {
    const point = roundForProviderLookup(59.7912345, 10.6598765);
    expect(point).toEqual({ lat: 59.791, lon: 10.66 });
  });

  it('never sends more decimals than PROVIDER_DECIMALS', () => {
    const cases: Array<[number, number]> = [
      [59.9139271, 10.7522449],
      [-33.8688197, 151.2092955],
      [0.000049, -0.000049]
    ];
    for (const [lat, lon] of cases) {
      const point = roundForProviderLookup(lat, lon);
      for (const value of [point.lat, point.lon]) {
        const decimals = (String(value).split('.')[1] ?? '').length;
        expect(decimals).toBeLessThanOrEqual(PROVIDER_DECIMALS);
      }
    }
  });

  it('stays inside the box NIBIO SR16 queries anyway (+/-0.001 deg)', () => {
    // Avrundingen må ikke flytte punktet ut av oppslaget: maks avvik er en halv
    // enhet på siste desimal = 0,0005°, altså under SR16s egen halvbredde.
    const lat = 59.7912345;
    const lon = 10.6598765;
    const point = roundForProviderLookup(lat, lon);
    expect(Math.abs(point.lat - lat)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(point.lon - lon)).toBeLessThanOrEqual(0.0005);
  });

  it('is stable — the same input always yields the same lookup point', () => {
    expect(roundForProviderLookup(63.4305, 10.3951)).toEqual(roundForProviderLookup(63.4305, 10.3951));
  });
});
