import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { erProveSvarValg, lesProveSvarToken, proveSvarHemmelighet, type ProveSvarToken } from '@/lib/billing/prove-svar-token';
import { dagerMellom } from '@/lib/billing/prove-paaminnelse-app';
import { proveSvarValgTekst, type ProveSvarValg } from '@/lib/billing/prove-paaminnelse';
import { AKTIVERING_MIN_MS } from '@/lib/rapport/dagsrapport';
import { osloDag } from '@/lib/bruk/bruksdag';
import type { Locale } from '@/i18n/config';

/**
 * Svaret på det ene spørsmålet i App Store-påminnelsen: «Hva var viktigst
 * for deg i uka?» — ett trykk på en av tre lenker i e-posten.
 *
 * GET uten innlogging, som avmeldings- og bekreftelseslenkene for
 * soppvarselet: den som åpner e-posten på en telefon der hen ikke er logget
 * inn, skal ikke møte et innloggingsskjema for å svare på ett spørsmål.
 * Tokenet (src/lib/billing/prove-svar-token.ts) bærer bruker, prøveslutt og
 * utsendingstid med en HMAC — ingen adresse i lenka, og ingen kan svare for
 * andre.
 *
 * ── SKANNERE SKAL IKKE SVARE FOR KUNDEN ─────────────────────────────────────
 *
 * E-postskannere (Safe Links, bedriftsgatewayer, forhåndshentende klienter)
 * henter alle lenkene i en e-post — de tre svarene i rekkefølge, og siste
 * vinner. Da hadde en kunde som aldri åpnet e-posten stått med «ai» i
 * tabellen, og dagsrapporten talt skannertrafikk som mening. Derfor skrives
 * svaret på GET bare når BEGGE holder:
 *
 *   · hentingen skjer minst AKTIVERING_MIN_MS etter utsendingen (tiden står
 *     signert i tokenet) — samme regel som varselklikkene i
 *     /api/soppvarsel/klikk; skannere henter innen sekunder
 *   · nettleseren sier selv at det er en navigering: Sec-Fetch-Dest:
 *     document og Sec-Fetch-Mode: navigate. Skannere og forhåndshentere
 *     sender ikke de headerne, eller sender «empty».
 *
 * Holder ikke begge, vises samme side med valget og ÉN knapp som sender et
 * skjema (POST). Skannere sender ikke skjemaer; et menneske som åpnet
 * e-posten raskt, eller i en eldre nettleser, får ett trykk til — og en
 * side som sier hvorfor. HEAD skriver aldri (Next svarer ellers HEAD med
 * GET-handleren).
 *
 * Svaret skrives til prove_svar (migrasjon 072), ett per bruker og prøve;
 * et nytt trykk overskriver, så den som ombestemmer seg får siste ord.
 * Lenker eldre enn 30 dager etter prøveslutt avvises — svaret er bare
 * meningsfullt i ukene rundt prøven, og et endepunkt som skriver for
 * alltid er unødvendig.
 *
 * Siden som vises er ren HTML fra ruta selv, på språket lenka bærer
 * (&sprak=), aldri en app-side: ingenting å laste, ingenting som krever
 * cookie eller sesjon. Feilet lagringen, sier siden det — «takk» for et
 * svar som ikke ble lagret er en løgn, og det samme er «takk» for et svar
 * vi valgte å ikke lagre.
 */

export const runtime = 'nodejs';

/** Hvor lenge etter prøveslutt lenka fortsatt tas imot. */
export const SVAR_FRIST_DAGER = 30;

const COPY: Record<
  Locale,
  {
    takk: string;
    takkTekst: string;
    bekreft: string;
    bekreftTekst: (valg: string) => string;
    bekreftKnapp: string;
    ugyldig: string;
    ugyldigTekst: string;
    feil: string;
    feilTekst: string;
    tilbake: string;
  }
> = {
  nb: {
    takk: 'Takk!',
    takkTekst: 'Svaret ditt er notert. Det hjelper oss å prioritere riktig.',
    bekreft: 'Ett trykk til',
    bekreftTekst: (valg) =>
      `Du valgte «${valg}». Trykk på knappen for å lagre svaret. Lenker i e-post åpnes iblant av e-postprogrammet selv, så vi lagrer ikke før du trykker.`,
    bekreftKnapp: 'Lagre svaret',
    ugyldig: 'Lenken virker ikke',
    ugyldigTekst: 'Denne lenken er ugyldig eller utløpt. Du trenger ikke gjøre noe mer.',
    feil: 'Vi fikk ikke lagret svaret',
    feilTekst: 'Prøv lenken igjen om litt. Du trenger ikke gjøre noe mer.',
    tilbake: 'Til Mycelet'
  },
  sv: {
    takk: 'Tack!',
    takkTekst: 'Ditt svar är noterat. Det hjälper oss att prioritera rätt.',
    bekreft: 'Ett tryck till',
    bekreftTekst: (valg) =>
      `Du valde «${valg}». Tryck på knappen för att spara svaret. Länkar i e-post öppnas ibland av e-postprogrammet självt, så vi sparar inget förrän du trycker.`,
    bekreftKnapp: 'Spara svaret',
    ugyldig: 'Länken fungerar inte',
    ugyldigTekst: 'Den här länken är ogiltig eller har gått ut. Du behöver inte göra något mer.',
    feil: 'Vi kunde inte spara svaret',
    feilTekst: 'Prova länken igen om en stund. Du behöver inte göra något mer.',
    tilbake: 'Till Mycelet'
  }
};

function side(locale: Locale, tittel: string, tekst: string, appUrl: string, status: number, ekstraHtml = '') {
  const t = COPY[locale];
  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${tittel} — Mycelet</title>
  </head>
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 560px; margin: 48px auto; padding: 0 16px;">
    <h1 style="font-size: 22px; font-weight: 600; color: #1A3409; margin-bottom: 8px;">${tittel}</h1>
    <p style="font-size: 16px; line-height: 1.5;">${tekst}</p>
${ekstraHtml}
    <p style="font-size: 14px; margin-top: 24px;"><a href="${appUrl}" style="color: #1A3409;">${t.tilbake}</a></p>
  </body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

/**
 * Skjemaet på bekreftelsessiden. Tokenet er alt validert (ren ASCII: hex,
 * bindestrek, punktum) og valget er ett av tre nøkkelord, så verdiene kan
 * stå rett i HTML-en uten escaping.
 */
function skjemaHtml(locale: Locale, token: string, valg: ProveSvarValg): string {
  const t = COPY[locale];
  return `    <form method="post" action="/api/prove/svar" style="margin-top: 16px;">
      <input type="hidden" name="t" value="${token}">
      <input type="hidden" name="valg" value="${valg}">
      <input type="hidden" name="sprak" value="${locale}">
      <button type="submit" style="font: inherit; font-size: 16px; padding: 10px 18px; background: #1A3409; color: #fff; border: 0; border-radius: 8px;">${t.bekreftKnapp}</button>
    </form>`;
}

function lesLocale(v: string | null | undefined): Locale {
  return v === 'sv' ? 'sv' : 'nb';
}

type Lest = { ok: true; token: ProveSvarToken; raa: string; valg: ProveSvarValg } | { ok: false; status: 400 | 410 | 500 };

/** Felles for GET og POST: token og valg, med de samme avvisningene. */
function lesLenke(log: ReturnType<typeof createRequestLogger>, t: string | null, valg: string | null): Lest {
  const hemmelighet = proveSvarHemmelighet();
  if (!hemmelighet) {
    log.error('prove_svar.hemmelighet_mangler');
    return { ok: false, status: 500 };
  }
  const token = lesProveSvarToken(t, hemmelighet);
  if (!token || !erProveSvarValg(valg)) {
    log.warn('prove_svar.ugyldig_lenke');
    return { ok: false, status: 400 };
  }
  if (dagerMellom(token.proveSlutt, osloDag(new Date())) > SVAR_FRIST_DAGER) {
    log.info('prove_svar.utlopt', { proveSlutt: token.proveSlutt });
    return { ok: false, status: 410 };
  }
  return { ok: true, token, raa: t as string, valg };
}

function avvist(locale: Locale, status: 400 | 410 | 500, appUrl: string) {
  const t = COPY[locale];
  return status === 500 ? side(locale, t.feil, t.feilTekst, appUrl, 500) : side(locale, t.ugyldig, t.ugyldigTekst, appUrl, status);
}

async function lagre(log: ReturnType<typeof createRequestLogger>, locale: Locale, token: ProveSvarToken, valg: ProveSvarValg, appUrl: string) {
  const t = COPY[locale];
  try {
    const db = createAdminClient();
    const { error } = await db
      .from('prove_svar')
      .upsert({ user_id: token.userId, prove_slutt: token.proveSlutt, valg, svart_at: new Date().toISOString() }, { onConflict: 'user_id,prove_slutt' });
    if (error) {
      log.warn('prove_svar.ikke_lagret', { message: error.message });
      return side(locale, t.feil, t.feilTekst, appUrl, 500);
    }
  } catch (e) {
    log.warn('prove_svar.feilet', { message: e instanceof Error ? e.message : 'ukjent' });
    return side(locale, t.feil, t.feilTekst, appUrl, 500);
  }
  log.info('prove_svar.ok', { valg, proveSlutt: token.proveSlutt });
  return side(locale, t.takk, t.takkTekst, appUrl, 200);
}

/** Lenkesjekkere og skannere spør ofte HEAD først. Svar pent, skriv ingenting. */
export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const locale = lesLocale(request.nextUrl.searchParams.get('sprak'));

  // Anonym GET som kan skrive til databasen skal ikke kunne hamres.
  const rl = checkRateLimit(`prove-svar:${getClientKey(request, null)}`, 30, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const lest = lesLenke(log, request.nextUrl.searchParams.get('t'), request.nextUrl.searchParams.get('valg'));
  if (!lest.ok) return avvist(locale, lest.status, appUrl);

  // Menneske eller skanner: se filkommentaren. Begge må holde før GET skriver.
  const menneske = Date.now() - lest.token.sendtMs >= AKTIVERING_MIN_MS;
  const dest = request.headers.get('sec-fetch-dest');
  const navigasjon = dest === 'document' && request.headers.get('sec-fetch-mode') === 'navigate';
  if (request.method !== 'GET' || !menneske || !navigasjon) {
    const grunn = request.method !== 'GET' ? 'ikke-get' : !menneske ? 'skannervindu' : dest === null ? 'ukjent-klient' : 'ikke-navigasjon';
    log.info('prove_svar.bekreftelse_vist', { grunn, valg: lest.valg, proveSlutt: lest.token.proveSlutt });
    const t = COPY[locale];
    return side(locale, t.bekreft, t.bekreftTekst(proveSvarValgTekst(locale, lest.valg)), appUrl, 200, skjemaHtml(locale, lest.raa, lest.valg));
  }

  return lagre(log, locale, lest.token, lest.valg, appUrl);
}

/** Knappen på bekreftelsessiden. Skannere sender ikke skjemaer, så her skrives det alltid. */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const rl = checkRateLimit(`prove-svar:${getClientKey(request, null)}`, 30, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  let skjema: FormData;
  try {
    skjema = await request.formData();
  } catch {
    log.warn('prove_svar.ugyldig_skjema');
    return avvist('nb', 400, appUrl);
  }
  const felt = (navn: string) => {
    const v = skjema.get(navn);
    return typeof v === 'string' ? v : null;
  };
  const locale = lesLocale(felt('sprak'));
  const lest = lesLenke(log, felt('t'), felt('valg'));
  if (!lest.ok) return avvist(locale, lest.status, appUrl);

  return lagre(log, locale, lest.token, lest.valg, appUrl);
}
