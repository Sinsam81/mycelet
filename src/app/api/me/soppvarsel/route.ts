import { NextRequest, NextResponse } from 'next/server';
import { normaliserKilde } from '@/lib/analytics/kilde';
import { createClient } from '@/lib/supabase/server';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { getUserLocale } from '@/i18n/locale';

/**
 * Brukerens eget soppvarsel: les, slå på, slå av.
 *
 * Leser og skriver med SESJONSKLIENTEN, ikke admin — RLS på
 * alert_subscriptions er fasiten for hvem som eier hvilken rad, og en rute som
 * går utenom RLS med en user_id fra forespørselen er nettopp mønsteret som
 * lager hull. Se migrasjon 051 for policyene.
 */

export const runtime = 'nodejs';

/** Regionnavnene er kodens, ikke databasens. Valider mot lista. */
const GYLDIGE_REGIONER = new Set(PREDICTION_TILE_REGIONS.map((r) => r.name));

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  // Tabellen tillater flere regioner per bruker (unique er user_id+region), men
  // grensesnittet tilbyr ett område i denne omgang. Derfor limit(1) og ikke
  // maybeSingle() alene: maybeSingle FEILER på to rader, og en bruker som har
  // byttet område ville da fått en 500 i stedet for varselet sitt.
  const { data, error } = await supabase
    .from('alert_subscriptions')
    .select('region,active,last_notified_at')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    createRequestLogger(request).error('soppvarsel.les_feilet', { message: error.message });
    return NextResponse.json({ error: 'Kunne ikke hente varselet' }, { status: 500 });
  }

  return NextResponse.json({
    abonnement: data ?? null,
    regioner: PREDICTION_TILE_REGIONS.map((r) => ({ navn: r.name, land: r.country }))
  });
}

export async function PUT(request: NextRequest) {
  const log = createRequestLogger(request);
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  const rl = checkRateLimit(`soppvarsel:${getClientKey(request, user.id)}`, 20, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = (await request.json().catch(() => null)) as { region?: unknown; active?: unknown } | null;
  const region = typeof body?.region === 'string' ? body.region : null;
  const active = body?.active !== false;

  if (!region || !GYLDIGE_REGIONER.has(region)) {
    return NextResponse.json({ error: 'Ukjent område' }, { status: 400 });
  }

  // Språket lagres nå, mens vi har forespørselen. Cron-jobben kan aldri se
  // MYCELET_LOCALE-cookien — den kjører uten en bruker. Se migrasjon 051.
  const locale = (await getUserLocale()) === 'sv' ? 'sv' : 'nb';

  // ⚠️ Slå av de andre først. En upsert alene ville lagt til en NY rad når
  // brukeren bytter område — unique er (user_id, region) — og da hadde hen fått
  // varsler for både Oslo og Bergen etter å ha «byttet» fra det ene til det
  // andre. Ett aktivt område om gangen er det grensesnittet lover.
  const kontoKilde = normaliserKilde(user.user_metadata?.kilde);

  const { error: avErr } = await supabase
    .from('alert_subscriptions')
    .update({ active: false })
    .eq('user_id', user.id)
    .neq('region', region);
  if (avErr) {
    log.error('soppvarsel.deaktivering_feilet', { message: avErr.message });
    return NextResponse.json({ error: 'Kunne ikke lagre varselet' }, { status: 500 });
  }

  const { error } = await supabase
    .from('alert_subscriptions')
    // Kilden følger kontoen (user_metadata.kilde, satt ved registrering), så
    // rapporten kan se konto- og e-postabonnenter i samme trakt.
    .upsert(
      { user_id: user.id, region, locale, active, ...(kontoKilde ? { kilde: kontoKilde } : {}) },
      { onConflict: 'user_id,region' }
    );

  if (error) {
    log.error('soppvarsel.lagring_feilet', { message: error.message });
    return NextResponse.json({ error: 'Kunne ikke lagre varselet' }, { status: 500 });
  }

  log.info('soppvarsel.lagret', { region, active });
  return NextResponse.json({ ok: true, region, active });
}
