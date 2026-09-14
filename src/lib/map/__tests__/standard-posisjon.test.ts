import { describe, expect, it } from 'vitest';
import { STANDARD_POSISJON, standardPosisjon } from '../standard-posisjon';
import { nearestRegion } from '@/lib/prediction/tile-regions';

describe('standardPosisjon', () => {
  it('følger språket: norsk starter i Oslo, svensk i Stockholm', () => {
    expect(nearestRegion(standardPosisjon('nb').lat, standardPosisjon('nb').lng)?.region.name).toBe('Oslo');
    expect(nearestRegion(standardPosisjon('sv').lat, standardPosisjon('sv').lng)?.region.name).toBe('Stockholm');
  });

  it('ukjent språk faller til norsk', () => {
    expect(standardPosisjon('en')).toEqual(STANDARD_POSISJON.nb);
  });

  it('hver standard ligger INNE i sitt område, så etiketten blir bynavnet og ikke en løs landsdel', () => {
    for (const [locale, p] of Object.entries(STANDARD_POSISJON)) {
      expect(nearestRegion(p.lat, p.lng)?.inside, locale).toBe(true);
    }
  });
});
