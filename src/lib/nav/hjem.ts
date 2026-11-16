/**
 * Hvor «Hjem» fører, hvilken fane som lyser, og hvor «Logg inn» sender deg.
 *
 * ── HVORFOR DEN FINNES ──────────────────────────────────────────────────────
 *
 * I iOS-skallet er /soppforhold den første skjermen for en som ikke er logget
 * inn. «/» er det ikke: mellomvaren skriver den om til den statiske
 * landingssiden, og landingssidens eget skript sender appen videre til
 * /soppforhold (location.replace). Hjem-fanen og logoen pekte likevel på «/»,
 * så et trykk var en full sidelasting som endte der brukeren alt sto — og
 * ingen fane lyste, fordi «/» aldri er adressen. Det leses som en app som
 * ikke virker.
 *
 * ⚠️ Mellomvarens omskriving og landingssidens omdirigering skal STÅ. De er
 * vakten som holder markedsføringssiden ute av appen (App Review 4.0/4.2), og
 * de er reserven når denne fila ikke har rukket å svare. Dette er bare den
 * raske veien: samme mål, uten omveien.
 *
 * ⚠️ BARE I APPEN. På nett er «/» landingssiden, og en utlogget besøkende skal
 * fortsatt komme dit fra logoen og Hjem-fanen.
 *
 * Rene funksjoner: kalleren (Header, BottomNav) leser innlogging og plattform
 * og sender dem inn. Mens innloggingen er ukjent skal kalleren bruke «/», så en
 * innlogget bruker aldri får /soppforhold i et øyeblikk.
 */

/** Appens hjem for en innlogget bruker — og for alle på nett. */
export const HJEM = '/';
/** Appens hjem for en som ikke er logget inn i iOS-skallet. */
export const HJEM_UTLOGGET_I_APPEN = '/soppforhold';

export function hjemHref({ native, innlogget }: { native: boolean; innlogget: boolean }): string {
  return native && !innlogget ? HJEM_UTLOGGET_I_APPEN : HJEM;
}

/**
 * Lyser fanen for `href` når brukeren står på `pathname`?
 *
 * Siden selv og alt under den — /soppforhold/oslo lyser «Hjem» når hjem er
 * /soppforhold, /species/12 lyser «Bibliotek». «/» er unntaket: den treffer
 * bare seg selv, ellers ville Hjem lyst på hver eneste side.
 */
export function erAktiv(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Adressen «Logg inn» i toppen peker på: innloggingen, med veien tilbake hit.
 *
 * `next` leses og valideres av readSafeNext på innloggingssiden. Tre steder
 * skal IKKE ta med seg selv:
 *  - «/» — innloggingen lander der uansett.
 *  - /auth/… — «tilbake til innloggingen» er en løkke.
 *  - appens utloggede hjem (/soppforhold i skallet) — etter innlogging er
 *    hjem «/», med prognosen for der du er. Områdesidene under tas med: der
 *    leste du om ett bestemt sted.
 */
export function innloggingHref({ pathname, native }: { pathname: string | null | undefined; native: boolean }): string {
  const tilbake =
    pathname &&
    pathname.startsWith('/') &&
    pathname !== HJEM &&
    !erAktiv(pathname, '/auth') &&
    !(native && pathname === HJEM_UTLOGGET_I_APPEN)
      ? pathname
      : null;
  return tilbake ? `/auth/login?next=${encodeURIComponent(tilbake)}` : '/auth/login';
}
