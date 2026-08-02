import { describe, expect, it } from 'vitest';
import {
  buildExplanation,
  buildSpotSummary,
  type ExplanationWeather,
  type SpeciesExplanationContext
} from '../prediction-explanation';

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

describe('buildExplanation — historical occurrences', () => {
  it('shows recurrence as neutral provenance rather than positive evidence', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      nearbyOccurrences: 2.437
    });
    const occurrence = lines.find((line) => line.category === 'occurrence');

    expect(occurrence?.level).toBe('neutral');
    // Framed as a hint, explicitly caveated with the accessibility-bias reason —
    // not "evidence of presence".
    expect(occurrence?.text).toContain('registrert funn i nærheten');
    expect(occurrence?.text.toLowerCase()).toContain('hint');
    expect(occurrence?.text).not.toContain('2.437');
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

describe('buildExplanation — real forest data (NIBIO)', () => {
  it('surfaces actual forest type + bonitet and supersedes the generic habitat line', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: {
        forestType: 'furu',
        productivity: 8,
        volumePerHa: 65,
        habitatScore: 0.9,
        habitatReasons: ['Treslag (furu) matcher artens partnere.']
      }
    });
    const habitatLines = lines.filter((l) => l.category === 'habitat');
    expect(habitatLines.some((l) => l.text.includes('furuskog'))).toBe(true);
    expect(habitatLines.some((l) => l.text.includes('bonitet 8'))).toBe(true);
    expect(habitatLines.some((l) => l.text.includes('matcher artens partnere'))).toBe(true);
    // Generic "Foretrukket habitat" must NOT appear when real forest is present.
    expect(habitatLines.some((l) => l.text.includes('Foretrukket habitat'))).toBe(false);
  });

  it('tags a strong habitat match as positive', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: {
        forestType: 'furu',
        productivity: 8,
        volumePerHa: 65,
        habitatScore: 0.9,
        habitatReasons: ['Treslag (furu) matcher artens partnere.']
      }
    });
    const reason = lines.find((l) => l.category === 'habitat' && l.text.includes('matcher'));
    expect(reason?.level).toBe('positive');
  });

  it('tags a poor habitat match as negative', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: {
        forestType: 'apent',
        productivity: null,
        volumePerHa: null,
        habitatScore: 0.3,
        habitatReasons: ['Åpent landskap — sopp-arten foretrekker skog.']
      }
    });
    const reason = lines.find((l) => l.category === 'habitat' && l.text.includes('Åpent'));
    expect(reason?.level).toBe('negative');
  });

  it('credits CORINE and labels barskog for a Swedish coniferous point', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: {
        forestType: 'bar',
        productivity: null,
        volumePerHa: null,
        habitatScore: 0.8,
        habitatReasons: ['Barskog matcher artens bartre-partnere (eksakt treslag ukjent i CORINE).'],
        source: 'corine'
      }
    });
    const head = lines.find((l) => l.category === 'habitat' && l.text.startsWith('Skog her'));
    expect(head?.text).toContain('(CORINE)');
    expect(head?.text).toContain('barskog');
    expect(head?.text).not.toContain('NIBIO');
  });
});

/**
 * Flisebanen i /api/prediction leverer skogdata fra nærmeste rute i rasteret,
 * og rutene ligger ~7 km fra hverandre. «Skog her» var derfor usant hver gang
 * tallet kom derfra — et konkret tilfelle var «granskog, bonitet 20» om en
 * skog 15,5 km unna. Avstanden skal stå i setningen, ikke underforstås.
 */
describe('buildExplanation — avstand til skogdataene', () => {
  const FJERN_SKOG = {
    forestType: 'gran',
    productivity: 20,
    volumePerHa: 428,
    habitatScore: 0.9,
    habitatReasons: [],
    source: 'sr16'
  };

  it('sier ikke «her» når dataene er hentet 15,5 km unna', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: { ...FJERN_SKOG, distanceKm: 15.5 }
    });
    const head = lines.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(head?.text).not.toContain('Skog her');
    expect(head?.text).toBe('Nærmeste skogdata (NIBIO, 15,5 km unna): granskog, bonitet 20');
  });

  it('beholder «Skog her» når oppslaget faktisk er gjort i punktet', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: { ...FJERN_SKOG, distanceKm: null }
    });
    const head = lines.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(head?.text).toBe('Skog her (NIBIO): granskog, bonitet 20');
  });

  it('skriver korte avstander i meter, aldri som «0 m»', () => {
    const lines = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: { ...FJERN_SKOG, distanceKm: 0.34 }
    });
    const head = lines.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(head?.text).toContain('300 m unna');

    const naerme = buildExplanation({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: { ...FJERN_SKOG, distanceKm: 0.01 }
    });
    const naermeHead = naerme.find((l) => l.category === 'habitat' && l.text.includes('bonitet'));
    expect(naermeHead?.text).toContain('100 m unna');
    expect(naermeHead?.text).not.toMatch(/\(NIBIO, 0 m unna\)/);
  });

  it('sier det på svensk for svenske lesere', () => {
    const lines = buildExplanation({
      species: { ...KANTARELL, swedishName: 'Kantarell' },
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      forest: { forestType: 'bar', productivity: null, volumePerHa: null, habitatScore: 0.8, habitatReasons: [], source: 'corine', distanceKm: 3.42 },
      locale: 'sv'
    });
    const head = lines.find((l) => l.category === 'habitat');
    expect(head?.text).toBe('Närmaste skogsdata (CORINE, 3,4 km härifrån): barrskog');
    expect(head?.text).not.toContain('Skog här');
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

describe('buildExplanation — language', () => {
  it('renders every generic line in Swedish for a Swedish reader', () => {
    const lines = buildExplanation({ month: 9, weather: PERFECT_KANTARELL_WEATHER, locale: 'sv' });
    const text = lines.map((l) => l.text).join(' | ');
    expect(text).toContain('Högsäsong för svamp');
    // Swedish needs the definite plural after "senaste".
    expect(text).toContain('senaste 14 dagarna');
    expect(text).toContain('luftfuktighet');
    // No Norwegian leftovers
    expect(text).not.toContain('siste');
    expect(text).not.toContain('sopp-temperatur');
  });

  it('names the species in Swedish when a Swedish name exists', () => {
    const lines = buildExplanation({
      species: { ...KANTARELL, norwegianName: 'Steinsopp', swedishName: 'Karljohan' },
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      locale: 'sv'
    });
    const seasonLine = lines.find((l) => l.category === 'season');
    expect(seasonLine?.text.toLowerCase()).toContain('karljohan');
    expect(seasonLine?.text).not.toContain('Steinsopp');
  });

  it('falls back to the Norwegian name when no Swedish name is curated', () => {
    const lines = buildExplanation({
      species: { ...KANTARELL, swedishName: null },
      month: 2,
      weather: PERFECT_KANTARELL_WEATHER,
      locale: 'sv'
    });
    const seasonLine = lines.find((l) => l.category === 'season');
    expect(seasonLine?.text).toContain('Kantarell');
    expect(seasonLine?.text).toContain('utanför säsong');
  });

  it('uses Swedish forest labels and month names', () => {
    const lines = buildExplanation({
      species: { ...KANTARELL, swedishName: 'Kantarell' },
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      locale: 'sv',
      forest: {
        forestType: 'furu',
        productivity: 8,
        volumePerHa: 65,
        habitatScore: 0.9,
        habitatReasons: []
      }
    });
    const text = lines.map((l) => l.text).join(' | ');
    expect(text).toContain('tallskog');
    expect(text).toContain('augusti');
    expect(text).not.toContain('furuskog');
  });

  it('defaults to Norwegian when no locale is given', () => {
    const lines = buildExplanation({ month: 9, weather: PERFECT_KANTARELL_WEATHER });
    expect(lines.map((l) => l.text).join(' | ')).toContain('Hovedsesong for sopp i Norge');
  });
});

describe('buildSpotSummary — language', () => {
  it('renders the verdict in Swedish', () => {
    const summary = buildSpotSummary({
      species: { ...KANTARELL, swedishName: 'Kantarell' },
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      score: 80,
      locale: 'sv'
    });
    expect(summary.verdict).toBe('Mycket goda förhållanden för kantarell nu');
  });

  it('defaults to Norwegian', () => {
    const summary = buildSpotSummary({
      species: KANTARELL,
      month: 8,
      weather: PERFECT_KANTARELL_WEATHER,
      score: 80
    });
    expect(summary.verdict).toBe('Svært gode forhold for kantarell nå');
  });
});

describe('buildExplanation — the rain line must mean the same in every window', () => {
  const weather = (over: Partial<ExplanationWeather>): ExplanationWeather => ({
    ...PERFECT_KANTARELL_WEATHER,
    ...over
  });

  const rainLine = (w: ExplanationWeather) =>
    buildExplanation({ month: 9, weather: w }).find((l) => l.category === 'rain');

  it('calls a 14-day drought dry, not "over optimum"', () => {
    // 6mm over 14 days is 0.4 mm/day. The ground loses ~2.7 mm/day to
    // evapotranspiration at 15 °C, so this is a drought — it used to print a
    // green tick because the 3-day threshold was compared to a 14-day total.
    const line = rainLine(weather({ rain14dMm: 6, rain7dMm: 3, rain3dMm: 0 }));
    expect(line?.level).toBe('negative');
    expect(line?.text.toLowerCase()).toContain('tørt');
  });

  it('still calls a genuinely wet fortnight well watered', () => {
    // 63mm/14d = 4.5 mm/day, comfortably above evapotranspiration.
    const line = rainLine(weather({ rain14dMm: 63, rain7dMm: 30, rain3dMm: 8 }));
    expect(line?.level).toBe('positive');
  });

  it('judges the same rate the same way whichever window carries it', () => {
    // 9mm/3d, 21mm/7d and 42mm/14d are all 3 mm/day and must agree.
    const three = rainLine(weather({ rain14dMm: null, rain7dMm: null, rain3dMm: 9 }));
    const seven = rainLine(weather({ rain14dMm: null, rain7dMm: 21, rain3dMm: 3 }));
    const fourteen = rainLine(weather({ rain14dMm: 42, rain7dMm: 21, rain3dMm: 3 }));
    expect(seven?.level).toBe(three?.level);
    expect(fourteen?.level).toBe(three?.level);
  });

  it('does not announce a fruiting window during a drought', () => {
    // Previously gated on rain14dMm >= 12, so 20mm/14d printed both
    // "godt fuktet" and "gunstig vindu for soppfruktsetting" on dry ground.
    const lines = buildExplanation({ month: 9, weather: weather({ rain14dMm: 20, rain7dMm: 2, rain3dMm: 0 }) });
    expect(lines.some((l) => l.text.includes('fruktsetting'))).toBe(false);
  });
});
