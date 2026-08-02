/**
 * Runtime lookup into the empirical fruiting-phenology curves generated from
 * 315k dated Nordic finds (see scripts/generate-phenology.mjs). Returns a
 * smooth, latitude-aware seasonal weight in [0,1] (peak week = 1) for a
 * species, replacing the hand-coded season_start/end months in scoring.
 *
 * Pure lookup — the heavy bucketing/smoothing happens at build time, so this
 * is cheap enough for the per-cell grid loop.
 */
import { PHENOLOGY, type SpeciesPhenology } from './phenology-data';

const WEEKS = 52;
// Cumulative days before the start of each month (non-leap; good enough for weeks).
const CUM_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

// Must match scripts/phenology-core.mjs latBand().
function bandKey(lat: number): 'south' | 'central' | 'north' {
  if (lat < 61) return 'south';
  if (lat < 64) return 'central';
  return 'north';
}

function weekIndex(dayOfYear: number): number {
  return Math.max(0, Math.min(WEEKS - 1, Math.floor((dayOfYear - 1) / 7)));
}

/**
 * Første og siste dag i året kurvene faktisk er bygget på.
 *
 * Generatoren (scripts/phenology-core.mjs, FRUITING_MONTH_MIN/MAX) kaster ALLE
 * observasjoner utenfor april–november før kurvene bygges. Filteret er der av
 * en god grunn — GBIF-poster med bare årstall får sentineldatoen 01-01 og laget
 * en kunstig januartopp — men det gjør at hver eneste kurve i
 * phenology-data.ts har en HARDKODET null i januar og februar og nesten null i
 * desember. Det er fravær av data, ikke en måling av at ingenting vokser.
 *
 * For høstartene spiller det ingen rolle. For vinterartene er det direkte feil:
 * vintersopp (vindu 10–12, topp 11–12), judasøre (vindu 1–12) og blåtutt
 * (vindu 9–12) er hele grunnen til å åpne appen i desember, og kurven ga dem
 * ~0 nettopp da. Med seasonality ≈ 0 kollapser computeSpeciesAdjustment til
 * ~0,05 — altså «finnes ikke her» — mens artssiden og kalenderen i samme app
 * sier topp-sesong.
 *
 * Vi returnerer derfor null utenfor vinduet kurven er bygget på. Null betyr
 * «ingen empirisk kurve for denne datoen», og kallstedene faller da tilbake på
 * det håndsatte månedsvinduet fra artskatalogen — som er riktig for både
 * vintersopp (i sesong) og kantarell (ute av sesong, 0,05 som før).
 *
 * Fjern gaten først når phenology-data.ts er regenerert med et presist
 * sentinelfilter (dropp observed_at som slutter på -01-01) i stedet for fire
 * hele måneder — og backtest kjørt på nytt.
 */
const CURVE_FIRST_DOY = CUM_DAYS[3] + 1; // 1. april
const CURVE_LAST_DOY = CUM_DAYS[11]; // 30. november

/** Mid-month day-of-year, for callers that only know the month (1-12). */
export function dayOfYearFromMonth(month: number): number {
  const m = Math.max(1, Math.min(12, Math.round(month)));
  return CUM_DAYS[m - 1] + 15;
}

/** Day-of-year (1-366) for a Date. */
export function dayOfYearOf(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000) + 1;
}

/**
 * Empirical seasonal weight 0..1 (peak week = 1) for a species at a latitude
 * and day-of-year. Uses the latitude-band curve when present, else the
 * species' all-Nordic curve. Returns null when we have no curve for this
 * species OR for this date (see CURVE_FIRST_DOY) — the caller then keeps the
 * hand-coded month logic.
 */
export function phenologyFactor(
  speciesId: number | null | undefined,
  lat: number,
  dayOfYear: number
): number | null {
  if (speciesId == null) return null;
  // Desember–mars er ikke målt, bare filtrert bort. Se kommentaren over.
  if (dayOfYear < CURVE_FIRST_DOY || dayOfYear > CURVE_LAST_DOY) return null;
  const entry: SpeciesPhenology | undefined = PHENOLOGY[String(speciesId)];
  if (!entry) return null;
  const curve = entry[bandKey(lat)] ?? entry.all;
  if (!curve || curve.length !== WEEKS) return null;
  const value = curve[weekIndex(dayOfYear)];
  return typeof value === 'number' ? value : null;
}
