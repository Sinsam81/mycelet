import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import {
  MIGRATION_MISSING,
  RESTORE_MIGRATION_MISSING,
  isUuid,
  migrationMissingResponse
} from '../soft-delete';

export const runtime = 'nodejs';

/**
 * POST /api/findings/:id/restore — angre en sletting.
 *
 * Dette er hele grunnen til at slettingen er myk. Angreknappen i kartets
 * slette-varsel kaller hit, og ruta virker så lenge raden finnes — altså i de
 * 30 dagene før /api/cron/purge-deleted-findings rydder den. Det er med vilje
 * romsligere enn de sekundene varselet står: en bruker som fortsatt har fanen
 * åpen skal komme tilbake til funnet sitt, og en support-henvendelse innen
 * fristen kan besvares.
 *
 * MERK at gjenopprettingen ikke rører display_latitude/longitude. Vakten i
 * migrasjon 042 holder dem frosne så lenge verken posisjon, synlighet eller
 * sone-innstilling endres — og deleted_at er ingen av delene. Uten den vakten
 * ville slett → angre → slett → angre gitt et nytt jitter-punkt hver runde, og
 * gjennomsnittet av dem peker mot det eksakte voksestedet.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const { id } = await context.params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });

  if (!isUuid(id)) return NextResponse.json({ error: 'Ugyldig funn-id' }, { status: 400 });

  const rateLimit = checkRateLimit(`finding-restore:${getClientKey(request, user.id)}`, 30, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { data, error } = await supabase
    .from('findings')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', user.id)
    // Bare rader som FAKTISK er slettet. Et aktivt funn skal ikke kunne
    // «gjenopprettes» — da hadde ruta vært en skjult skrivevei mot hvilken som
    // helst av eierens rader.
    .not('deleted_at', 'is', null)
    .select('id')
    .maybeSingle();

  if (error?.code === MIGRATION_MISSING) {
    log.error('findings.restore.migration_missing', { code: error.code, message: error.message });
    return migrationMissingResponse(RESTORE_MIGRATION_MISSING);
  }

  if (error) {
    log.error('findings.restore.failed', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Kunne ikke gjenopprette funnet' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Fant ikke funnet' }, { status: 404 });
  }

  log.info('findings.restored', { userId: user.id });
  return NextResponse.json({ ok: true, id: data.id });
}
