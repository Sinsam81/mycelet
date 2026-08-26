/**
 * Rene hjelpere for funn-lagets filtre og ærlighets-metadata.
 *
 * Årsfilteret finnes fordi ~72 % av de 428 000 GBIF-punktene er fra før 2021
 * og 74 000 fra før år 2000 — gamle herbariebelegg rendret som ferske prikker
 * skjuler datasettets sterkeste signal (datoene; se sanketips-artikkelen om
 * soppkartene). Filteret skal primært anvendes SERVER-SIDE (p_min_year i
 * get_occurrences_in_bounds, migrasjon 054): klient-side filtrering inne i
 * det avkuttede 6000-radersutvalget arver trunkeringsskjevheten kartet
 * allerede advarer mot. Hjelperne her brukes av fallbacken (før migrasjonen
 * er kjørt i prod) og av tester.
 */

export type OccurrenceYearFilter = 'all' | 'last5' | 'last10';

/**
 * Første årstall som slipper gjennom filteret, eller null for «alle år».
 * «Siste 5 år» inkluderer inneværende år: i 2026 betyr det 2022–2026.
 */
export function occurrenceYearCutoff(filter: OccurrenceYearFilter, now: Date): number | null {
  if (filter === 'last5') return now.getFullYear() - 4;
  if (filter === 'last10') return now.getFullYear() - 9;
  return null;
}

/**
 * Klient-fallbacken for årsfilteret. Rader uten dato (118 av 428 829)
 * ekskluderes når filteret er aktivt: en ukjent dato kan ikke bevise at
 * funnet er ferskt, og «vis bare nye funn» som viser udaterte ville vært
 * usant. År-bare-rader (lagret som YYYY-01-01) klassifiseres riktig — det er
 * årstallet som telles, ikke datoen.
 */
export function passesYearCutoff(observedAt: string | null | undefined, cutoffYear: number | null): boolean {
  if (cutoffYear == null) return true;
  if (!observedAt) return false;
  const year = parseInt(observedAt.slice(0, 4), 10);
  if (!Number.isFinite(year)) return false;
  return year >= cutoffYear;
}

/**
 * «±120 m» / «±1,5 km» for popupens posisjonsnøyaktighet-linje.
 * Importfilteret slipper bare gjennom ≤1000 m fremover, men eldre rader kan
 * få større verdier ved en fremtidig backfill — km-formen dekker dem ærlig.
 * Enhetene m/km skrives likt på norsk og svensk, så ingen locale trengs.
 */
export function formatUncertaintyMeters(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  if (m < 1000) return `±${Math.round(m)} m`;
  const km = m / 1000;
  const rounded = km >= 10 ? Math.round(km).toString() : (Math.round(km * 10) / 10).toString().replace('.', ',');
  return `±${rounded} km`;
}
