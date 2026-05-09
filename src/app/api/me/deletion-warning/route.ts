import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
export async function GET() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('account_deletion_warnings')
    .select('warned_at, scheduled_deletion_at')
    .eq('user_id', user.id)
    .maybeSingle();

  // Defensive: if migration 011 hasn't been applied yet, the table doesn't
  // exist. Treat as "no warning" so the banner stays hidden in that state
  // rather than crashing logged-in users.
  if (error && /relation .* does not exist/i.test(error.message)) {
    return NextResponse.json({ warning: null });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
