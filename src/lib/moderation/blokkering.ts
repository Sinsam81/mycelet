/**
 * Filtrerer bort innhold fra brukere leseren har blokkert.
 *
 * I forumet gjør RLS dette (migrasjon 032). Funn leses derimot gjennom viewet
 * `public_findings`, som ikke kjenner blokkeringslista — så den som blokkerte
 * noen i forumet så fortsatt funnene deres andre steder. Dette er filteret for
 * de lesestedene, til viewet selv får regelen (krever migrasjon).
 *
 * Kosmetisk, ikke et sikkerhetsskille: radene er offentlige uansett. Poenget er
 * at «blokker» betyr at du slipper å se personen.
 */
export function utenBlokkerte<T extends { user_id?: string | null }>(rows: readonly T[], blockedIds: Iterable<string>): T[] {
  const blokkert = blockedIds instanceof Set ? (blockedIds as Set<string>) : new Set(blockedIds);
  if (blokkert.size === 0) return [...rows];
  return rows.filter((row) => !row.user_id || !blokkert.has(row.user_id));
}

/** Hvor mange ekstra rader som hentes for at lista skal være full etter filteret. */
export const BLOKKERINGSMARGIN = 3;
