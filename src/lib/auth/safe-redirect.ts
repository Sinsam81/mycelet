/**
 * Én validator for «hvor skal brukeren sendes etter innlogging».
 *
 * Bakgrunn: `?next=` / `?redirect=` leses tre steder — OAuth-callbacken,
 * innloggingssiden og registreringssiden. Callbacken hadde sin egen sjekk
 * («starter med / og ikke med //»), login og register hadde ingen. Begge
 * deler var utrygt:
 *
 *   • Login/register sendte verdien rett til router.push() — ren åpen redirect.
 *   • Callbackens sjekk så trygg ut, men slapp gjennom fem varianter. URL-
 *     parseren behandler backslash som skråstrek for http(s), og fjerner
 *     tab/newline/CR før den tolker resten. Derfor endte både "/\evil.com"
 *     og "/<newline>/evil.com" på https://evil.com.
 *
 * Løsningen er å ikke mønstermatche på strengen i det hele tatt, men la URL-
 * parseren normalisere den mot en kjent base og så kreve at origin er urørt.
 * Da spiller det ingen rolle hvilket tegn angriperen finner på: klarer inputen
 * å flytte origin, blir den forkastet.
 */

/**
 * Basen vi normaliserer mot. `.invalid` er reservert av RFC 2606 og kan aldri
 * bli et ekte domene, så en input som treffer nøyaktig denne origin-en kan ikke
 * konstrueres utenfra.
 */
const INTERNAL_BASE = 'https://internal.invalid';

/** Tegn URL-parseren stryker bort før tolkning, og som derfor kan skjule et `//`. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Gjør en bruker­kontrollert `next`/`redirect`-verdi om til en trygg intern sti.
 *
 * Returnerer alltid noe som er trygt å sende til `router.push()`,
 * `NextResponse.redirect(new URL(x, origin))` eller `redirect()`.
 *
 * @param raw      Verdien fra query-strengen. Kan være null/undefined.
 * @param fallback Hvor vi sender brukeren når verdien ikke kan brukes.
 */
export function getSafeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;

  // Avvis skjulte styringstegn før parsing. Parseren ville strøket dem og
  // dermed endret betydningen av resten av strengen.
  if (CONTROL_CHARS.test(raw)) return fallback;

  // Må være en relativ sti. Dette alene stopper "https://evil.com" og
  // "javascript:alert(1)"; origin-sjekken under tar resten.
  if (!raw.startsWith('/')) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, INTERNAL_BASE);
  } catch {
    return fallback;
  }

  // Klarte inputen å flytte oss vekk fra basen, er den et angrep.
  if (parsed.origin !== INTERNAL_BASE) return fallback;

  // Bygg stien opp igjen fra de parsede delene, ikke fra råstrengen — da er
  // det den normaliserte formen som sendes videre.
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  // OG SÅ SJEKK RESULTATET PÅ NYTT. Dette er ikke overflødig.
  //
  // Sjekken over ser på den parsede URL-en, men det vi gir fra oss er
  // `pathname`. De to kan peke ulike steder: «/..//evil.com» normaliseres til
  // pathname «//evil.com» mens origin fortsatt er internal.invalid. Første
  // sjekk passerer altså, og det vi returnerer er en protokoll-relativ URL som
  // router.push() sender rett ut av domenet.
  //
  // Å løse stien opp mot basen én gang til fanger det, uten at vi må gjette
  // hvilke former en «egentlig ekstern» sti kan ha.
  try {
    if (new URL(path, INTERNAL_BASE).origin !== INTERNAL_BASE) return fallback;
  } catch {
    return fallback;
  }

  return path;
}

/**
 * Leser `next` (med `redirect` som alias) fra en søkeparameter-kilde og
 * validerer den. Både `URLSearchParams` og Next sin `ReadonlyURLSearchParams`
 * passer inn her.
 */
export function readSafeNext(
  params: Pick<URLSearchParams, 'get'> | null | undefined,
  fallback = '/'
): string {
  if (!params) return fallback;
  return getSafeNext(params.get('next') ?? params.get('redirect'), fallback);
}
