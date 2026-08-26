import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { getUserLocale } from '@/i18n/locale';
import {
  MAKS_NAVN,
  MAKS_STEDER_PER_BRUKER,
  MAKS_VEIPUNKTER,
  renseTekst,
  skillDuplikater,
  validerVeipunkt,
  type ValidertVeipunkt
} from '@/lib/steder/veipunkt';

/**
 * Brukerens egne markerte steder: importer, gi nytt navn, slett.
 *
 * ── HVA RUTA ALDRI GJØR ─────────────────────────────────────────────────────
 *
 * Den parser ikke XML. GPX-fila leses i nettleseren (src/lib/gpx/les-gpx.ts),
 * og hit kommer bare ferdig JSON. Det er hele grunnen til at importen ikke
 * åpner en XML-angrepsflate på serveren — se filhodet i les-gpx.ts.
 *
 * ── HVORFOR ALT VALIDERES PÅ NYTT ───────────────────────────────────────────
 *
 * Klienten er ikke en del av sikkerhetsmodellen. Den samme JSON-en kan sendes
 * rett hit med hvilke som helst verdier, uten at noen fil har vært innom.
 * validerVeipunkt plukker derfor ut nøyaktig de fem feltene vi lagrer og
 * ignorerer resten — en `user_id` i kroppen skal ikke kunne følge med inn.
 *
 * Skriver med SESJONSKLIENTEN, aldri admin: RLS på saved_places (migrasjon
 * 055) er fasiten for hvem som eier hvilken rad. En rute som går utenom RLS med
 * en id fra forespørselen er nettopp mønsteret som lager hull.
 */

export const runtime = 'nodejs';

/**
 * 500 punkter er ~350 kB JSON. Taket her stopper en kropp som aldri kunne vært
 * en gyldig import, før den i det hele tatt blir en streng i minnet.
 */
const MAKS_KROPP_BYTES = 1_000_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres: raise exception fra en trigger — her taket i migrasjon 055. */
const RAISE_EXCEPTION = 'P0001';

async function krevBruker() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const { supabase, user } = await krevBruker();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  // Importen er en sjelden handling. 5 i timen er romslig for en bruker som
  // prøver seg fram med to-tre filer, og trangt for alt annet.
  const rl = checkRateLimit(`steder-import:${getClientKey(request, user.id)}`, 5, 3600);
  if (!rl.allowed) return rateLimitResponse(rl);

  const lengde = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(lengde) && lengde > MAKS_KROPP_BYTES) {
    return NextResponse.json({ error: 'Fila er for stor' }, { status: 413 });
  }

  const kropp = (await request.json().catch(() => null)) as
    | { punkter?: unknown; filnavn?: unknown }
    | null;
  const rå = Array.isArray(kropp?.punkter) ? kropp.punkter : null;
  if (!rå) return NextResponse.json({ error: 'Mangler punkter' }, { status: 400 });
  if (rå.length === 0) return NextResponse.json({ error: 'Ingen steder å importere' }, { status: 400 });
  if (rå.length > MAKS_VEIPUNKTER) {
    return NextResponse.json(
      { error: `Maks ${MAKS_VEIPUNKTER} steder per import`, maks: MAKS_VEIPUNKTER },
      { status: 400 }
    );
  }

  const locale = await getUserLocale();
  const reserve = locale === 'sv' ? 'Plats' : 'Sted';
  const validerte: ValidertVeipunkt[] = [];
  for (const [i, punkt] of rå.entries()) {
    const gyldig = validerVeipunkt(punkt, `${reserve} ${i + 1}`);
    if (gyldig) validerte.push(gyldig);
  }
  const avvist = rå.length - validerte.length;
  if (validerte.length === 0) {
    return NextResponse.json({ error: 'Ingen av punktene var gyldige', avvist }, { status: 400 });
  }

  // Duplikatsjekken gjøres på nytt her, mot ALLE stedene brukeren har — ikke
  // bare mot dem klienten tilfeldigvis hadde lastet. To importer av samme fil
  // rett etter hverandre skal ikke gi to sett med nåler.
  const { data: eksisterende, error: lesefeil } = await supabase
    .from('saved_places')
    .select('latitude, longitude')
    .eq('user_id', user.id)
    .limit(MAKS_STEDER_PER_BRUKER);

  if (lesefeil) {
    log.error('steder.les_eksisterende_feilet', { message: lesefeil.message });
    return NextResponse.json({ error: 'Kunne ikke lese stedene dine' }, { status: 500 });
  }

  const fraFør = (eksisterende ?? []) as { latitude: number; longitude: number }[];
  const { nye, duplikater } = skillDuplikater(validerte, fraFør);

  if (nye.length === 0) {
    return NextResponse.json({
      importert: 0,
      hoppetOver: duplikater.length,
      avvist,
      batchId: null
    });
  }

  // Plassen sjekkes FØR innsettingen. Triggeren i 055 ville stoppet oss
  // uansett, men da med en rå Postgres-feil og uten å kunne si hvor mange som
  // fikk plass — og en halv import brukeren ikke ba om.
  const plass = MAKS_STEDER_PER_BRUKER - fraFør.length;
  if (nye.length > plass) {
    return NextResponse.json(
      {
        error: 'Ikke plass til alle stedene',
        plass: Math.max(0, plass),
        maks: MAKS_STEDER_PER_BRUKER,
        ønsket: nye.length
      },
      { status: 409 }
    );
  }

  const batchId = crypto.randomUUID();
  const filnavn = renseTekst(kropp?.filnavn, 200);
  const rader = nye.map((punkt) => ({
    user_id: user.id,
    name: punkt.name,
    note: punkt.note,
    latitude: punkt.latitude,
    longitude: punkt.longitude,
    waypoint_time: punkt.waypointTime,
    source: 'gpx_import' as const,
    source_file: filnavn,
    import_batch_id: batchId
  }));

  const { data, error } = await supabase.from('saved_places').insert(rader).select('id');

  if (error) {
    // Taket kan fortsatt slå til her hvis brukeren importerer i to faner
    // samtidig — plass-sjekken over er ikke en lås.
    if (error.code === RAISE_EXCEPTION) {
      return NextResponse.json(
        { error: 'Ikke plass til alle stedene', maks: MAKS_STEDER_PER_BRUKER },
        { status: 409 }
      );
    }
    log.error('steder.import_feilet', { code: error.code, message: error.message, antall: rader.length });
    return NextResponse.json({ error: 'Kunne ikke lagre stedene' }, { status: 500 });
  }

  // Ingen navn eller notater i loggen: dette er hemmelige soppsteder.
  log.info('steder.importert', {
    importert: data?.length ?? 0,
    hoppetOver: duplikater.length,
    avvist
  });

  return NextResponse.json({
    importert: data?.length ?? 0,
    hoppetOver: duplikater.length,
    avvist,
    batchId
  });
}

/** Gi et sted nytt navn. */
export async function PATCH(request: NextRequest) {
  const log = createRequestLogger(request);
  const { supabase, user } = await krevBruker();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  const rl = checkRateLimit(`steder-endre:${getClientKey(request, user.id)}`, 60, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const kropp = (await request.json().catch(() => null)) as { id?: unknown; name?: unknown } | null;
  const id = typeof kropp?.id === 'string' && UUID.test(kropp.id) ? kropp.id : null;
  const navn = renseTekst(kropp?.name, MAKS_NAVN);
  if (!id) return NextResponse.json({ error: 'Ugyldig sted' }, { status: 400 });
  if (!navn) return NextResponse.json({ error: 'Stedet må ha et navn' }, { status: 400 });

  const { data, error } = await supabase
    .from('saved_places')
    .update({ name: navn })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id');

  if (error) {
    log.error('steder.endre_feilet', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Kunne ikke endre navnet' }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: 'Fant ikke stedet' }, { status: 404 });

  return NextResponse.json({ ok: true, name: navn });
}

/**
 * Slett ett sted (?id=) eller hele en import (?batch=).
 *
 * Angreknappen er ikke pynt: den er forutsetningen for at importen er
 * forsvarlig i det hele tatt. Uten den ville en feilimport vært like permanent
 * som funn er i dag — se docs/gpx-import-design.md, punkt 2a.
 */
export async function DELETE(request: NextRequest) {
  const log = createRequestLogger(request);
  const { supabase, user } = await krevBruker();
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });

  const rl = checkRateLimit(`steder-slett:${getClientKey(request, user.id)}`, 60, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const id = request.nextUrl.searchParams.get('id');
  const batch = request.nextUrl.searchParams.get('batch');
  const gyldigId = id && UUID.test(id) ? id : null;
  const gyldigBatch = batch && UUID.test(batch) ? batch : null;
  if (!gyldigId && !gyldigBatch) {
    return NextResponse.json({ error: 'Ugyldig sted' }, { status: 400 });
  }

  let spørring = supabase.from('saved_places').delete().eq('user_id', user.id);
  spørring = gyldigId ? spørring.eq('id', gyldigId) : spørring.eq('import_batch_id', gyldigBatch!);

  const { data, error } = await spørring.select('id');

  if (error) {
    log.error('steder.slett_feilet', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Kunne ikke slette' }, { status: 500 });
  }

  log.info('steder.slettet', { antall: data?.length ?? 0, helBatch: Boolean(gyldigBatch) });
  return NextResponse.json({ slettet: data?.length ?? 0 });
}
