import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { byggBekreftelsesEpost } from '@/lib/alerts/email';
import { sendEpost } from '@/lib/email/send';

/**
 * Konto-løs påmelding til soppvarselet (migrasjon 057).
 *
 * Tar imot BÅDE vanlig skjema-POST (application/x-www-form-urlencoded) og
 * JSON. Skjemaformen er ikke nostalgi: /soppvarsel-siden er en servertegnet
 * side uten klient-JS, og den statiske landingssiden lenker dit — hele
 * påmeldingen skal virke med JavaScript avslått. Skjema-POST svarer derfor
 * med redirect tilbake til siden (303), JSON-kall får JSON.
 *
 * Dobbel opt-in: raden skrives ubekreftet, og cron-jobben ser den ikke før
 * bekreftelseslenka i e-posten er klikket. Se migrasjonsfila for hvorfor.
 *
 * Svaret er bevisst LIKT uansett om adressen var påmeldt fra før — et skille
 * ville gjort ruta til et orakel for «er denne adressen abonnent?».
 */

const GYLDIGE_REGIONER = new Set(PREDICTION_TILE_REGIONS.map((r) => r.name));

// Nok til å avvise tull, løst nok til å slippe gjennom alt som kan være ekte.
const EPOST_MONSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function erSkjemaPost(request: NextRequest) {
  return (request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded');
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);

  const skjema = erSkjemaPost(request);
  let email = '';
  let region = '';
  let locale = 'nb';
  if (skjema) {
    const data = await request.formData();
    email = String(data.get('email') ?? '').trim();
    region = String(data.get('region') ?? '').trim();
    locale = String(data.get('locale') ?? 'nb');
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    email = String(body.email ?? '').trim();
    region = String(body.region ?? '').trim();
    locale = String(body.locale ?? 'nb');
  }
  if (locale !== 'sv') locale = 'nb';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const tilbake = (status: string) =>
    skjema
      ? NextResponse.redirect(`${appUrl}/soppvarsel?status=${status}`, 303)
      : NextResponse.json({ ok: status === 'sendt' , status});

  if (!EPOST_MONSTER.test(email) || !GYLDIGE_REGIONER.has(region)) {
    log.info('varselpamelding.avvist', { region, gyldigEpost: EPOST_MONSTER.test(email) });
    return tilbake('ugyldig');
  }

  // 5 påmeldinger per time per klient: stopper både skript og fingerfeil.
  const rl = checkRateLimit(`varselpamelding:${getClientKey(request, null)}`, 5, 3600);
  if (!rl.allowed) return skjema ? tilbake('ugyldig') : rateLimitResponse(rl);

  const db = createAdminClient();

  // Finnes raden fra før? Bekreftet → stille suksess (ingen ny e-post, ingen
  // lekkasje). Ubekreftet → send bekreftelsen på nytt (folk mister e-poster).
  const { data: eksisterende } = await db
    .from('alert_subscriptions')
    .select('id,confirm_token,confirmed_at,active')
    .is('user_id', null)
    .ilike('email', email)
    .eq('region', region)
    .maybeSingle();

  let confirmToken: string | null = null;
  if (eksisterende) {
    if (eksisterende.confirmed_at && eksisterende.active) return tilbake('sendt');
    // Avmeldt eller ubekreftet: reaktiver via nytt samtykke.
    confirmToken = eksisterende.confirm_token as string;
    await db
      .from('alert_subscriptions')
      .update({ active: true })
      .eq('id', eksisterende.id);
  } else {
    const { data: ny, error } = await db
      .from('alert_subscriptions')
      .insert({ user_id: null, email: email.toLowerCase(), region, locale, active: true, confirmed_at: null })
      .select('confirm_token')
      .single();
    if (error || !ny) {
      log.error('varselpamelding.insert_feilet', { message: error?.message });
      return tilbake('feil');
    }
    confirmToken = ny.confirm_token as string;
  }

  const { emne, html, tekst } = byggBekreftelsesEpost({
    region,
    locale: locale as 'nb' | 'sv',
    bekreftUrl: `${appUrl}/api/soppvarsel/bekreft?t=${confirmToken}`
  });
  const res = await sendEpost({ til: email, emne, html, tekst });
  if (!res.ok) {
    log.error('varselpamelding.epost_feilet', { detalj: res.detalj });
    return tilbake('feil');
  }

  log.info('varselpamelding.bekreftelse_sendt', { region, locale });
  return tilbake('sendt');
}
