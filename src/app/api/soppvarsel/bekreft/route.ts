import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { HOPP_COOKIE, HOPP_COOKIE_MAX_AGE } from '@/lib/analytics/kilde';

/**
 * Bekreftelseslenka fra opt-in-eposten. Samme grep som avmeldingsruta
 * (/api/soppvarsel/av): GET uten innlogging, token identifiserer raden alene,
 * og mennesket sendes videre til en side som forklarer hva som skjedde.
 * Idempotent — å klikke lenka to ganger er fortsatt bekreftet, ikke en feil.
 */
/** Videresending med hopp-markør: leseren kommer fra en e-postklient, ikke fra en kilde. */
function videre(url: string) {
  const svar = NextResponse.redirect(url, 303);
  svar.cookies.set(HOPP_COOKIE, '1', { path: '/', maxAge: HOPP_COOKIE_MAX_AGE, sameSite: 'lax' });
  return svar;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(token)) return videre(`${appUrl}/soppvarsel?status=ugyldig-lenke#status`);

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
  if (rad.confirmed_at && rad.active) {
    log.info('varselbekreftelse.allerede_bekreftet', { region: rad.region });
    return videre(`${appUrl}/soppvarsel?status=bekreftet#status`);
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
    log.error('varselbekreftelse.oppdatering_feilet', { message: error.message });
    return videre(`${appUrl}/soppvarsel?status=feil#status`);
  }

  log.info('varselbekreftelse.ok', { region: rad.region });
  return videre(`${appUrl}/soppvarsel?status=bekreftet#status`);
}
