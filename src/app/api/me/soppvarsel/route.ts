import { NextRequest, NextResponse } from 'next/server';
import { normaliserKilde } from '@/lib/analytics/kilde';
import { adopterKontolosVarsler } from '@/lib/alerts/adopsjon';
import { FOLG_OMRADE_KILDE } from '@/lib/alerts/folg-omrade';
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

/**
 * Flater som har lov til å oppgi sin egen kilde på raden. En allisteliste, ikke
 * fri tekst: verdien ender i dagsrapportens varseltrakt.
 */
const GYLDIGE_KILDER = new Set<string>([FOLG_OMRADE_KILDE]);

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  // Kontoløse påmeldinger på brukerens egen adresse overtas her, FØR lesingen —
  // ellers svarer ruta «følger ingenting» til noen som har vært abonnent siden
  // før kontoen fantes, og forsiden spør om det på nytt. Se adopsjon.ts.
  await adopterKontolosVarsler({ brukerId: user.id, brukerEpost: user.email, log });

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
    log.error('soppvarsel.les_feilet', { message: error.message });
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

  const body = (await request.json().catch(() => null)) as
    | { region?: unknown; active?: unknown; kilde?: unknown }
    | null;
  const region = typeof body?.region === 'string' ? body.region : null;
  const active = body?.active !== false;
  // Flatens egen kilde («hjem-ett-trykk»), bare når den står på allistelista.
  const flateKilde = typeof body?.kilde === 'string' && GYLDIGE_KILDER.has(body.kilde) ? body.kilde : null;

  if (!region || !GYLDIGE_REGIONER.has(region)) {
    return NextResponse.json({ error: 'Ukjent område' }, { status: 400 });
  }

  // Samme adopsjon som ved lesing, og den må skje FØR avslåingen under: en
  // adoptert rad for et ANNET område skal følge regelen om ett aktivt område om
  // gangen, ikke bli liggende igjen som et andre abonnement.
  await adopterKontolosVarsler({ brukerId: user.id, brukerEpost: user.email, log });

  // Språket lagres nå, mens vi har forespørselen. Cron-jobben kan aldri se
  // MYCELET_LOCALE-cookien — den kjører uten en bruker. Se migrasjon 051.
  const locale = (await getUserLocale()) === 'sv' ? 'sv' : 'nb';

  // Første kilde vinner — som for kilde-cookien. Uten dette ville et nytt trykk
  // på en gammel rad skrevet om hvor abonnementet kom fra.
  const kontoKilde = normaliserKilde(user.user_metadata?.kilde);
  const { data: egenRad } = await supabase
    .from('alert_subscriptions')
    .select('kilde')
    .eq('user_id', user.id)
    .eq('region', region)
    .maybeSingle();
  const kilde = normaliserKilde(egenRad?.kilde) ?? flateKilde ?? kontoKilde;

  // ⚠️ Slå av de andre først. En upsert alene ville lagt til en NY rad når
  // brukeren bytter område — unique er (user_id, region) — og da hadde hen fått
  // varsler for både Oslo og Bergen etter å ha «byttet» fra det ene til det
  // andre. Ett aktivt område om gangen er det grensesnittet lover.
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
    // Kilden er flatens egen når den oppgir en («hjem-ett-trykk» fra stripa i
    // forsidekortet), ellers kontoens (user_metadata.kilde, satt ved
    // registrering), så rapporten kan se konto- og e-postabonnenter i samme
    // trakt — og hvilken flate som faktisk skaffet abonnementet.
    .upsert(
      { user_id: user.id, region, locale, active, ...(kilde ? { kilde } : {}) },
      { onConflict: 'user_id,region' }
    );

  if (error) {
    log.error('soppvarsel.lagring_feilet', { message: error.message });
    return NextResponse.json({ error: 'Kunne ikke lagre varselet' }, { status: 500 });
  }

  log.info('soppvarsel.lagret', { region, active });
  return NextResponse.json({ ok: true, region, active });
}
