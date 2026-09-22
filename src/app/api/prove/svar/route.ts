import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { erProveSvarValg, lesProveSvarToken, proveSvarHemmelighet } from '@/lib/billing/prove-svar-token';
import { dagerMellom } from '@/lib/billing/prove-paaminnelse-app';
import { osloDag } from '@/lib/bruk/bruksdag';
import type { Locale } from '@/i18n/config';

/**
 * Svaret på det ene spørsmålet i App Store-påminnelsen: «Hva var viktigst
 * for deg i uka?» — ett trykk på en av tre lenker i e-posten.
 *
 * GET uten innlogging, som avmeldings- og bekreftelseslenkene for
 * soppvarselet: den som åpner e-posten på en telefon der hen ikke er logget
 * inn, skal ikke møte et innloggingsskjema for å svare på ett spørsmål.
 * Tokenet (src/lib/billing/prove-svar-token.ts) bærer bruker og prøveslutt
 * med en HMAC — ingen adresse i lenka, og ingen kan svare for andre.
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
 * svar som ikke ble lagret er en løgn.
 */

export const runtime = 'nodejs';

/** Hvor lenge etter prøveslutt lenka fortsatt tas imot. */
export const SVAR_FRIST_DAGER = 30;

const COPY: Record<Locale, { takk: string; takkTekst: string; ugyldig: string; ugyldigTekst: string; feil: string; feilTekst: string; tilbake: string }> = {
  nb: {
    takk: 'Takk!',
    takkTekst: 'Svaret ditt er notert. Det hjelper oss å prioritere riktig.',
    ugyldig: 'Lenken virker ikke',
    ugyldigTekst: 'Denne lenken er ugyldig eller utløpt. Du trenger ikke gjøre noe mer.',
    feil: 'Vi fikk ikke lagret svaret',
    feilTekst: 'Prøv lenken igjen om litt. Du trenger ikke gjøre noe mer.',
    tilbake: 'Til Mycelet'
  },
  sv: {
    takk: 'Tack!',
    takkTekst: 'Ditt svar är noterat. Det hjälper oss att prioritera rätt.',
    ugyldig: 'Länken fungerar inte',
    ugyldigTekst: 'Den här länken är ogiltig eller har gått ut. Du behöver inte göra något mer.',
    feil: 'Vi kunde inte spara svaret',
    feilTekst: 'Prova länken igen om en stund. Du behöver inte göra något mer.',
    tilbake: 'Till Mycelet'
  }
};

function side(locale: Locale, tittel: string, tekst: string, appUrl: string, status: number) {
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
    <p style="font-size: 14px; margin-top: 24px;"><a href="${appUrl}" style="color: #1A3409;">${t.tilbake}</a></p>
  </body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const locale: Locale = request.nextUrl.searchParams.get('sprak') === 'sv' ? 'sv' : 'nb';
  const t = COPY[locale];

  // Anonym GET som skriver til databasen skal ikke kunne hamres.
  const rl = checkRateLimit(`prove-svar:${getClientKey(request, null)}`, 30, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const hemmelighet = proveSvarHemmelighet();
  if (!hemmelighet) {
    log.error('prove_svar.hemmelighet_mangler');
    return side(locale, t.feil, t.feilTekst, appUrl, 500);
  }

  const token = lesProveSvarToken(request.nextUrl.searchParams.get('t'), hemmelighet);
  const valg = request.nextUrl.searchParams.get('valg');
  if (!token || !erProveSvarValg(valg)) {
    log.warn('prove_svar.ugyldig_lenke');
    return side(locale, t.ugyldig, t.ugyldigTekst, appUrl, 400);
  }
  if (dagerMellom(token.proveSlutt, osloDag(new Date())) > SVAR_FRIST_DAGER) {
    log.info('prove_svar.utlopt', { proveSlutt: token.proveSlutt });
    return side(locale, t.ugyldig, t.ugyldigTekst, appUrl, 410);
  }

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
