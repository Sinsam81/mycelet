/**
 * Paginering rundt PostgREST-taket på 1000 rader.
 *
 * PROBLEMET
 * PostgREST er konfigurert med `db-max-rows = 1000` og kutter DERFOR hvert
 * eneste svar ved 1000 rader — uansett hva funksjonens egen LIMIT sier. Kallet
 *
 *     supabase.rpc('get_occurrences_in_bounds', { ..., p_limit: 3000 })
 *
 * ser ut som «gi meg opptil 3000 punkter», men returnerer aldri mer enn 1000.
 * Ingen feil, ingen advarsel — svaret er bare stille avkortet.
 *
 * HVORFOR DET ER VERRE ENN «1000 tilfeldige punkter»
 * `get_occurrences_in_bounds` har ingen ORDER BY. Hvilke 1000 rader du får er
 * derfor opp til planleggeren, og i praksis blir det tabellrekkefølgen — som
 * ligger gruppert per art etter GBIF-importen. Målt mot produksjonsbasen:
 *
 *   • hele NO+SE  → 1000 rader, og de inneholder 2 arter av ~70
 *   • Oslo-regionen → 1000 av 3000+, og de inneholder 2 arter
 *   • Oslo sentrum  → 1000 av 3531, 16 arter
 *
 * Kartet så altså ut som et komplett funnkart, men viste én-to arter. Og fordi
 * spiselighets- og sesongfiltrene på kartet kjører KLIENTSIDE på det avkortede
 * utvalget, kunne «vis kun giftige» gi et tomt kart i et område med mange
 * giftige funn. Et tomt kart må aldri kunne leses som «ingen giftige her».
 *
 * LØSNINGEN
 * `.range(from, to)` i postgrest-js settes som `offset`/`limit`-parametre i
 * URL-en (ikke Range-headeren), og de virker gjennom taket: side 2 gir rad
 * 1000–1999, side 3 gir 2000–2999. Vi henter derfor side for side til vi har
 * alt, eller til vi når takhøyden kallstedet har bedt om.
 *
 * OM `truncated`
 * Flagget betyr «det du fikk er et UTVALG, ikke alt». Det settes når vi fylte
 * hele budsjettet, altså `rows.length >= limit`. Det overrapporterer i det ene
 * grensetilfellet der totalen er nøyaktig `limit` — da sier vi «utvalg» om noe
 * som faktisk var komplett. Det er med vilje: å si «utvalg» om et komplett sett
 * er ufarlig, å si «alt» om et avkortet sett er nettopp feilen vi retter.
 *
 * MERK: når `truncated` er sant er utvalget fortsatt vilkårlig (funksjonen har
 * ingen ORDER BY). Paginering gjør avkuttingen mye sjeldnere og mye mindre
 * skjev, men fjerner den ikke — derfor SKAL kallstedet si fra til brukeren
 * eller logge, aldri svelge flagget.
 */

/** PostgREST returnerer aldri flere rader enn dette per svar. */
export const POSTGREST_MAX_ROWS = 1000;

export interface PagedRpcResult<T> {
  /** Radene vi faktisk fikk, aldri flere enn `limit`. */
  rows: T[];
  /** true = det finnes trolig flere rader enn disse. Ikke svelg dette. */
  truncated: boolean;
  error: { message: string } | null;
}

/**
 * Minimal strukturell form av supabase-klienten — nok til å paginere, og lett
 * å lage en falsk av i tester. Passer både nettleser-, server- og admin-klienten.
 */
export interface PagedRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): {
    range(
      from: number,
      to: number
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

export interface PagedRpcOptions {
  /** Maks antall rader vi vil ha totalt. Bør speile funksjonens egen p_limit. */
  limit: number;
  /** Sideveksling; klemmes uansett ned til PostgREST-taket. */
  pageSize?: number;
}

/**
 * Kaller en RPC og henter opptil `limit` rader ved å bla forbi 1000-taket.
 *
 * Første side hentes alene: er den kortere enn en full side, finnes det ikke
 * mer å hente, og vi slipper unna med ett kall (det vanlige tilfellet — et
 * innzoomet kartutsnitt har typisk noen hundre punkter). Bare når første side
 * er full vet vi at det finnes mer, og da hentes resten parallelt.
 */
export async function fetchRpcPaged<T>(
  client: PagedRpcClient,
  fn: string,
  args: Record<string, unknown>,
  { limit, pageSize = POSTGREST_MAX_ROWS }: PagedRpcOptions
): Promise<PagedRpcResult<T>> {
  const size = Math.max(1, Math.min(pageSize, POSTGREST_MAX_ROWS));
  if (limit <= 0) return { rows: [], truncated: false, error: null };

  const first = await client.rpc(fn, args).range(0, size - 1);
  if (first.error) return { rows: [], truncated: false, error: first.error };

  const firstRows = (first.data ?? []) as T[];
  // Kort første side → vi har alt som finnes.
  if (firstRows.length < size) {
    return { rows: firstRows.slice(0, limit), truncated: false, error: null };
  }
  if (firstRows.length >= limit) {
    return { rows: firstRows.slice(0, limit), truncated: true, error: null };
  }

  // Full første side og fortsatt plass i budsjettet: hent resten parallelt.
  const pages: Promise<{ data: unknown; error: { message: string } | null }>[] = [];
  for (let from = size; from < limit; from += size) {
    const to = Math.min(from + size, limit) - 1;
    pages.push(Promise.resolve(client.rpc(fn, args).range(from, to)));
  }

  const rest = await Promise.all(pages);
  const rows = [...firstRows];
  for (const page of rest) {
    // En feil midt i pagineringen gjør resultatet ufullstendig på en måte vi
    // ikke kan skille fra «her sluttet dataene». Da er det riktig å si fra.
    if (page.error) return { rows: [], truncated: false, error: page.error };
    rows.push(...((page.data ?? []) as T[]));
  }

  return { rows: rows.slice(0, limit), truncated: rows.length >= limit, error: null };
}
