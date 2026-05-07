import { describe, expect, it } from 'vitest';
import {
  GENUS_PREFERENCES,
  SPECIES_PREFERENCES,
  computeSpeciesAdjustment,
  resolveGenusPreferences,
  resolveSpeciesPreferences,
  type SpeciesContext
} from '../species-scoring';

const KANTARELL: SpeciesContext = {
  genus: 'Cantharellus',
  seasonStart: 7,
  seasonEnd: 10,
  peakSeasonStart: 8,
  peakSeasonEnd: 9
};

const STEINSOPP: SpeciesContext = {
  genus: 'Boletus',
  seasonStart: 7,
  seasonEnd: 10,
  peakSeasonStart: 8,
  peakSeasonEnd: 9
};

const PIGGSOPP: SpeciesContext = {
  genus: 'Hydnum',
  seasonStart: 9,
  seasonEnd: 11,
  peakSeasonStart: 10,
  peakSeasonEnd: 11
};

const PERFECT_KANTARELL_WEATHER = { temperature: 16, humidity: 85, rain3dMm: 10 };
const PERFECT_BOLETUS_WEATHER = { temperature: 18, humidity: 75, rain3dMm: 8 };
const DRY_HOT_WEATHER = { temperature: 28, humidity: 35, rain3dMm: 0 };
const COLD_WET_WEATHER = { temperature: 4, humidity: 90, rain3dMm: 12 };

describe('computeSpeciesAdjustment — season gating', () => {
  it('collapses to ~0.05 when month is outside species window', () => {
    // Kantarell in February — out of season
    const result = computeSpeciesAdjustment(KANTARELL, PERFECT_KANTARELL_WEATHER, 2);
    expect(result).toBeLessThan(0.1);
  });

  it('returns at least 0.5 when in season with weather of any kind', () => {
    // Kantarell in August + decent weather
    const result = computeSpeciesAdjustment(KANTARELL, PERFECT_KANTARELL_WEATHER, 8);
    expect(result).toBeGreaterThanOrEqual(0.5);
  });

  it('handles wrap-around seasons (e.g. Nov-Feb species)', () => {
    const winterSpecies: SpeciesContext = {
      genus: null,
      seasonStart: 11,
      seasonEnd: 2,
      peakSeasonStart: null,
      peakSeasonEnd: null
    };
    const okWeather = { temperature: 8, humidity: 75, rain3dMm: 5 };
    expect(computeSpeciesAdjustment(winterSpecies, okWeather, 12)).toBeGreaterThan(0.4);
    expect(computeSpeciesAdjustment(winterSpecies, okWeather, 1)).toBeGreaterThan(0.4);
    expect(computeSpeciesAdjustment(winterSpecies, okWeather, 6)).toBeLessThan(0.1);
  });
});

describe('computeSpeciesAdjustment — peak season bonus', () => {
  it('boosts multiplier in peak season vs shoulder season', () => {
    const peak = computeSpeciesAdjustment(KANTARELL, PERFECT_KANTARELL_WEATHER, 8); // peak
    const shoulder = computeSpeciesAdjustment(KANTARELL, PERFECT_KANTARELL_WEATHER, 10); // shoulder
    expect(peak).toBeGreaterThan(shoulder);
  });

  it('caps multiplier at 1.3 even in peak with perfect weather', () => {
    const result = computeSpeciesAdjustment(KANTARELL, PERFECT_KANTARELL_WEATHER, 8);
    expect(result).toBeLessThanOrEqual(1.3);
  });
});

describe('computeSpeciesAdjustment — genus-specific weather fit', () => {
  it('rates kantarell higher than steinsopp in cool wet weather', () => {
    // Kantarell wants 12-20°C and high humidity; steinsopp wants 15-22°C
    const coolWet = { temperature: 13, humidity: 85, rain3dMm: 8 };
    const kantarell = computeSpeciesAdjustment(KANTARELL, coolWet, 8);
    const steinsopp = computeSpeciesAdjustment(STEINSOPP, coolWet, 8);
    expect(kantarell).toBeGreaterThan(steinsopp);
  });

  it('rates steinsopp higher than kantarell in warm moderate weather', () => {
    // Warm with moderate humidity favors Boletus
    const warmModerate = { temperature: 19, humidity: 65, rain3dMm: 6 };
    const kantarell = computeSpeciesAdjustment(KANTARELL, warmModerate, 8);
    const steinsopp = computeSpeciesAdjustment(STEINSOPP, warmModerate, 8);
    expect(steinsopp).toBeGreaterThan(kantarell);
  });

  it('rates piggsopp better than steinsopp in cold conditions (cold-tolerant species)', () => {
    // Piggsopp tolerates colder; steinsopp's ceiling for tempCFloor is 8°C
    const cold = { temperature: 6, humidity: 80, rain3dMm: 5 };
    // Both must be in season for the comparison to be meaningful
    // Use month 10 (in both windows)
    const piggsopp = computeSpeciesAdjustment(PIGGSOPP, cold, 10);
    const steinsopp = computeSpeciesAdjustment(STEINSOPP, cold, 10);
    expect(piggsopp).toBeGreaterThan(steinsopp);
  });

  it('penalizes all species in dry-hot conditions', () => {
    const kantarell = computeSpeciesAdjustment(KANTARELL, DRY_HOT_WEATHER, 8);
    const steinsopp = computeSpeciesAdjustment(STEINSOPP, DRY_HOT_WEATHER, 8);
    // Should be in the 0.5-0.65 band (in season, but weather is bad)
    expect(kantarell).toBeLessThan(0.7);
    expect(steinsopp).toBeLessThan(0.7);
  });

  it('rewards all species (in season) with optimal-ish weather', () => {
    const kantarell = computeSpeciesAdjustment(KANTARELL, PERFECT_KANTARELL_WEATHER, 8);
    const steinsopp = computeSpeciesAdjustment(STEINSOPP, PERFECT_BOLETUS_WEATHER, 8);
    expect(kantarell).toBeGreaterThan(0.85);
    expect(steinsopp).toBeGreaterThan(0.85);
  });
});

describe('resolveGenusPreferences fallback', () => {
  it('returns generic preferences for null genus', () => {
    const prefs = resolveGenusPreferences(null);
    expect(prefs).toBeDefined();
    expect(prefs.tempCMin).toBeGreaterThan(0);
  });

  it('returns generic preferences for unknown genus', () => {
    const prefs = resolveGenusPreferences('Foobariaceae');
    expect(prefs).toBeDefined();
    // Must NOT be one of the explicit genus profiles
    expect(prefs).not.toBe(GENUS_PREFERENCES.Cantharellus);
  });

  it('returns specific preferences for known genus', () => {
    const prefs = resolveGenusPreferences('Cantharellus');
    expect(prefs).toBe(GENUS_PREFERENCES.Cantharellus);
  });
});

describe('GENUS_PREFERENCES sanity', () => {
  it('every entry has temp window with floor < min < max < ceil', () => {
    for (const [genus, prefs] of Object.entries(GENUS_PREFERENCES)) {
      expect(prefs.tempCFloor, `${genus} floor < min`).toBeLessThan(prefs.tempCMin);
      expect(prefs.tempCMin, `${genus} min < max`).toBeLessThan(prefs.tempCMax);
      expect(prefs.tempCMax, `${genus} max < ceil`).toBeLessThan(prefs.tempCCeil);
    }
  });

  it('every entry has weights in [0, 1] and a description', () => {
    for (const [genus, prefs] of Object.entries(GENUS_PREFERENCES)) {
      expect(prefs.rainWeight, `${genus} rainWeight`).toBeGreaterThanOrEqual(0);
      expect(prefs.rainWeight, `${genus} rainWeight`).toBeLessThanOrEqual(1);
      expect(prefs.humidityWeight, `${genus} humidityWeight`).toBeGreaterThanOrEqual(0);
      expect(prefs.humidityWeight, `${genus} humidityWeight`).toBeLessThanOrEqual(1);
      expect(prefs.description.length, `${genus} description`).toBeGreaterThan(10);
    }
  });
});

describe('resolveSpeciesPreferences — species-level overrides', () => {
  const TRAKTKANTARELL: SpeciesContext = {
    latinName: 'Craterellus tubaeformis',
    genus: 'Craterellus',
    seasonStart: 8,
    seasonEnd: 11,
    peakSeasonStart: 9,
    peakSeasonEnd: 10
  };

  const SVART_TROMPETSOPP: SpeciesContext = {
    latinName: 'Craterellus cornucopioides',
    genus: 'Craterellus',
    seasonStart: 9,
    seasonEnd: 10,
    peakSeasonStart: 9,
    peakSeasonEnd: 10
  };

  it('returns species-level override when latinName matches', () => {
    const prefs = resolveSpeciesPreferences(SVART_TROMPETSOPP);
    expect(prefs).toBe(SPECIES_PREFERENCES['Craterellus cornucopioides']);
    expect(prefs.humidityWeight).toBe(1.0);
    expect(prefs.description.toLowerCase()).toContain('svart trompetsopp');
  });

  it('falls back to genus profile when no species override exists', () => {
    const prefs = resolveSpeciesPreferences(TRAKTKANTARELL);
    expect(prefs).toBe(GENUS_PREFERENCES.Craterellus);
  });

  it('falls back to GENERIC_PREFERENCES when neither species nor genus match', () => {
    const obscure: SpeciesContext = {
      latinName: 'Foobaria nonexistens',
      genus: 'Foobaria',
      seasonStart: 8,
      seasonEnd: 10,
      peakSeasonStart: null,
      peakSeasonEnd: null
    };
    const prefs = resolveSpeciesPreferences(obscure);
    // Generic profile — not the same object as any genus profile
    expect(prefs).not.toBe(GENUS_PREFERENCES.Craterellus);
    expect(prefs).not.toBe(GENUS_PREFERENCES.Cantharellus);
  });

  it('handles missing latinName by falling through to genus', () => {
    const speciesWithoutLatin: SpeciesContext = {
      ...TRAKTKANTARELL,
      latinName: undefined
    };
    const prefs = resolveSpeciesPreferences(speciesWithoutLatin);
    expect(prefs).toBe(GENUS_PREFERENCES.Craterellus);
  });

  it('svart trompetsopp scores HIGHER than traktkantarell in warm wet løvskog conditions', () => {
    // 16°C, high humidity, lots of rain — løvskog conditions in september.
    // Svart trompetsopp's optimum is 12-18°C with humidityWeight=1.0,
    // traktkantarell's genus default is 8-16°C with humidityWeight=0.85.
    const løvskogWeather = { temperature: 16, humidity: 92, rain3dMm: 9 };
    const month = 10;

    const svartScore = computeSpeciesAdjustment(SVART_TROMPETSOPP, løvskogWeather, month);
    const traktScore = computeSpeciesAdjustment(TRAKTKANTARELL, løvskogWeather, month);

    expect(svartScore).toBeGreaterThan(traktScore);
  });

  it('traktkantarell scores HIGHER than svart trompetsopp in cool granskog conditions', () => {
    // 9°C, moderate humidity, light rain. Traktkantarell prefers cooler
    // (genus default Craterellus is 8-16°C); svart trompetsopp wants
    // warmer (12°C+).
    const granskogWeather = { temperature: 9, humidity: 75, rain3dMm: 5 };
    const month = 10;

    const svartScore = computeSpeciesAdjustment(SVART_TROMPETSOPP, granskogWeather, month);
    const traktScore = computeSpeciesAdjustment(TRAKTKANTARELL, granskogWeather, month);

    expect(traktScore).toBeGreaterThan(svartScore);
  });
});
