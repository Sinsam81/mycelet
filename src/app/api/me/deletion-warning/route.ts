import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRequestLogger } from '@/lib/log/request';
import { erManglendeTabell } from '@/lib/supabase/tabell-finnes';
import { apiFeil, loggFeil } from '@/lib/api/feil';

/**
 * Returns the current user's pending account-deletion warning, if any.
 *
 * Used by RetentionWarningBanner to render the in-app notice.
 *
 *   200 { warning: null }                          — no pending deletion
 *   200 { warning: { scheduledDeletionAt, ... } }  — deletion scheduled
 *   401                                            — not logged in
 *
 * Hits the table directly via the session client; RLS already restricts
 * SELECT to auth.uid() = user_id (migration 011), so no admin client.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return apiFeil('unauthenticated', 401);
  }

  const { data, error } = await supabase
    .from('account_deletion_warnings')
    .select('warned_at, scheduled_deletion_at')
    .eq('user_id', user.id)
    .maybeSingle();

  // Defensive: if migration 011 hasn't been applied yet, the table doesn't
  // exist. Treat as "no warning" so the banner stays hidden in that state
  // rather than crashing logged-in users.
  //
  // Sjekken lette før etter «relation … does not exist» i meldingen. Det er
  // Postgres' egen ordlyd (42P01), som bare kommer gjennom RPC-er og rå SQL.
  // PostgREST svarer PGRST205 «Could not find the table … in the schema
  // cache», så vakta kunne aldri slå til: en manglende tabell ville gitt 500
  // fra banneret på hver sidevisning. Koden avgjør, ikke teksten — se
  // tabell-finnes.ts.
  if (erManglendeTabell(error)) {
    return NextResponse.json({ warning: null });
  }
  if (error) {
    // Svaret var `error.message` rett til nettleseren, og feilen ble ikke
    // logget noe sted. Nå er det omvendt.
    loggFeil(createRequestLogger(request).child({ userId: user.id }), 'me.deletion_warning.read_failed', error);
    return apiFeil('unexpected', 500);
  }

  if (!data) {
    return NextResponse.json({ warning: null });
  }

  return NextResponse.json({
    warning: {
      warnedAt: data.warned_at,
      scheduledDeletionAt: data.scheduled_deletion_at
    }
  });
}
