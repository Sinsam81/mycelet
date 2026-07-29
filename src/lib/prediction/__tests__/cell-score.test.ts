import { describe, expect, it } from 'vitest';
import { bonitetToSoilScore, computeCellPrediction, volumeToVegetationScore } from '../cell-score';
import type { SpeciesContext } from '@/lib/utils/species-scoring';
import type { ForestProperties, SpeciesHabitatPreferences } from '@/lib/forest';

const KANTARELL: SpeciesContext = {
  latinName: 'Cantharellus cibarius',
  genus: 'Cantharellus',
  seasonStart: 7,
  seasonEnd: 9,
  peakSeasonStart: 8,
  peakSeasonEnd: 9
};

const KANTARELL_HABITAT: SpeciesHabitatPreferences = {
  preferredPartners: ['gran', 'furu', 'bjork'],
  habitat: ['barskog']
};

const GRAN_FOREST: ForestProperties = {
  forestType: 'gran',
  ageYears: null,
  productivity: 14,
  volumePerHa: 200,
  source: 'sr16'
};

const GOOD_WEATHER = { temperature: 15, humidity: 85, rain3dMm: 10 };

describe('bonitet/volume helpers', () => {
  it('maps bonitet to a 0-100 soil score', () => {
    expect(bonitetToSoilScore(6)).toBe(0);
    expect(bonitetToSoilScore(23)).toBe(100);
    expect(bonitetToSoilScore(14)).toBe(47);
  });

  it('maps volume to a 0-100 vegetation score', () => {
    expect(volumeToVegetationScore(0)).toBe(0);
    expect(volumeToVegetationScore(200)).toBe(50);
    expect(volumeToVegetationScore(400)).toBe(100);
    expect(volumeToVegetationScore(600)).toBe(100); // clamped
  });
});

describe('computeCellPrediction', () => {
  it('uses real bonitet/volume for the soil + vegetation factors', () => {
    const cell = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8,
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT
    });
    expect(cell.factors.soil).toBe(47); // bonitet 14
    expect(cell.factors.vegetation).toBe(50); // volume 200
  });

  it('returns a species + habitat fit when species and forest are present', () => {
    const cell = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8, // peak season
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT
    });
    expect(cell.speciesFit).not.toBeNull();
    expect(cell.habitat).not.toBeNull();
    // gran matches kantarell → habitat fit must BOOST the score (>1, centered on 1.0)
    expect(cell.habitatFit).toBeGreaterThan(1);
    expect(cell.score).toBeGreaterThan(30);
  });

  it('penalizes a habitat mismatch (fit < 1) but rewards a match (fit > 1)', () => {
    const base = { lat: 60, lon: 10.7, month: 8, weather: GOOD_WEATHER, forest: GRAN_FOREST };
    const match = computeCellPrediction({
      ...base,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT // likes gran → match
    });
    const mismatch = computeCellPrediction({
      ...base,
      species: KANTARELL,
      speciesHabitat: { preferredPartners: ['eik', 'bok'], habitat: ['lauvskog'] } // deciduous-only in gran forest → mismatch
    });
    expect(match.habitatFit).toBeGreaterThan(1);
    expect(mismatch.habitatFit).toBeLessThan(1);
    expect(match.score).toBeGreaterThan(mismatch.score);
  });

  it('collapses the score out of season', () => {
    const inSeason = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8,
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT
    });
    const outOfSeason = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 2, // February — kantarell out of season
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT
    });
    expect(outOfSeason.speciesFit).toBeCloseTo(0.05, 2);
    expect(outOfSeason.score).toBeLessThan(inSeason.score);
  });

  it('skips species/habitat fit for a generic (no species) prediction', () => {
    const cell = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8,
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: null,
      speciesHabitat: null
    });
    expect(cell.speciesFit).toBeNull();
    expect(cell.habitat).toBeNull();
    expect(cell.habitatFit).toBe(1);
    expect(cell.score).toBe(cell.baseScore);
  });

  it('uses neutral spatial factors when no real forest/elevation data exists', () => {
    const cell = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8,
      weather: GOOD_WEATHER,
      forest: null,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT
    });
    // No forest → habitat fit neutral (1), score still computed from climate.
    expect(cell.habitatFit).toBe(1);
    expect(cell.habitat).toBeNull();
    expect(cell.factors.vegetation).toBe(50);
    expect(cell.factors.soil).toBe(50);
    expect(cell.factors.terrain).toBe(50);
  });

  it('keeps historical occurrence density informational instead of boosting the score', () => {
    const baseline = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8,
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT,
      nearbyOccurrences: 0
    });
    const occurrenceHeavy = computeCellPrediction({
      lat: 60,
      lon: 10.7,
      month: 8,
      weather: GOOD_WEATHER,
      forest: GRAN_FOREST,
      species: KANTARELL,
      speciesHabitat: KANTARELL_HABITAT,
      nearbyOccurrences: 100
    });

    expect(occurrenceHeavy.nearbyOccurrences).toBe(100);
    expect(occurrenceHeavy.occurrenceBoost).toBe(1);
    expect(occurrenceHeavy.score).toBe(baseline.score);
  });
});
