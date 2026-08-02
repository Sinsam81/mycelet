/**
 * Sesongvindu per art — hvilke MÅNEDER en art regnes som «i sesong».
 *
 * Vinduet er en månedsmaske (bit 0 = januar … bit 11 = desember) satt sammen av
 * to kilder:
 *   1. det håndsatte katalogvinduet (`season_start`/`season_end`), og
 *   2. det empiriske vinduet i `season-window-data.ts` — de månedene som dekker
 *      90 % av artens daterte funn i basen (325 288 funn, GBIF/Artsdatabanken).
 * Vi tar UNIONEN, så et vindu blir aldri smalere enn det kuraterte. Grunnen er
 * at katalogvinduene er systematisk for smale: målt mot funnene lå 9,0 % av alle
 * daterte funn i måneder appen sa arten ikke var i sesong (piggsopp 37,5 %,
 * vintersopp 54,8 %). Med det empiriske vinduet faller det til ~3 %.
 *
 * REGIONJUSTERING. Den forrige versjonen forskjøv hele vinduet «4 dager senere
 * per breddegrad nord for 60°N», opptil 35 døgn. Den hadde ingen empirisk
 * dekning og ga to feil samtidig i august i Nord-Norge: den DØDELIGE
 * steinmorkelen (vindu apr–jun) fikk sluttkanten dyttet ut i august og ble
 * merket «i sesong nå», mens kantarell og steinsopp fikk startkanten dyttet
 * forbi dagens dato og forsvant fra listen.
 *
 * Funnene sier noe helt annet enn formelen: av 38 arter med nok daterte funn i
 * både sør og nord starter sesongen én måned SENERE i nord for 12 arter,
 * TIDLIGERE for 4 (nordlige høstarter som blåtutt og frostvarsler kommer før,
 * ikke etter) og i samme måned for 22. Aldri 35 døgn, og ikke i samme retning
 * for alle. Formelen er derfor fjernet og erstattet med de faktiske
 * båndvinduene, med to sperrer:
 *
 *   A. Båndet kan bare UTVIDE vinduet, aldri snevre det inn. Ingen art
 *      forsvinner fra «i sesong nå» fordi brukeren slår på posisjon.
 *   B. Farlige arter (giftig, dødelig eller ukjent spiselighet) får ALDRI
 *      regionjustering. En dødelig art skal aldri kunne løftes fram av en
 *      posisjon — den står i listen på samme vindu overalt i Norden.
 *
 * Rent + testbart: ingen datoaritmetikk, ingen I/O.
 */
import { isDangerousEdibility } from './edibility';
import { SEASON_WINDOWS, SEASON_WINDOW_COVERAGE } from './season-window-data';

/** Breddegradsbånd. Samme grenser som prediksjonens fenologikurver. */
export type LatitudeBand = 'south' | 'central' | 'north';

/** Andelen av de daterte funnene vinduene dekker (til UI-tekst). */
export const SEASON_COVERAGE = SEASON_WINDOW_COVERAGE;

/** Det minste en art må ha av felter for å få et sesongvindu. */
export interface SeasonSpecies {
  id: number;
  edibility: string | null | undefined;
  season_start: number;
  season_end: number;
}

export function latitudeBand(latitude: number | null | undefined): LatitudeBand | null {
  if (latitude == null || Number.isNaN(latitude)) return null;
  if (latitude < 61) return 'south';
  if (latitude < 64) return 'central';
  return 'north';
}

function clampMonth(month: number): number {
  return Math.max(1, Math.min(12, Math.round(month)));
}

/**
 * Månedsmaske for et sammenhengende månedsintervall (1-indeksert). Wrapper
 * rundt nyttår, slik at vintersopp (10–3) blir okt–mars og ikke tom.
 */
export function monthMask(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const first = clampMonth(start);
  const last = clampMonth(end);
  let mask = 0;
  let month = first;
  for (let i = 0; i < 12; i++) {
    mask |= 1 << (month - 1);
    if (month === last) break;
    month = month === 12 ? 1 : month + 1;
  }
  return mask;
}

/** Er måneden (1–12) med i masken? */
export function isMonthInMask(mask: number, month: number): boolean {
  if (!Number.isFinite(month)) return false;
  return (mask & (1 << (clampMonth(month) - 1))) !== 0;
}

/** Månedene (1–12) i masken, i stigende rekkefølge. */
export function monthsInMask(mask: number): number[] {
  const months: number[] = [];
  for (let i = 0; i < 12; i++) if (mask & (1 << i)) months.push(i + 1);
  return months;
}

/** Måneden etter `month` (1–12), med wrap over nyttår. */
export function nextMonth(month: number): number {
  const m = clampMonth(month);
  return m === 12 ? 1 : m + 1;
}

/**
 * Vinduet uten regionjustering: katalogvinduet utvidet med det empiriske
 * hele-Norden-vinduet. Dette er vinduet vi viser når vi ikke vet hvor brukeren
 * er — og det eneste vinduet farlige arter noen gang får.
 */
export function baseSeasonMask(species: SeasonSpecies): number {
  const mask = monthMask(species.season_start, species.season_end);
  const empirical = SEASON_WINDOWS[String(species.id)];
  return empirical ? mask | empirical.all : mask;
}

/**
 * Vinduet for en gitt posisjon. Båndet kan bare legge til måneder, og farlige
 * arter får aldri båndjustering i det hele tatt (se sperre A og B øverst).
 */
export function seasonMask(species: SeasonSpecies, band: LatitudeBand | null): number {
  const base = baseSeasonMask(species);
  if (band == null) return base;
  if (isDangerousEdibility(species.edibility)) return base;
  const empirical = SEASON_WINDOWS[String(species.id)];
  const bandMask = empirical?.[band];
  return bandMask ? base | bandMask : base;
}

/**
 * Topp-sesong. Rent katalogdata og aldri regionjustert — «topp-sesong» er en
 * sterkere påstand enn «i sesong», og vi har ikke tall til å flytte den per
 * region. Returnerer 0 når arten mangler toppsesong.
 */
export function peakMask(species: { peak_season_start: number | null; peak_season_end: number | null }): number {
  if (species.peak_season_start == null || species.peak_season_end == null) return 0;
  return monthMask(species.peak_season_start, species.peak_season_end);
}
