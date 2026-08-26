import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import {
  DELETE_MIGRATION_MISSING,
  MIGRATION_MISSING,
  isUuid,
  migrationMissingResponse
} from './soft-delete';

export const runtime = 'nodejs';

/**
 * DELETE /api/findings/:id — eieren sletter sitt eget funn.
 *
 * SOFT DELETE. Raden får `deleted_at` og forsvinner overalt der funn vises,
 * men den finnes i 30 dager til slik at slettingen kan angres (se
 * migrasjon 056 og /api/cron/purge-deleted-findings, som hard-sletter raden og
 * rydder bildet i Storage når fristen er ute).
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
  if (!user) return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });

  // Ugyldig UUID gir 22P02 fra Postgres og en 500 som ser ut som en serverfeil.
  if (!isUuid(id)) return NextResponse.json({ error: 'Ugyldig funn-id' }, { status: 400 });

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

  if (error?.code === MIGRATION_MISSING) {
    log.error('findings.delete.migration_missing', { code: error.code, message: error.message });
    return migrationMissingResponse(DELETE_MIGRATION_MISSING);
  }

  if (error) {
    log.error('findings.delete.failed', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Kunne ikke slette funnet' }, { status: 500 });
  }

  if (!data) {
    // Enten finnes funnet ikke, eller så er det ikke ditt, eller så er det
    // allerede slettet. Samme svar på alle tre: et 404 som skiller dem ville
    // fortalt en fremmed om en gitt funn-id finnes.
    return NextResponse.json({ error: 'Fant ikke funnet' }, { status: 404 });
  }

  log.info('findings.soft_deleted', { userId: user.id });
  return NextResponse.json({ ok: true, id: data.id });
}
