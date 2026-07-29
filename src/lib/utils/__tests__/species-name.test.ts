import { describe, expect, it } from 'vitest';
import { compareSpeciesByDisplayName, getSpeciesDisplayName } from '@/lib/utils/species-name';

describe('getSpeciesDisplayName', () => {
  it('uses the curated Swedish name for the Swedish locale', () => {
    expect(
      getSpeciesDisplayName({ norwegian_name: 'Hvit fluesopp', swedish_name: 'Vit flugsvamp' }, 'sv')
    ).toBe('Vit flugsvamp');
  });

  it('falls back to Norwegian when a Swedish name is missing', () => {
    expect(getSpeciesDisplayName({ norwegian_name: 'Kantarell', swedish_name: null }, 'sv')).toBe('Kantarell');
  });

  it('keeps Norwegian as the primary name in Norwegian', () => {
    expect(
      getSpeciesDisplayName({ norwegian_name: 'Hvit fluesopp', swedish_name: 'Vit flugsvamp' }, 'nb')
    ).toBe('Hvit fluesopp');
  });
});

describe('compareSpeciesByDisplayName', () => {
  it('sorts by the visible localized name', () => {
    const rows = [
      { norwegian_name: 'Rød fluesopp', swedish_name: 'Röd flugsvamp' },
      { norwegian_name: 'Hvit fluesopp', swedish_name: 'Vit flugsvamp' }
    ];

    expect([...rows].sort((a, b) => compareSpeciesByDisplayName(a, b, 'sv'))[0]?.swedish_name).toBe(
      'Röd flugsvamp'
    );
  });
});
