/**
 * Å lese svarene fra /api/findings-rutene på kartet.
 *
 * Rutene svarer på feil med `{ error, code }`, der `error` alt er oversatt
 * til leserens språk (src/app/api/findings/svar.ts). Det er den ENE teksten
 * fra et svar kartet viser. Ett unntak har ingen `code`: rategrensen
 * (rateLimitResponse i src/lib/rate-limit/route.ts) svarer 429 med en alt
 * oversatt `error` og `retryAfterSeconds`. Den teksten sier «vent litt», og
 * katalogens «prøv igjen» ville fått brukeren til å treffe grensen på nytt —
 * så en 429 med `retryAfterSeconds` slipper gjennom når kallstedet sender
 * status 429. Ellers er et svar uten `code` ikke rutas eget — en 502-side fra
 * Vercel, en proxy, en kropp som ikke er JSON — og da gjelder katalogens
 * reserve. Databasens egne meldinger når aldri hit: rutene logger dem og
 * svarer med en kode.
 */

/** Rutas lokaliserte tekst, eller null når svaret ikke er rutas eget. */
export function serverFeiltekst(
  kropp: unknown,
  { medDetaljer = false, status }: { medDetaljer?: boolean; status?: number } = {}
): string | null {
  if (typeof kropp !== 'object' || kropp === null) return null;
  const { code, error, details } = kropp as { code?: unknown; error?: unknown; details?: unknown };
  if (typeof code !== 'string' || code === '') {
    const fraRategrensen = status === 429 && 'retryAfterSeconds' in kropp;
    return fraRategrensen && typeof error === 'string' && error.trim() !== '' ? error : null;
  }
  // `details` er rutas egen, mer presise setning når en migrasjon mangler
  // («Funnet ditt er trygt og IKKE slettet …»). Bare der kallstedet ber om den.
  if (medDetaljer && typeof details === 'string' && details.trim() !== '') return details;
  return typeof error === 'string' && error.trim() !== '' ? error : null;
}

/**
 * Beskjed fra serveren på et VELLYKKET lagringssvar: funnet er lagret, men
 * ikke helt slik brukeren ba om (et sonefunn som måtte lagres som privat).
 * `message` er alt oversatt av serveren.
 */
export interface LagringsBeskjed {
  code: string;
  message: string;
}

/** `notice` fra et lagringssvar, eller null når det mangler eller ikke har formen. */
export function lagringsBeskjed(kropp: unknown): LagringsBeskjed | null {
  if (typeof kropp !== 'object' || kropp === null) return null;
  const notice = (kropp as { notice?: unknown }).notice;
  if (typeof notice !== 'object' || notice === null) return null;
  const { code, message } = notice as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string' || message.trim() === '') return null;
  return { code, message };
}
