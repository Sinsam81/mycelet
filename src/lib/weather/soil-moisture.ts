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

/**
 * Ett døgn videre med den samme bøtta: dagens indeks, pluss nedbøren som faller
 * det døgnet, minus fordampningen ved det døgnets temperatur.
 *
 * Dette er nøyaktig samme regnestykke som løkka over — bare fortsatt fra en
 * indeks vi allerede har, i stedet for kjørt om igjen på hele historikken. Det
 * er det som gjør at en prognosedag kan bedømmes på SAMME fuktmålestokk som
 * dag 0: dag 1 er per definisjon dag 0 flyttet ett steg. Å regne historikken om
 * igjen ville brukt én temperatur for hele serien, og dermed kunne gitt et
 * sprang mellom dag 0 og dag 1 uten at været beveget seg.
 *
 * Returnerer null når vi ikke har noen indeks å gå videre fra (leverandøren har
 * ingen døgnnedbør) — da skal fuktsignalet være like fraværende fremover som i
 * dag, ikke gjettet.
 */
export function advanceSoilMoistureIndex(
  index: number | null,
  precipMm: number,
  meanTempC: number,
  capacityMm: number = SOIL_CAPACITY_MM
): number | null {
  if (index == null || !Number.isFinite(index)) return null;
  const et = evapotranspirationMmPerDay(Number.isFinite(meanTempC) ? meanTempC : 0);
  const rain = Number.isFinite(precipMm) && precipMm > 0 ? precipMm : 0;
  const soil = Math.max(0, Math.min(capacityMm, index * capacityMm + rain - et));
  return Math.round((soil / capacityMm) * 1000) / 1000;
}
