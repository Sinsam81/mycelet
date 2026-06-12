/**
 * Antecedent soil-water-balance index in [0,1] from a daily precipitation
 * series — the moisture variable mushrooms actually respond to.
 *
 * A raw 14-day rain SUM stays high for two weeks after a single old downpour,
 * even through a dry spell. A root-zone bucket model instead ADDS each day's
 * rain and LOSES temperature-driven evapotranspiration, so it decays as the
 * ground dries — which is exactly when fruiting stalls. No new data source:
 * this runs on the daily precip + temp the Frost/SMHI adapters already fetch.
 */

/** Plant-available water in the root zone, mm — rough but defensible. */
export const SOIL_CAPACITY_MM = 50;

/**
 * Crude temperature-driven evapotranspiration, mm/day. ~0 at/below freezing,
 * ~2.7 mm/day at 15 °C, capped at 5. Enough to model drying between rains.
 */
export function evapotranspirationMmPerDay(meanTempC: number): number {
  return Math.max(0, Math.min(5, 0.18 * meanTempC));
}

/**
 * Run the bucket over a daily precip series (oldest → newest). Starts half-full
 * (neutral prior) so a short window doesn't bias wet or dry. Returns null for an
 * empty series so callers fall back to the raw rain signal.
 */
export function computeSoilMoistureIndex(
  dailyPrecipMm: number[],
  meanTempC: number,
  capacityMm: number = SOIL_CAPACITY_MM
): number | null {
  if (!dailyPrecipMm.length) return null;
  const et = evapotranspirationMmPerDay(meanTempC);
  let soil = capacityMm * 0.5;
  for (const p of dailyPrecipMm) {
    const rain = Number.isFinite(p) && p > 0 ? p : 0;
    soil = Math.max(0, Math.min(capacityMm, soil + rain - et));
  }
  return Math.round((soil / capacityMm) * 1000) / 1000;
}
