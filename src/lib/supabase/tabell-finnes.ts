/**
 * «Mangler tabellen?» — spurt slik at svaret faktisk kommer fram.
 *
 * Migrasjoner limes inn for hånd, så en glemt migrasjon er en reell feilkilde.
 * To ting gjorde de gamle sjekkene blinde:
 *
 * 1. PostgREST svarer 404 med koden `PGRST205` når en tabell ikke finnes i
 *    skjemacachen. Postgres' egen `42P01` kommer bare gjennom RPC-er og rå
 *    SQL. En sjekk som bare ser etter `42P01`, slår derfor aldri ut.
 *
 * 2. Et HEAD-kall (`select(..., { count: 'exact', head: true })`) har ingen
 *    svarkropp. postgrest-js gjør 404 med tom kropp om til status 204 med
 *    `error = null`, og `count` settes bare for vellykkede svar. En manglende
 *    tabell ser altså ut som `{ error: null, count: null }` — og `count ?? 0`
 *    gjør det til «0 rader», som er nettopp den stille nullen overvåkingen
 *    skulle fange.
 */

interface FeilMedKode {
  code?: string | null;
  message?: string | null;
}

/** Tabellen finnes ikke: PostgREST (`PGRST205`) eller Postgres (`42P01`). */
export function erManglendeTabell(error: FeilMedKode | null | undefined): boolean {
  // Ikke PGRST204 — det er en manglende KOLONNE, og tabellen finnes.
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export interface TellSvar {
  error: FeilMedKode | null;
  count: number | null;
  status?: number;
}

export type TellResultat =
  | { antall: number; mangler?: undefined; feil?: undefined }
  | { mangler: true; antall?: undefined; feil?: undefined }
  | { feil: string; antall?: undefined; mangler?: undefined };

/**
 * Tolker svaret på en HEAD-telling. Ren, så den kan testes uten klient.
 *
 * Med `count: 'exact'` har et vellykket svar alltid et tall. `count == null`
 * uten feil betyr derfor at klienten svelget en 404: tabellen mangler.
 */
export function tolkTelling(svar: TellSvar): TellResultat {
  if (svar.error) {
    if (erManglendeTabell(svar.error)) return { mangler: true };
    // HEAD har ingen kropp, så meldingen er ofte tom. Statusen sier mer.
    return { feil: svar.error.message || `HTTP ${svar.status ?? 'ukjent'}` };
  }
  if (svar.count == null) return { mangler: true };
  return { antall: svar.count };
}

/** Kjører en HEAD-telling og tolker den. Gi inn spørringen, ikke svaret. */
export async function tellRader(query: PromiseLike<TellSvar>): Promise<TellResultat> {
  return tolkTelling(await query);
}

/**
 * Tabeller helsesjekken ser etter (uten `?fast=1`). En rute-fil kan ikke
 * eksportere annet enn rutehandlere, så listen bor her. Legg til en rad når en
 * migrasjon oppretter en tabell som noe i drift er avhengig av.
 */
export const NYERE_TABELLER: ReadonlyArray<{ tabell: string; migrasjon: string }> = [
  { tabell: 'ai_identifications', migrasjon: '020' },
  { tabell: 'billing_webhook_events', migrasjon: '007' },
  { tabell: 'bruksdager', migrasjon: '064' },
  { tabell: 'flatetellinger', migrasjon: '070' },
  { tabell: 'soppregistreringer', migrasjon: '071' },
  { tabell: 'prove_paaminnelser', migrasjon: '072' },
  { tabell: 'prove_svar', migrasjon: '072' },
  { tabell: 'ai_identifiseringsfeil', migrasjon: '073' }
];
