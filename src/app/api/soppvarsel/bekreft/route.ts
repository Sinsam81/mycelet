import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { HOPP_COOKIE, HOPP_COOKIE_MAX_AGE } from '@/lib/analytics/kilde';
import { regionSlug } from '@/lib/prediction/region-slug';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { TOKEN_MONSTER, hvorforIkkeNavigering, lenkeside, lenkesideSprak } from '@/lib/alerts/lenkeside';
import type { Locale } from '@/i18n/config';

/**
 * Bekreftelseslenka fra opt-in-eposten. Samme grep som avmeldingsruta
 * (/api/soppvarsel/av): uten innlogging, token identifiserer raden alene,
 * og mennesket sendes videre til en side som forklarer hva som skjedde.
 * Idempotent — å klikke lenka to ganger er fortsatt bekreftet, ikke en feil.
 *
 * ── SKANNERE SKAL IKKE BEKREFTE FOR NOEN ────────────────────────────────────
 *
 * GET satte før confirmed_at på første henting. En e-postskanner som følger
 * lenkene i innboksen fullførte dermed dobbel opt-in for en adresse eieren
 * aldri bekreftet — nettopp det bekreftelsessteget finnes for å hindre
 * (migrasjon 057). Nå bekrefter GET bare når nettleseren selv sier at det er
 * en navigering (se src/lib/alerts/lenkeside.ts). Ellers tegner ruta en side
 * med én knapp, og knappen (POST) gjør jobben. HEAD skriver aldri.
 *
 * Ingen tidsgrense her, i motsetning til avmeldingen: folk bekrefter sekunder
 * etter at de meldte seg på, og et tidsvindu ville sendt hvert eneste
 * menneske innom knappesiden. Skannere som kjører en ekte nettleser slipper
 * derfor fortsatt gjennom — en rest vi lever med, og den samme som før.
 */

export const runtime = 'nodejs';

/** Server-generert prosa dekkes ikke av next-intl — derfor en egen tabell per språk. */
const COPY: Record<Locale, { tittel: string; tekst: string; knapp: string }> = {
  nb: {
    tittel: 'Ett trykk igjen',
    tekst:
      'Trykk på knappen for å bekrefte påmeldingen til soppvarselet. Lenker i e-post åpnes iblant av e-postprogrammet selv, så vi bekrefter ikke før du trykker.',
    knapp: 'Bekreft soppvarselet'
  },
  sv: {
    tittel: 'Ett tryck kvar',
    tekst:
      'Tryck på knappen för att bekräfta anmälan till svampvarningen. Länkar i e-post öppnas ibland av e-postprogrammet självt, så vi bekräftar inget förrän du trycker.',
    knapp: 'Bekräfta svampvarningen'
  }
};

/** Videresending med hopp-markør: leseren kommer fra en e-postklient, ikke fra en kilde. */
function videre(url: string) {
  const svar = NextResponse.redirect(url, 303);
  svar.cookies.set(HOPP_COOKIE, '1', { path: '/', maxAge: HOPP_COOKIE_MAX_AGE, sameSite: 'lax' });
  return svar;
}

/** Selve bekreftelsen — felles for navigerings-GET og knappen (POST). */
async function bekreft(log: ReturnType<typeof createRequestLogger>, token: string, appUrl: string) {
  const db = createAdminClient();

  // Les raden først. Før satte ruta {confirmed_at, active: true} på ENHVER
  // rad som matchet tokenet — også en som var avmeldt. Da kunne en gammel
  // bekreftelseslenke i innboksen (eller en e-postskanner som følger GET-
  // lenker) gjenoppta et abonnement brukeren aktivt hadde sagt opp. Nå:
  //   · venter på bekreftelse (confirmed_at null) → bekreft
  //   · alt bekreftet og aktiv → «bekreftet» igjen, uten å re-stemple
  //     samtykketidspunktet (idempotent — lenka kan klikkes to ganger)
  //   · avmeldt → ugyldig; ny påmelding gir en ny lenke
  //   · kontorader (user_id satt) får aldri noen lenke → ugyldig
  const { data: rad, error: leseErr } = await db
    .from('alert_subscriptions')
    .select('id,region,active,confirmed_at,user_id')
    .eq('confirm_token', token)
    .maybeSingle();

  if (leseErr || !rad || rad.user_id) {
    log.warn('varselbekreftelse.ukjent_token');
    return videre(`${appUrl}/soppvarsel?status=ugyldig-lenke#status`);
  }
  // Kvitteringen er områdesiden selv: dagens tall og uka fremover, med et
  // banner som forklarer når neste varsel kommer. Et tomt «du er påmeldt»
  // forklarte ikke stillheten som følger i en godværsperiode.
  const omradeSide = PREDICTION_TILE_REGIONS.some((r) => r.name === rad.region)
    ? `${appUrl}/soppforhold/${regionSlug(rad.region as string)}?status=bekreftet#pameldt`
    : `${appUrl}/soppvarsel?status=bekreftet#status`;

  if (rad.confirmed_at && rad.active) {
    log.info('varselbekreftelse.allerede_bekreftet', { region: rad.region });
    return videre(omradeSide);
  }
  if (rad.confirmed_at && !rad.active) {
    log.info('varselbekreftelse.avmeldt_rad', { region: rad.region });
    return videre(`${appUrl}/soppvarsel?status=ugyldig-lenke#status`);
  }

  const { error } = await db
    .from('alert_subscriptions')
    .update({ confirmed_at: new Date().toISOString(), active: true })
    .eq('id', rad.id)
    .is('confirmed_at', null);
  if (error) {
    log.error('varselbekreftelse.oppdatering_feilet', undefined, { message: error.message });
    return videre(`${appUrl}/soppvarsel?status=feil#status`);
  }

  log.info('varselbekreftelse.ok', { region: rad.region });
  return videre(omradeSide);
}

/** Lenkesjekkere og skannere spør ofte HEAD først. Svar pent, skriv ingenting. */
export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (!TOKEN_MONSTER.test(token)) return videre(`${appUrl}/soppvarsel?status=ugyldig-lenke#status`);

  // Menneske eller skanner: se filhodet. Siden med knappen tegnes UTEN å slå
  // opp tokenet, så den er lik for ekte og oppdiktede tokens.
  const grunn = hvorforIkkeNavigering(request);
  if (grunn) {
    log.info('varselbekreftelse.bekreftelse_vist', { grunn });
    const locale = lenkesideSprak(request, request.nextUrl.searchParams.get('sprak'));
    const t = COPY[locale];
    return lenkeside({
      locale,
      tittel: t.tittel,
      tekst: t.tekst,
      knapp: t.knapp,
      skjemaMal: `/api/soppvarsel/bekreft?t=${token}`,
      appUrl
    });
  }

  return bekreft(log, token, appUrl);
}

/** Knappen på siden over. Skannere sender ikke skjemaer, så her bekreftes det alltid. */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (!TOKEN_MONSTER.test(token)) return videre(`${appUrl}/soppvarsel?status=ugyldig-lenke#status`);
  return bekreft(log, token, appUrl);
}
