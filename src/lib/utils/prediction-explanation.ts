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

import type { WeatherSummary } from '@/lib/weather';
import { resolveGenusPreferences } from '@/lib/utils/species-scoring';

export type ExplanationLevel = 'positive' | 'neutral' | 'negative';

export type ExplanationCategory = 'season' | 'temperature' | 'rain' | 'humidity' | 'habitat' | 'mycorrhizal';

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

export interface ExplanationInput {
  /** Snapshot from fetchWeatherSummary — at least temp, humidity, rain3d. */
  weather: Pick<WeatherSummary, 'temperatureC' | 'humidityPct' | 'rain3dMm' | 'rain7dMm' | 'rain14dMm' | 'minTemp7dC' | 'maxTemp7dC'>;
  /** Optional: when set, explanation is species-specific. */
  species?: SpeciesExplanationContext;
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

  // ── Temperature ─────────────────────────────────────────────────────
  const temp = input.weather.temperatureC;
  if (input.species?.genus) {
    const prefs = resolveGenusPreferences(input.species.genus);
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
  const optMm = input.species?.genus ? resolveGenusPreferences(input.species.genus).rainOptMm : 6;
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

  // ── Habitat (when known) ────────────────────────────────────────────
  if (input.species?.habitat && input.species.habitat.length > 0) {
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
