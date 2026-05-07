import { describe, expect, it } from 'vitest';
import { buildExplanation, type SpeciesExplanationContext } from '../prediction-explanation';

const KANTARELL: SpeciesExplanationContext = {
  norwegianName: 'Kantarell',
  latinName: 'Cantharellus cibarius',
  genus: 'Cantharellus',
  seasonStart: 7,
  seasonEnd: 9,
  peakSeasonStart: 8,
  peakSeasonEnd: 9,
  habitat: ['barskog', 'mose'],
  mycorrhizalPartners: ['gran', 'furu', 'bjørk']
};

const PIGGSOPP: SpeciesExplanationContext = {
  norwegianName: 'Piggsopp',
  latinName: 'Hydnum repandum',
  genus: 'Hydnum',
  seasonStart: 9,
  seasonEnd: 11,
  peakSeasonStart: 10,
  peakSeasonEnd: 11,
  habitat: ['granskog', 'kalkrik'],
  mycorrhizalPartners: ['gran', 'eik']
};

const PERFECT_KANTARELL_WEATHER = {
  temperatureC: 16,
  humidityPct: 85,
  rain3dMm: 6,
  rain7dMm: 12,
  rain14dMm: 22,
  minTemp7dC: 9,
  maxTemp7dC: 20
};

const DRY_HOT = {
  temperatureC: 28,
  humidityPct: 35,
  rain3dMm: 0,
  rain7dMm: 0.5,
  rain14dMm: 1,
  minTemp7dC: 18,
  maxTemp7dC: 32
};

describe('buildExplanation — season gating', () => {
  it('flags out-of-season as negative with sesong-window', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 2, // February
      weather: PERFECT_KANTARELL_WEATHER
    });
    const seasonLine = lines.find((l) => l.category === 'season');
    expect(seasonLine?.level).toBe('negative');
    expect(seasonLine?.text).toContain('utenfor sesong');
    expect(seasonLine?.text).toContain('juli');
    expect(seasonLine?.text).toContain('september');
  });

  it('flags peak season as positive', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8, // peak (Aug-Sep)
      weather: PERFECT_KANTARELL_WEATHER
    });
    const seasonLine = lines.find((l) => l.category === 'season');
    expect(seasonLine?.level).toBe('positive');
    expect(seasonLine?.text.toLowerCase()).toContain('topp-sesong');
  });

  it('flags shoulder season as neutral', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 7, // shoulder (Jul, before peak)
      weather: PERFECT_KANTARELL_WEATHER
    });
    const seasonLine = lines.find((l) => l.category === 'season');
    expect(seasonLine?.level).toBe('neutral');
    expect(seasonLine?.text).toContain('sesong');
  });
});

describe('buildExplanation — temperature fit by genus', () => {
  it('reports positive when in genus optimum window', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER // 16°C, kantarell optimum 12-20
    });
    const tempLine = lines.find((l) => l.category === 'temperature');
    expect(tempLine?.level).toBe('positive');
    expect(tempLine?.text).toContain('16°C');
  });

  it('reports negative when outside tolerance ceiling', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: DRY_HOT // 28°C, kantarell ceiling 26
    });
    const tempLine = lines.find((l) => l.category === 'temperature');
    expect(tempLine?.level).toBe('negative');
    expect(tempLine?.text).toContain('28°C');
  });

  it('rates piggsopp differently from kantarell at the same cool temperature', () => {
    // 7°C: piggsopp optimum (6-15), kantarell sub-optimal but tolerable
    const cool = { ...PERFECT_KANTARELL_WEATHER, temperatureC: 7 };
    const piggLines = buildExplanation({ species: PIGGSOPP, month: 10, weather: cool });
    const kantLines = buildExplanation({ species: KANTARELL, month: 8, weather: cool });

    const piggTemp = piggLines.find((l) => l.category === 'temperature');
    const kantTemp = kantLines.find((l) => l.category === 'temperature');

    // Piggsopp tolerates 6°C → should still be positive or neutral, not negative
    expect(['positive', 'neutral']).toContain(piggTemp?.level);
    // Kantarell at 7°C is below optimum but within tolerance (floor 5)
    expect(['neutral']).toContain(kantTemp?.level);
  });
});

describe('buildExplanation — rain windows', () => {
  it('prefers 14d window when available', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER // rain14dMm = 22
    });
    const rainLine = lines.find((l) => l.category === 'rain');
    expect(rainLine?.text).toContain('14 dager');
    expect(rainLine?.text).toContain('22mm');
  });

  it('falls back to 7d when 14d missing', () => {
    const w = { ...PERFECT_KANTARELL_WEATHER, rain14dMm: null };
    const lines = buildExplanation({ species: KANTARELL, month: 8, weather: w });
    const rainLine = lines.find((l) => l.category === 'rain');
    expect(rainLine?.text).toContain('7 dager');
  });

  it('flags drought as negative', () => {
    const lines = buildExplanation({ species: KANTARELL, month: 8, weather: DRY_HOT });
    const rainLine = lines.find((l) => l.category === 'rain');
    expect(rainLine?.level).toBe('negative');
    expect(rainLine?.text.toLowerCase()).toContain('tørt');
  });
});

describe('buildExplanation — generic fallback (no species)', () => {
  it('emits a generic season line when no species context', () => {
    const lines = buildExplanation({ month: 9, weather: PERFECT_KANTARELL_WEATHER });
    const seasonLine = lines.find((l) => l.category === 'season');
    expect(seasonLine?.text.toLowerCase()).toContain('sesong');
    // Contains no specific species name
    expect(seasonLine?.text.toLowerCase()).not.toContain('kantarell');
  });

  it('emits all main categories without species', () => {
    const lines = buildExplanation({ month: 9, weather: PERFECT_KANTARELL_WEATHER });
    const categories = lines.map((l) => l.category);
    expect(categories).toContain('season');
    expect(categories).toContain('temperature');
    expect(categories).toContain('rain');
    expect(categories).toContain('humidity');
    // habitat / mycorrhizal omitted without species — that's intentional
    expect(categories).not.toContain('habitat');
    expect(categories).not.toContain('mycorrhizal');
  });
});

describe('buildExplanation — habitat + mycorrhizal lines', () => {
  it('includes habitat line when species has habitat tags', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER
    });
    const habitatLine = lines.find((l) => l.category === 'habitat');
    expect(habitatLine).toBeDefined();
    expect(habitatLine?.text).toContain('barskog');
  });

  it('includes mycorrhizal line listing partners', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER
    });
    const mycLine = lines.find((l) => l.category === 'mycorrhizal');
    expect(mycLine).toBeDefined();
    expect(mycLine?.text).toContain('gran');
    expect(mycLine?.text).toContain('furu');
  });
});

describe('buildExplanation — output ordering', () => {
  it('emits season as the first line (highest signal)', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER
    });
    expect(lines[0]?.category).toBe('season');
  });

  it('returns at least 4 lines for species + full weather', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER
    });
    // season + temp + rain + humidity + habitat + mycorrhizal = 6
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });
});
