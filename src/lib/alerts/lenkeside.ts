import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/config';

/**
 * Lenker i e-post som ENDRER noe (avmelding, bekreftelse) — delt vern for
 * /api/soppvarsel/av og /api/soppvarsel/bekreft.
 *
 * ── HVORFOR EN GET IKKE KAN STOLE PÅ AT DEN ER ET TRYKK ─────────────────────
 *
 * E-postskannere (Safe Links, bedriftsgatewayer, lenkesjekkere) og klienter
 * som forhåndshenter, følger lenkene i en e-post uten at mottakeren har rørt
 * den. En rute som skriver på enhver GET, lar dem melde folk av varselet i det
 * e-posten leveres — og fullføre dobbel opt-in for en adresse eieren aldri
 * bekreftet. Samme lærdom som /api/prove/svar og /api/soppvarsel/klikk bygger
 * på; mønsteret her er det samme:
 *
 *   · GET skriver bare når nettleseren selv sier at dette er en navigering
 *     (Sec-Fetch-Dest: document + Sec-Fetch-Mode: navigate). Skannere og
 *     forhåndshentere sender ikke de headerne, sender «empty», eller merker
 *     hentingen med (Sec-)Purpose: prefetch.
 *   · Ellers tegner ruta selv en liten side med ÉN knapp som sender et skjema
 *     (POST). Skannere sender ikke skjemaer. Et menneske i en eldre nettleser
 *     får ett trykk til — aldri et innloggingsskjema.
 *   · HEAD skriver aldri (Next svarer ellers HEAD med GET-handleren).
 *
 * Siden er ren HTML fra ruta selv, som i /api/prove/svar: ingenting å laste,
 * ingen cookie eller sesjon, og den kan ikke caches (no-store). Adressen til
 * siden bærer tokenet, så den ber nettleseren om ikke å sende referanse
 * videre (no-referrer) — ellers ville neste side kunne lese lenka som
 * «hvor kom du fra».
 *
 * ⚠️ Siden tegnes UTEN å slå opp tokenet. Den er dermed helt lik for et ekte
 * og et oppdiktet token, og ruta blir ikke et orakel for å gjette gyldige
 * tokens. Språket kommer derfor fra lenka (&sprak=), cookien eller
 * Accept-Language — aldri fra raden.
 */

export const TOKEN_MONSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hvorfor en GET ikke regnes som et menneskes trykk — null når den gjør det. */
export type IkkeNavigering = 'ikke-get' | 'forhandshenting' | 'ukjent-klient' | 'ikke-navigasjon';

export function hvorforIkkeNavigering(request: NextRequest): IkkeNavigering | null {
  if (request.method !== 'GET') return 'ikke-get';
  // Chrome/Safari merker forhåndshenting og forhåndstegning slik; eldre
  // klienter brukte «Purpose» og «X-Purpose».
  const formal = ['sec-purpose', 'purpose', 'x-purpose', 'x-moz']
    .map((navn) => request.headers.get(navn) ?? '')
    .join(' ')
    .toLowerCase();
  if (/prefetch|prerender|preview/.test(formal)) return 'forhandshenting';
  const dest = request.headers.get('sec-fetch-dest');
  if (dest === null) return 'ukjent-klient';
  return dest === 'document' && request.headers.get('sec-fetch-mode') === 'navigate' ? null : 'ikke-navigasjon';
}

/** «sv»/«nb» fra en lenke eller et skjemafelt, ellers null. */
export function lesSprak(verdi: unknown): Locale | null {
  return typeof verdi === 'string' && isLocale(verdi) ? verdi : null;
}

/**
 * Språket for siden ruta tegner selv: det lenka bærer, så språkcookien, så
 * Accept-Language (samme rekkefølge som getUserLocale), til slutt norsk.
 * Leser bare forespørselen — se ⚠️ i filhodet.
 */
export function lenkesideSprak(request: NextRequest, bedt?: string | null): Locale {
  const fraLenke = lesSprak(bedt);
  if (fraLenke) return fraLenke;
  const fraCookie = lesSprak(request.cookies.get(LOCALE_COOKIE)?.value);
  if (fraCookie) return fraCookie;
  if (/(^|[,\s])sv\b/i.test(request.headers.get('accept-language') ?? '')) return 'sv';
  return DEFAULT_LOCALE;
}

/**
 * De to utgavene av avmeldingslenka i et varsel.
 *
 * ⚠️ API-ruta, ikke kvitteringssiden. /soppvarsel/av (uten /api) er bare en
 * passiv bekreftelse — en lenke dit ville vist «du er avmeldt» uten å melde av
 * noen. API-ruta gjør jobben og sender mennesket videre til siden selv.
 *
 *   · `hode` går i List-Unsubscribe. Gmail og Outlook sender en POST dit
 *     (RFC 8058), og adressen skal ikke bære noe leverandøren kan snuble i.
 *   · `brodtekst` er lenka mottakeren ser. Den bærer i tillegg utsendingstiden
 *     (&s=, sekunder siden epoke) og språket (&sprak=): avmeldingsruta melder
 *     ikke av på en henting sekunder etter levering — det er e-postskannere —
 *     og viser i stedet siden med én knapp, på abonnementets språk.
 */
export function avmeldingslenker(args: { appUrl: string; token: string; sendtSek: number; locale: Locale }): {
  hode: string;
  brodtekst: string;
} {
  const hode = `${args.appUrl}/api/soppvarsel/av?t=${args.token}`;
  return { hode, brodtekst: `${hode}&s=${args.sendtSek}&sprak=${args.locale}` };
}

const TILBAKE: Record<Locale, string> = { nb: 'Til Mycelet', sv: 'Till Mycelet' };

export interface LenkesideArgs {
  locale: Locale;
  tittel: string;
  tekst: string;
  /** Skjemaets mål. Må være en sti på samme opphav (CSP: form-action 'self'). */
  skjemaMal: string;
  knapp: string;
  /** Skjulte felt. Verdiene skal være validert av kalleren — de escapes ikke her. */
  felt?: Record<string, string>;
  appUrl: string;
}

/**
 * Siden med én knapp. Alle verdiene som settes inn er faste tekster, et
 * validert token (heksadesimalt + bindestrek) eller en språkkode, så de kan
 * stå rett i HTML-en — samme forutsetning som i /api/prove/svar.
 */
export function lenkeside(args: LenkesideArgs): NextResponse {
  const skjulte = Object.entries(args.felt ?? {})
    .map(([navn, verdi]) => `      <input type="hidden" name="${navn}" value="${verdi}">`)
    .join('\n');
  const html = `<!doctype html>
<html lang="${args.locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <meta name="referrer" content="no-referrer">
    <title>${args.tittel} — Mycelet</title>
  </head>
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 560px; margin: 48px auto; padding: 0 16px;">
    <h1 style="font-size: 22px; font-weight: 600; color: #1A3409; margin-bottom: 8px;">${args.tittel}</h1>
    <p style="font-size: 16px; line-height: 1.5;">${args.tekst}</p>
    <form method="post" action="${args.skjemaMal}" style="margin-top: 16px;">
${skjulte}
      <button type="submit" style="font: inherit; font-size: 16px; padding: 10px 18px; background: #1A3409; color: #fff; border: 0; border-radius: 8px;">${args.knapp}</button>
    </form>
    <p style="font-size: 14px; margin-top: 24px;"><a href="${args.appUrl}" style="color: #1A3409;">${TILBAKE[args.locale]}</a></p>
  </body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}
