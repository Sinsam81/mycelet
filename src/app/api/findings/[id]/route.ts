import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { parseFindingPatch } from '@/lib/findings/request';
import {
  SONE_OMGJORING_AAPEN,
  brukerJitter,
  planleggFunnEndring,
  type FunnForEndring
} from '@/lib/findings/delingsendring';
import {
  JITTERVAKT_TILTAK,
  flyttetUtenGrunn,
  jitterVaktMangler,
  meldJitterVaktMangler,
  type Stempling
} from '@/lib/findings/jittervakt';
import { delingKaranteneSvar, funnFeilSvar, migrasjonManglerSvar } from '../svar';
import { erManglendeKolonne, isUuid } from './soft-delete';

export const runtime = 'nodejs';

/** Postgres: foreign_key_violation. Her: species_id peker på en art som ikke finnes. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Det PATCH leser før den skriver. display_* er med for snubletråden
 * (jittervakt.ts) og går ALDRI ut i svaret.
 */
const ENDRE_KOLONNER =
  'id, visibility, is_zone_finding, zone_label, zone_precision_km, species_id, species_name_override, notes, created_at, updated_at, display_latitude, display_longitude';

/** Det PATCH ber om tilbake fra skrivingen — nok til snubletråden, ikke mer. */
const ETTER_KOLONNER = 'id, visibility, is_zone_finding, zone_precision_km, display_latitude, display_longitude';

interface EndreRad extends FunnForEndring {
  id: string;
  display_latitude: number | null;
  display_longitude: number | null;
}

interface EtterRad extends Stempling {
  id: string;
}

/**
 * PATCH /api/findings/:id — eieren endrer deling, art eller notat på sitt
 * eget funn.
 *
 * Før denne fantes kunne et funn som var lagret med feil delingsnivå bare
 * slettes og lagres på nytt — og da gikk funntidspunktet, bildet og vær- og
 * habitatøyeblikksbildet tapt. Det vanligste tilfellet er også det viktigste:
 * et kantarellsted delt av gammel vane, som skal bli privat.
 *
 * LES – SAMMENLIGN – SKRIV, i den rekkefølgen, av tre grunner:
 *  1. En endring som ikke endrer noe, skal aldri nå databasen. Hver UPDATE
 *     setter updated_at, og det er klokka delingskarantenen leser.
 *  2. Planleggeren må kjenne radens nåværende deling for å avgjøre om
 *     endringen legger ut et nytt punkt — eller en sone-rute som ikke er
 *     trygg å legge ut. Reglene og begrunnelsen står i
 *     src/lib/findings/delingsendring.ts.
 *  3. display_* før og etter er det eneste som kan avsløre at vakten i
 *     migrasjon 042 mangler (jittervakt.ts).
 *
 * Posisjonen kan ikke endres her — parseFindingPatch avviser alt utenfor
 * hvitelista. Svaret inneholder verken notat eller koordinater.
 *
 * Eierskap håndheves to steder, som i DELETE under: RLS-policyen «Brukere kan
 * oppdatere egne funn» er den som gjelder, `.eq('user_id', user.id)` er beltet.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const { id } = await context.params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return funnFeilSvar('unauthenticated', 401);

  if (!isUuid(id)) return funnFeilSvar('invalid_id', 400);

  const parsed = parseFindingPatch(await request.json().catch(() => null));

  // Å gjøre et funn privat skal ALLTID virke. Derfor har det sin egen, romslige
  // bøtte: verken en bruker som har rettet mange notater på rad eller en
  // karantene kan stå i veien for å skjule et sted.
  const klient = getClientKey(request, user.id);
  const tilPrivat = parsed.success && parsed.data.deling?.visibility === 'private';
  const rateLimit = tilPrivat
    ? checkRateLimit(`finding-private:${klient}`, 120, 60)
    : checkRateLimit(`finding-patch:${klient}`, 30, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  if (!parsed.success) {
    return funnFeilSvar(parsed.code, 400, parsed.field ? { field: parsed.field } : {});
  }

  const { data: foer, error: leseFeil } = await supabase
    .from('findings')
    .select(ENDRE_KOLONNER)
    .eq('id', id)
    .eq('user_id', user.id)
    // Et slettet funn kan ikke endres. Det må gjenopprettes først.
    .is('deleted_at', null)
    .maybeSingle();

  if (erManglendeKolonne(leseFeil)) {
    log.error('findings.patch.migration_missing', { code: leseFeil?.code, message: leseFeil?.message });
    return migrasjonManglerSvar('update_migration_missing');
  }
  if (leseFeil) {
    log.error('findings.patch.read_failed', { code: leseFeil.code, message: leseFeil.message });
    return funnFeilSvar('update_failed', 500);
  }
  if (!foer) {
    // Finnes ikke, er ikke ditt, eller er slettet — samme svar på alle tre.
    return funnFeilSvar('not_found', 404);
  }

  const rad = foer as unknown as EndreRad;
  const naaMs = Date.now();
  const plan = planleggFunnEndring(rad, parsed.data, naaMs, SONE_OMGJORING_AAPEN);

  if (plan.type === 'uendret') {
    return NextResponse.json({ ok: true, id: rad.id, unchanged: true });
  }

  if (plan.type === 'sone-stengt') {
    log.info('findings.patch.zone_refused', { userId: user.id, grunn: plan.grunn });
    // Omgjøringen åpner når migrasjon 075 er bekreftet kjørt: «ikke ennå», som
    // en manglende migrasjon. Rutestørrelsen er en regel, ikke en tilstand.
    return plan.grunn === 'omgjoring'
      ? funnFeilSvar('zone_unavailable', 503)
      : funnFeilSvar('zone_size_locked', 400, { field: 'zonePrecisionKm' });
  }

  if (plan.type === 'karantene') {
    log.info('findings.patch.sharing_cooldown', { userId: user.id });
    return delingKaranteneSvar(plan.tidligstMs, naaMs);
  }

  // Endrer denne oppdateringen delingen, stemples display_* uansett på nytt —
  // det er meningen. Gjør den det IKKE, og funnet står med et tilfeldig punkt,
  // er det vakten i 042 som holder punktet i ro. Har denne instansen sett at
  // vakten mangler, skrives det ikke.
  const skalStaaIRo = !plan.restempler && brukerJitter(rad);
  if (skalStaaIRo && jitterVaktMangler()) {
    log.error('findings.patch.blocked_guard_missing', { userId: user.id });
    return funnFeilSvar('guard_missing', 503);
  }

  const { data: skrevet, error } = await supabase
    .from('findings')
    .update(plan.verdier)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select(ETTER_KOLONNER)
    .maybeSingle();
  const etter = skrevet as unknown as EtterRad | null;

  if (error?.code === FOREIGN_KEY_VIOLATION) {
    return funnFeilSvar('unknown_species', 400, { field: 'speciesId' });
  }
  if (erManglendeKolonne(error)) {
    log.error('findings.patch.migration_missing', { code: error?.code, message: error?.message });
    return migrasjonManglerSvar('update_migration_missing');
  }
  if (error) {
    log.error('findings.patch.failed', { code: error.code, message: error.message });
    return funnFeilSvar('update_failed', 500);
  }
  if (!etter) {
    // Slettet mellom lesingen og skrivingen.
    return funnFeilSvar('not_found', 404);
  }

  if (skalStaaIRo && flyttetUtenGrunn(rad, etter)) {
    meldJitterVaktMangler();
    log.error('findings.jitter_guard_missing', {
      flate: 'patch',
      tiltak: JITTERVAKT_TILTAK
    });
  }

  // Feltnavn og nivåer, aldri innhold: notatet er fritekst og kan være privat.
  log.info('findings.updated', {
    userId: user.id,
    felt: Object.keys(plan.verdier),
    fra: plan.fra,
    til: plan.til,
    nyttJitter: plan.nyttJitter
  });
  return NextResponse.json({ ok: true, id: etter.id, sharing: plan.til });
}

/**
 * DELETE /api/findings/:id — eieren sletter sitt eget funn.
 *
 * SOFT DELETE. Raden får `deleted_at` og forsvinner overalt der funn vises,
 * men den finnes i 30 dager til slik at slettingen kan angres (se
 * migrasjon 056 og /api/cron/purge-deleted-findings, som hard-sletter raden og
 * rydder bildet i Storage når fristen er ute). I den tida står funnet under
 * «Nylig slettet» på /mine-steder.
 *
 * Hvorfor bildet IKKE ryddes her: angrer brukeren, skal funnet komme tilbake
 * med bildet sitt. Ryddet vi nå, ville angreknappen gitt et funn med en død
 * bilde-URL — som ser ut som at appen mistet bildet.
 *
 * Eierskap håndheves to steder med vilje: RLS-policyen «Brukere kan slette
 * egne funn» (001:333, UPDATE-varianten på linja over) er den som gjelder, og
 * `.eq('user_id', user.id)` her er beltet. Faller RLS ut ved en framtidig
 * policy-endring, står filteret igjen.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const { id } = await context.params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return funnFeilSvar('unauthenticated', 401);

  // Ugyldig UUID gir 22P02 fra Postgres og en 500 som ser ut som en serverfeil.
  if (!isUuid(id)) return funnFeilSvar('invalid_id', 400);

  const rateLimit = checkRateLimit(`finding-delete:${getClientKey(request, user.id)}`, 30, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { data, error } = await supabase
    .from('findings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    // Allerede slettet → ingen rad tilbake → 404. Uten dette ville et dobbelt
    // klikk flyttet fristen 30 dager fram hver gang.
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (erManglendeKolonne(error)) {
    log.error('findings.delete.migration_missing', { code: error?.code, message: error?.message });
    return migrasjonManglerSvar('delete_migration_missing');
  }

  if (error) {
    log.error('findings.delete.failed', { code: error.code, message: error.message });
    return funnFeilSvar('delete_failed', 500);
  }

  if (!data) {
    // Enten finnes funnet ikke, eller så er det ikke ditt, eller så er det
    // allerede slettet. Samme svar på alle tre: et 404 som skiller dem ville
    // fortalt en fremmed om en gitt funn-id finnes.
    return funnFeilSvar('not_found', 404);
  }

  log.info('findings.soft_deleted', { userId: user.id });
  return NextResponse.json({ ok: true, id: data.id });
}
