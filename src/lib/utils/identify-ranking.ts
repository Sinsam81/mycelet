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

/** Season multiplier + flags for a species at a given month. Unknown season = neutral. */
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
