/**
 * Build human-readable Norwegian explanations for a prediction result.
 *
 * The "alltid forklar hvorfor"-prinsippet from docs/roadmap.md says every
 * highlighted area on the map should answer the question "hvorfor er dette
 * markert?" — which protects us when the prediction is wrong (the user can
 * see we're guessing based on data, not magic) and builds trust when it's
 * right.
 *
 * This module is the pure-logic half of that. It takes a prediction
 * response + species context + current month, returns an ordered list of
 * tagged sentences. The companion component PredictionExplanation renders
 * them; tests live next door.
 *
 * Design decisions:
 *   - Tag each line as 'positive' / 'neutral' / 'negative' so the renderer
 *     can color-code without re-parsing the text.
 *   - Group by category so a UI could show only "weather" or only
 *     "season" sections if it wants.
 *   - Norwegian copy throughout — these strings ARE the user-facing
 *     explanations, not internal telemetry.
 *   - When no species context is provided (general "is it mushroom
 *     weather?" call), fall back to generic advice using the same data.
 */

import { resolveSpeciesPreferences, type SpeciesContext } from '@/lib/utils/species-scoring';

export type ExplanationLevel = 'positive' | 'neutral' | 'negative';

export type ExplanationCategory = 'season' | 'temperature' | 'rain' | 'humidity' | 'habitat' | 'mycorrhizal' | 'occurrence';

export interface Explanation {
  level: ExplanationLevel;
  category: ExplanationCategory;
  text: string;
}

export interface SpeciesExplanationContext {
  norwegianName: string;
  latinName: string;
  genus: string | null;
  seasonStart: number; // 1-12
  seasonEnd: number;
  peakSeasonStart: number | null;
  peakSeasonEnd: number | null;
  habitat: string[] | null;
  mycorrhizalPartners: string[] | null;
}

/**
 * Local weather shape for the explanation logic. Decoupled from
 * WeatherSummary so callers can pass values from anywhere — the prediction
 * route's response, a manual input form, etc. — without forcing an exact
 * provider-shape match.
 */
export interface ExplanationWeather {
  temperatureC: number;
  humidityPct: number;
  rain3dMm: number;
  rain7dMm?: number | null;
  rain14dMm?: number | null;
  minTemp7dC?: number | null;
  maxTemp7dC?: number | null;
}

/**
 * Real forest data at the queried point (NIBIO SR16). When present, it
 * supersedes the species' generic "preferred habitat" line with what's
 * actually on the ground — and the server-computed habitat reasons.
 */
export interface ExplanationForest {
  forestType: string;
  productivity: number | null;
  volumePerHa: number | null;
  /** Habitat-fit multiplier [0.2, 1.3] from computeHabitatScore. */
  habitatScore: number | null;
  /** Server-built Norwegian reasons (tree-species match, soil richness). */
  habitatReasons: string[];
  /** Data provider: 'sr16' (NO/NIBIO), 'corine' (SE/Europe). Drives the credit label. */
  source?: string;
}

export interface ExplanationInput {
  weather: ExplanationWeather;
  /** Optional: when set, explanation is species-specific. */
  species?: SpeciesExplanationContext;
  /** Optional real forest data at the point (NIBIO). Supersedes generic habitat. */
  forest?: ExplanationForest | null;
  /** Count of real prior finds (GBIF/Artsdatabanken) near the point. */
  nearbyOccurrences?: number;
  /** Current month (1-12). Pass `new Date().getMonth() + 1`. */
  month: number;
}

const MONTH_NAMES_GENITIVE = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember'
];

function monthName(month: number): string {
  return MONTH_NAMES_GENITIVE[Math.max(1, Math.min(12, month)) - 1];
}

function inMonth(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

const FOREST_TYPE_LABEL: Record<string, string> = {
  gran: 'granskog',
  furu: 'furuskog',
  bar: 'barskog',
  lauv: 'løvskog',
  blandet: 'blandingsskog',
  apent: 'åpent landskap'
};

function forestLabel(forestType: string): string {
  return FOREST_TYPE_LABEL[forestType] ?? 'skog';
}

/** Credit the right data source in the habitat line. CORINE for Sweden/Europe,
 *  NIBIO otherwise (Norway / unspecified — preserves the original label). */
function forestSourceLabel(source: string | undefined): string {
  return source === 'corine' ? 'CORINE' : 'NIBIO';
}

/** Map the habitat-fit multiplier to a color level for the UI. */
function habitatLevel(score: number | null): ExplanationLevel {
  if (score == null) return 'neutral';
  if (score >= 0.85) return 'positive';
  if (score <= 0.45) return 'negative';
  return 'neutral';
}

function pickRain(weather: ExplanationInput['weather']): { mm: number; window: string } {
  // Prefer the longest window we have data for; mushroom prediction cares
  // most about cumulative rainfall across 1-2 weeks, not the last 3 days.
  if (weather.rain14dMm != null) return { mm: weather.rain14dMm, window: '14 dager' };
  if (weather.rain7dMm != null) return { mm: weather.rain7dMm, window: '7 dager' };
  return { mm: weather.rain3dMm, window: '3 dager' };
}

/**
 * Build the explanation. Returns lines ordered by importance — season
 * first (it's the strongest gate), then weather (temp, rain, humidity),
 * then habitat / mycorrhizal hints when species context is available.
 */
export function buildExplanation(input: ExplanationInput): Explanation[] {
  const lines: Explanation[] = [];

  // ── Season ──────────────────────────────────────────────────────────
  if (input.species) {
    const { species } = input;
    const inSeason = inMonth(input.month, species.seasonStart, species.seasonEnd);
    const inPeak =
      species.peakSeasonStart != null &&
      species.peakSeasonEnd != null &&
      inMonth(input.month, species.peakSeasonStart, species.peakSeasonEnd);

    if (!inSeason) {
      lines.push({
        level: 'negative',
        category: 'season',
        text: `${species.norwegianName} er utenfor sesong nå (sesong: ${monthName(species.seasonStart)}–${monthName(species.seasonEnd)})`
      });
    } else if (inPeak) {
      lines.push({
        level: 'positive',
        category: 'season',
        text: `Topp-sesong for ${species.norwegianName.toLowerCase()} (${monthName(species.peakSeasonStart!)}–${monthName(species.peakSeasonEnd!)})`
      });
    } else {
      lines.push({
        level: 'neutral',
        category: 'season',
        text: `${species.norwegianName} er i sesong, men ikke topp-sesong`
      });
    }
  } else {
    // Generic mushroom-season heuristic
    const month = input.month;
    if (month >= 8 && month <= 10) {
      lines.push({ level: 'positive', category: 'season', text: 'Hovedsesong for sopp i Norge' });
    } else if (month === 7 || month === 11) {
      lines.push({ level: 'neutral', category: 'season', text: 'Tidlig/sen sesong — variert utvalg' });
    } else {
      lines.push({ level: 'negative', category: 'season', text: 'Lav sesong for de fleste arter' });
    }
  }

  // ── Prior finds nearby (GBIF / Artsdatabanken) ──────────────────────
  // Our strongest validated signal — real registered finds in the area.
  if (input.nearbyOccurrences && input.nearbyOccurrences > 0) {
    lines.push({
      level: 'positive',
      category: 'occurrence',
      text: `${input.nearbyOccurrences} tidligere funn registrert i nærheten (Artsdatabanken/GBIF)`
    });
  }

  // ── Temperature ─────────────────────────────────────────────────────
  const temp = input.weather.temperatureC;
  if (input.species?.genus) {
    // Pass through SpeciesContext shape so species-level overrides (e.g.
    // svart trompetsopp vs traktkantarell) take effect.
    const speciesCtx: SpeciesContext = {
      latinName: input.species.latinName,
      genus: input.species.genus,
      seasonStart: input.species.seasonStart,
      seasonEnd: input.species.seasonEnd,
      peakSeasonStart: input.species.peakSeasonStart,
      peakSeasonEnd: input.species.peakSeasonEnd
    };
    const prefs = resolveSpeciesPreferences(speciesCtx);
    const inOptimum = temp >= prefs.tempCMin && temp <= prefs.tempCMax;
    const inTolerance = temp >= prefs.tempCFloor && temp <= prefs.tempCCeil;
    if (inOptimum) {
      lines.push({
        level: 'positive',
        category: 'temperature',
        text: `${Math.round(temp)}°C — innenfor optimum for ${input.species.norwegianName.toLowerCase()} (${prefs.tempCMin}–${prefs.tempCMax}°C)`
      });
    } else if (inTolerance) {
      lines.push({
        level: 'neutral',
        category: 'temperature',
        text: `${Math.round(temp)}°C — innenfor toleranse, men ikke optimum (${prefs.tempCMin}–${prefs.tempCMax}°C)`
      });
    } else {
      lines.push({
        level: 'negative',
        category: 'temperature',
        text: `${Math.round(temp)}°C — utenfor toleranse-vindu (${prefs.tempCFloor}–${prefs.tempCCeil}°C)`
      });
    }
  } else {
    if (temp >= 10 && temp <= 18) {
      lines.push({ level: 'positive', category: 'temperature', text: `${Math.round(temp)}°C — gunstig sopp-temperatur` });
    } else if (temp >= 5 && temp <= 22) {
      lines.push({ level: 'neutral', category: 'temperature', text: `${Math.round(temp)}°C — moderat for sopp` });
    } else {
      lines.push({ level: 'negative', category: 'temperature', text: `${Math.round(temp)}°C — for kaldt eller for varmt` });
    }
  }

  // ── Rain (cumulative window) ────────────────────────────────────────
  const rain = pickRain(input.weather);
  const optMm = input.species
    ? resolveSpeciesPreferences({
        latinName: input.species.latinName,
        genus: input.species.genus,
        seasonStart: input.species.seasonStart,
        seasonEnd: input.species.seasonEnd,
        peakSeasonStart: input.species.peakSeasonStart,
        peakSeasonEnd: input.species.peakSeasonEnd
      }).rainOptMm
    : 6;
  if (rain.mm >= optMm * 1.5) {
    lines.push({ level: 'positive', category: 'rain', text: `${Math.round(rain.mm)}mm regn siste ${rain.window} — godt fuktet` });
  } else if (rain.mm >= optMm) {
    lines.push({
      level: 'positive',
      category: 'rain',
      text: `${Math.round(rain.mm)}mm regn siste ${rain.window} — over optimum`
    });
  } else if (rain.mm >= optMm * 0.5) {
    lines.push({
      level: 'neutral',
      category: 'rain',
      text: `${Math.round(rain.mm)}mm regn siste ${rain.window} — under optimum`
    });
  } else {
    lines.push({
      level: 'negative',
      category: 'rain',
      text: `Bare ${Math.round(rain.mm)}mm regn siste ${rain.window} — for tørt`
    });
  }

  // ── Humidity ────────────────────────────────────────────────────────
  const hum = input.weather.humidityPct;
  if (hum >= 80) {
    lines.push({ level: 'positive', category: 'humidity', text: `${Math.round(hum)}% luftfuktighet — høyt` });
  } else if (hum >= 60) {
    lines.push({ level: 'neutral', category: 'humidity', text: `${Math.round(hum)}% luftfuktighet — moderat` });
  } else {
    lines.push({ level: 'negative', category: 'humidity', text: `${Math.round(hum)}% luftfuktighet — tørt` });
  }

  // ── Habitat ──────────────────────────────────────────────────────────
  // Prefer the REAL forest at the point (NIBIO) over the species' generic
  // preferred-habitat tags. The server already computed the match reasons;
  // we tag them by the overall habitat fit so the UI can color-code.
  if (input.forest) {
    const f = input.forest;
    const level = habitatLevel(f.habitatScore);
    const bonitetPart = f.productivity != null ? `, bonitet ${f.productivity}` : '';
    lines.push({
      level: 'neutral',
      category: 'habitat',
      text: `Skog her (${forestSourceLabel(f.source)}): ${forestLabel(f.forestType)}${bonitetPart}`
    });
    for (const reason of f.habitatReasons) {
      lines.push({ level, category: 'habitat', text: reason });
    }
  } else if (input.species?.habitat && input.species.habitat.length > 0) {
    lines.push({
      level: 'neutral',
      category: 'habitat',
      text: `Foretrukket habitat: ${input.species.habitat.join(', ')}`
    });
  }

  // ── Mycorrhizal partners ────────────────────────────────────────────
  if (input.species?.mycorrhizalPartners && input.species.mycorrhizalPartners.length > 0) {
    lines.push({
      level: 'neutral',
      category: 'mycorrhizal',
      text: `Følger ${input.species.mycorrhizalPartners.join('/')}`
    });
  }

  return lines;
}
