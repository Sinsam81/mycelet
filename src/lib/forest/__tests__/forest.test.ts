import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getForestProperties as nibioGet } from '@/lib/nibio';
import { getSwedishForestProperties as sluGet } from '@/lib/slu';
import { buildSpeciesHabitatPreferences, getForestProperties } from '@/lib/forest';
import type { ForestProperties } from '@/lib/forest';

vi.mock('@/lib/nibio', () => ({
  getForestProperties: vi.fn(),
  computeHabitatScore: vi.fn()
}));
vi.mock('@/lib/slu', () => ({
  getSwedishForestProperties: vi.fn()
}));

const mockNibio = vi.mocked(nibioGet);
const mockSlu = vi.mocked(sluGet);

describe('getForestProperties (region dispatcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes Norwegian coordinates to the NIBIO adapter', async () => {
    const sample: ForestProperties = {
      forestType: 'gran',
      ageYears: null,
      productivity: 14,
      volumePerHa: 200,
      source: 'sr16'
    };
    mockNibio.mockResolvedValue(sample);

    const result = await getForestProperties({ lat: 59.9, lon: 10.75 });

    expect(result).toBe(sample);
    expect(mockNibio).toHaveBeenCalledWith({ lat: 59.9, lon: 10.75 });
    expect(mockSlu).not.toHaveBeenCalled();
  });

  it('routes Swedish coordinates to the SLU adapter', async () => {
    mockSlu.mockResolvedValue(null);

    const result = await getForestProperties({ lat: 59.33, lon: 18.07 });

    expect(result).toBeNull();
    expect(mockSlu).toHaveBeenCalledWith({ lat: 59.33, lon: 18.07 });
    expect(mockNibio).not.toHaveBeenCalled();
  });

  it('returns null for non-Nordic coordinates without calling any adapter', async () => {
    const result = await getForestProperties({ lat: 51.5, lon: -0.12 });

    expect(result).toBeNull();
    expect(mockNibio).not.toHaveBeenCalled();
    expect(mockSlu).not.toHaveBeenCalled();
  });
});

describe('buildSpeciesHabitatPreferences', () => {
  it('maps a species row to habitat preferences', () => {
    expect(
      buildSpeciesHabitatPreferences({
        mycorrhizalPartners: ['gran', 'eik'],
        habitat: ['granskog', 'kalkrik']
      })
    ).toEqual({ preferredPartners: ['gran', 'eik'], habitat: ['granskog', 'kalkrik'] });
  });

  it('defaults null columns to empty arrays', () => {
    expect(buildSpeciesHabitatPreferences({ mycorrhizalPartners: null, habitat: null })).toEqual({
      preferredPartners: [],
      habitat: []
    });
  });

  it('folds Norwegian tree names (bjørk/bøk/gråor) to the ASCII vocabulary', () => {
    expect(
      buildSpeciesHabitatPreferences({
        mycorrhizalPartners: ['bjørk', 'bøk', 'gråor', 'eik'],
        habitat: ['lauvskog']
      })
    ).toEqual({ preferredPartners: ['bjork', 'bok', 'graor', 'eik'], habitat: ['lauvskog'] });
  });
});
