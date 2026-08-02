/**
 * Fuses Kindwise photo-ID suggestions with the app's own season + nearby-find
 * data. Pure functions only — DB I/O lives in the identify route.
 *
 * SAFETY: local context may re-rank PLAUSIBLE matches (e.g. a chanterelle guess
 * in December sinks below an in-season option), but it must NEVER bury a
 * poisonous match. Two guarantees in rankOrder():
 *   1. local context can only ever BOOST a toxic/deadly suggestion, never reduce it
 *   2. a toxic/deadly suggestion never ends up ranked lower than the photo-ID
 *      model originally placed it
 */

import { baseSeasonMask, isMonthInMask, nextMonth, peakMask, previousMonth } from './season-region';

const DANGEROUS = new Set(['toxic', 'deadly']);

/** True if `month` (1-12) falls within [start, end], handling year-end wrap. */
export function monthInWindow(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export interface SeasonFit {
  inSeason: boolean;
  peakSeason: boolean;
  factor: number;
}

/**
 * Season multiplier + flags for a raw [start, end] window. Unknown season = neutral.
 *
 * Bruk `seasonFitForSpecies` for arter som finnes i katalogen — det rå
 * katalogvinduet er systematisk for smalt, og gir «Utenom sesong» på korrekte
 * forslag. Denne beholdes som primitiv for arter uten id (utenfor katalogen).
 */
export function seasonFit(
  month: number,
  seasonStart: number | null | undefined,
  seasonEnd: number | null | undefined,
  peakStart: number | null | undefined,
  peakEnd: number | null | undefined
): SeasonFit {
  if (seasonStart == null || seasonEnd == null) {
    return { inSeason: true, peakSeason: false, factor: 1 };
  }
  const peakSeason =
    peakStart != null && peakEnd != null ? monthInWindow(month, peakStart, peakEnd) : false;
  if (peakSeason) return { inSeason: true, peakSeason: true, factor: 1.25 };
  if (monthInWindow(month, seasonStart, seasonEnd)) {
    return { inSeason: true, peakSeason: false, factor: 1.0 };
  }
  // A month directly adjacent to the season window gets a milder penalty.
  const nextMonth = (month % 12) + 1;
  const prevMonth = ((month + 10) % 12) + 1;
  const shoulder =
    monthInWindow(nextMonth, seasonStart, seasonEnd) || monthInWindow(prevMonth, seasonStart, seasonEnd);
  return { inSeason: false, peakSeason: false, factor: shoulder ? 0.7 : 0.45 };
}

/** Det ruta har om arten når den skal avgjøre sesongtilpasningen. */
export interface SeasonFitSpecies {
  id: number;
  edibility: string | null | undefined;
  season_start: number | null | undefined;
  season_end: number | null | undefined;
  peak_season_start: number | null | undefined;
  peak_season_end: number | null | undefined;
}

/** Samme trapp som `seasonFit`, men mot månedsmasker i stedet for et intervall. */
function maskFit(month: number, seasonWindow: number, peakWindow: number): SeasonFit {
  if (isMonthInMask(peakWindow, month)) return { inSeason: true, peakSeason: true, factor: 1.25 };
  if (isMonthInMask(seasonWindow, month)) return { inSeason: true, peakSeason: false, factor: 1.0 };
  const shoulder =
    isMonthInMask(seasonWindow, nextMonth(month)) || isMonthInMask(seasonWindow, previousMonth(month));
  return { inSeason: false, peakSeason: false, factor: shoulder ? 0.7 : 0.45 };
}

/**
 * Sesongtilpasning for en art i katalogen — SAMME vindu som kalenderen,
 * artsbiblioteket og «i sesong nå» bruker (`baseSeasonMask`).
 *
 * Hvorfor ikke bare `seasonFit` på season_start/season_end: de håndsatte
 * katalogvinduene er systematisk for smale. Piggsopp står med sep–nov, men
 * 1219 av 4305 daterte funn er gjort i august. Med det rå vinduet fikk et
 * KORREKT forslag i august pilla «Utenom sesong» og ×0,7 i rangering — appen
 * fortalte altså brukeren at riktig svar ikke kunne stemme, på en flate som
 * finnes for å gjøre folk mer treffsikre. `baseSeasonMask` tar unionen av det
 * kuraterte vinduet og det empiriske, så vinduet blir aldri smalere enn før.
 *
 * Merk at dette er BASE-masken, uten breddegradsjustering: ruta vet bare hvor
 * bildet er tatt når brukeren har delt posisjon, og et sesongvindu som endrer
 * seg med posisjonen ville gjort pilla umulig å forstå.
 */
export function seasonFitForSpecies(month: number, species: SeasonFitSpecies): SeasonFit {
  if (species.season_start == null || species.season_end == null) {
    return { inSeason: true, peakSeason: false, factor: 1 };
  }
  const seasonWindow = baseSeasonMask({
    id: species.id,
    edibility: species.edibility,
    season_start: species.season_start,
    season_end: species.season_end
  });
  return maskFit(
    month,
    seasonWindow,
    peakMask({
      peak_season_start: species.peak_season_start ?? null,
      peak_season_end: species.peak_season_end ?? null
    })
  );
}

/** Mild boost from recent nearby findings of the same species (capped at +30%). */
export function nearbyBoost(nearbyFindings: number): number {
  return 1 + Math.min(Math.max(nearbyFindings, 0), 5) * 0.06;
}

export interface RankableSuggestion {
  probability: number;
  edibility: string;
  seasonFactor: number;
  nearbyFindings: number;
}

/**
 * Returns the original indices in their new display order. Safe by construction
 * (see file header). Operates on the photo-ID order (already probability-sorted).
 */
export function rankOrder(suggestions: RankableSuggestion[]): number[] {
  const meta = suggestions.map((s, originalIndex) => {
    const raw = s.seasonFactor * nearbyBoost(s.nearbyFindings);
    const factor = DANGEROUS.has(s.edibility) ? Math.max(raw, 1) : raw;
    return { originalIndex, score: s.probability * factor, dangerous: DANGEROUS.has(s.edibility) };
  });

  const order = [...meta].sort((a, b) => b.score - a.score).map((m) => m.originalIndex);

  // Safety pass: never let a dangerous suggestion sink below where the model put it.
  for (const m of meta) {
    if (!m.dangerous) continue;
    const newIdx = order.indexOf(m.originalIndex);
    if (newIdx > m.originalIndex) {
      order.splice(newIdx, 1);
      order.splice(m.originalIndex, 0, m.originalIndex);
    }
  }
  return order;
}
