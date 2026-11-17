import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { brukerJitter } from '@/lib/findings/delingsendring';
import { JITTERVAKT_TILTAK, flyttetUtenGrunn, meldJitterVaktMangler, type Stempling } from '@/lib/findings/jittervakt';
import { funnFeilSvar, migrasjonManglerSvar } from '../../svar';
import { erManglendeKolonne, isUuid } from '../soft-delete';

export const runtime = 'nodejs';

/** Det snubletråden sammenligner før og etter. Går ALDRI ut i svaret. */
const STEMPLING_KOLONNER = 'visibility, is_zone_finding, zone_precision_km, display_latitude, display_longitude';

interface GjenopprettetRad extends Stempling {
  id: string;
}

/**
 * POST /api/findings/:id/restore — angre en sletting.
 *
 * Dette er hele grunnen til at slettingen er myk. Ruta virker så lenge raden
 * finnes — altså i de 30 dagene før /api/cron/purge-deleted-findings rydder
 * den. To flater kaller hit: angreknappen i slette-varselet (noen sekunder),
 * og «Nylig slettet» nederst på /mine-steder, som viser funnene hele fristen.
 * Fram til den lista kom, var de 30 dagene bare nåbare gjennom en
 * support-henvendelse.
 *
 * MERK at gjenopprettingen ikke rører display_latitude/longitude. Vakten i
 * migrasjon 042 holder dem frosne så lenge verken posisjon, synlighet eller
 * sone-innstilling endres — og deleted_at er ingen av delene. Uten den vakten
 * ville slett → angre → slett → angre gitt et nytt jitter-punkt hver runde, og
 * gjennomsnittet av dem peker mot det eksakte voksestedet.
 *
 * Den påstanden blir nå KONTROLLERT, ikke bare hevdet: ruta leser punktet før
 * gjenopprettingen og sammenligner etterpå (jittervakt.ts). Med «Nylig
 * slettet» er slett → angre blitt en vanlig ting å gjøre, så en manglende 042
 * skal ikke kunne gå ubemerket. Kontrollen er etter beste evne og stopper
 * aldri en gjenoppretting: et funn brukeren vil ha tilbake, skal tilbake.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const { id } = await context.params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return funnFeilSvar('unauthenticated', 401);

  if (!isUuid(id)) return funnFeilSvar('invalid_id', 400);

  const rateLimit = checkRateLimit(`finding-restore:${getClientKey(request, user.id)}`, 30, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  // Punktet slik det står FØR gjenopprettingen. Feiler oppslaget, hopper vi
  // over kontrollen — selve gjenopprettingen under avgjør hva brukeren får.
  let foer: Stempling | null = null;
  try {
    const { data: lest } = await supabase
      .from('findings')
      .select(STEMPLING_KOLONNER)
      .eq('id', id)
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)
      .maybeSingle();
    foer = (lest as unknown as Stempling | null) ?? null;
  } catch {
    foer = null;
  }

  const { data: skrevet, error } = await supabase
    .from('findings')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', user.id)
    // Bare rader som FAKTISK er slettet. Et aktivt funn skal ikke kunne
    // «gjenopprettes» — da hadde ruta vært en skjult skrivevei mot hvilken som
    // helst av eierens rader.
    .not('deleted_at', 'is', null)
    .select(`id, ${STEMPLING_KOLONNER}`)
    .maybeSingle();
  const data = skrevet as unknown as GjenopprettetRad | null;

  if (erManglendeKolonne(error)) {
    log.error('findings.restore.migration_missing', { code: error?.code, message: error?.message });
    return migrasjonManglerSvar('restore_migration_missing');
  }

  if (error) {
    log.error('findings.restore.failed', { code: error.code, message: error.message });
    return funnFeilSvar('restore_failed', 500);
  }

  if (!data) {
    return funnFeilSvar('not_found', 404);
  }

  if (foer && brukerJitter(foer) && flyttetUtenGrunn(foer, data)) {
    meldJitterVaktMangler();
    log.error('findings.jitter_guard_missing', {
      flate: 'restore',
      tiltak: JITTERVAKT_TILTAK
    });
  }

  log.info('findings.restored', { userId: user.id });
  return NextResponse.json({ ok: true, id: data.id });
}
