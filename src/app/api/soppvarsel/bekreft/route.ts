import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';

/**
 * Bekreftelseslenka fra opt-in-eposten. Samme grep som avmeldingsruta
 * (/api/soppvarsel/av): GET uten innlogging, token identifiserer raden alene,
 * og mennesket sendes videre til en side som forklarer hva som skjedde.
 * Idempotent — å klikke lenka to ganger er fortsatt bekreftet, ikke en feil.
 */
export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(token)) return NextResponse.redirect(`${appUrl}/soppvarsel?status=ugyldig-lenke`, 303);

  const db = createAdminClient();
  const { data, error } = await db
    .from('alert_subscriptions')
    .update({ confirmed_at: new Date().toISOString(), active: true })
    .eq('confirm_token', token)
    .select('region')
    .maybeSingle();

  if (error || !data) {
    log.warn('varselbekreftelse.ukjent_token');
    return NextResponse.redirect(`${appUrl}/soppvarsel?status=ugyldig-lenke`, 303);
  }

  log.info('varselbekreftelse.ok', { region: data.region });
  return NextResponse.redirect(`${appUrl}/soppvarsel?status=bekreftet`, 303);
}
