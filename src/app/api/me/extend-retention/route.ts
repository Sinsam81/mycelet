import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * Extend retention — clears the user's row in account_deletion_warnings.
 *
 * Called when a user with a pending deletion warning logs in or clicks
 * "Behold kontoen min" in the warning banner. Authenticated users can
 * also drop the warning indirectly by simply logging in (the cron job
 * removes warnings whose user has signed in since `warned_at`), but
 * this endpoint gives the UI an explicit lever — the user clicks a
 * button and gets immediate confirmation.
 *
 * RLS already permits "Users can clear own deletion warning" so we
 * don't need the admin client here.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const userLog = log.child({ userId: user.id });

  const rateLimit = checkRateLimit(`me-extend-retention:${getClientKey(request, user.id)}`, 10, 60);
  if (!rateLimit.allowed) {
    userLog.warn('me.extend_retention.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  // Returns whether a row was actually deleted so the UI can show the
  // right toast — "kontoen din var ikke i fare" vs "vi har avbrutt
  // sletting av kontoen din".
  const { data, error } = await supabase
    .from('account_deletion_warnings')
    .delete()
    .eq('user_id', user.id)
    .select('user_id');

  if (error) {
    userLog.error('me.extend_retention.delete_failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cleared = (data ?? []).length > 0;
  userLog.info('me.extend_retention.success', { cleared });

  return NextResponse.json({
    ok: true,
    cleared,
    message: cleared
      ? 'Sletting av kontoen din er avbrutt.'
      : 'Kontoen din var ikke planlagt slettet — ingen handling nødvendig.'
  });
}
