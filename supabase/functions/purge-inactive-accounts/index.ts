// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { requireServiceRole } from '../_shared/auth.ts';

/**
 * Cron Edge Function — Daily 03:00 Europe/Oslo
 *
 * Implements the inactive-account half of docs/retention-policy.md:
 *
 *   1. Find users where last_sign_in_at < NOW() - 3 years AND no
 *      pending warning row. INSERT a warning with scheduled_deletion_at
 *      90 days from now.
 *      (E-mail-sending is a TODO — the warning_email_sent flag stays
 *      FALSE until Sindre wires up Resend/Postmark.)
 *
 *   2. Find users with a warning whose user has signed in since the
 *      warning was issued. Delete the warning row.
 *
 *   3. Find users with a warning whose scheduled_deletion_at has
 *      passed. Hard-delete the auth.users row. FK cascades trigger:
 *        - profiles deleted
 *        - findings/forum_posts/comments user_id → NULL (anonymized)
 *        - post_likes/saved_posts/reports cascade-deleted
 *
 *      NB: positive findings and private negative findings are NOT
 *      deleted by this path — they survive as orphan rows with
 *      user_id = NULL. This is a deliberate gap because Edge Functions
 *      can't replicate the explicit-delete-before-cascade logic in
 *      /api/me/delete easily; the inactive-account flow has different
 *      privacy semantics (the user never showed up to consent to
 *      anonymization vs deletion). Sindre to decide if we want a
 *      separate cron-side cleanup. For now: anonymized survival is
 *      strictly more privacy-preserving than the user's data being
 *      deleted, since the rows already have display-jittered coords.
 *
 * Returns a JSON receipt with per-step counts. Logs are emitted via
 * console.log which Supabase forwards to its function-logs page.
 *
 * Invoke via:
 *   curl -X POST $SUPABASE_URL/functions/v1/purge-inactive-accounts \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
 *
 * Schedule via Supabase Studio → Functions → "Schedules" tab, or via
 * an external scheduler. See docs/edge-functions-setup.md.
 */

const INACTIVE_THRESHOLD_DAYS = 365 * 3; // 3 years
const GRACE_PERIOD_DAYS = 90;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = requireServiceRole(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const now = new Date();
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const scheduledDeletion = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  let issuedWarnings = 0;
  let clearedWarnings = 0;
  let deletedAccounts = 0;
  const errors: string[] = [];

  // ---- Step 1: issue new warnings ---------------------------------
  // We must read auth.users via the admin API. listUsers paginates
  // 1000 per page; for a small beta DB this is sufficient. If user
  // count grows past ~50k, switch to per-page processing.
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    errors.push(`listUsers: ${listError.message}`);
  } else {
    const candidates = (usersPage?.users ?? []).filter((u: any) => {
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      return lastSignIn && lastSignIn < inactiveCutoff;
    });

    if (candidates.length > 0) {
      // Find which of these already have a warning so we don't duplicate.
      const ids = candidates.map((u: any) => u.id);
      const { data: existing } = await supabase
        .from('account_deletion_warnings')
        .select('user_id')
        .in('user_id', ids);
      const alreadyWarned = new Set((existing ?? []).map((r: any) => r.user_id));

      const toWarn = candidates.filter((u: any) => !alreadyWarned.has(u.id));
      if (toWarn.length > 0) {
        const { error: insertError } = await supabase.from('account_deletion_warnings').insert(
          toWarn.map((u: any) => ({
            user_id: u.id,
            scheduled_deletion_at: scheduledDeletion.toISOString()
          }))
        );
        if (insertError) errors.push(`insert warnings: ${insertError.message}`);
        else issuedWarnings = toWarn.length;
      }
    }
  }

  // ---- Step 2: clear warnings for users who signed back in --------
  const { data: warnings, error: warningListError } = await supabase
    .from('account_deletion_warnings')
    .select('user_id, warned_at');
  if (warningListError) {
    errors.push(`list warnings: ${warningListError.message}`);
  } else if (warnings && warnings.length > 0) {
    for (const warning of warnings) {
      const { data: userResp } = await supabase.auth.admin.getUserById(warning.user_id);
      const lastSignIn = userResp?.user?.last_sign_in_at;
      if (lastSignIn && new Date(lastSignIn) > new Date(warning.warned_at)) {
        const { error: clearError } = await supabase
          .from('account_deletion_warnings')
          .delete()
          .eq('user_id', warning.user_id);
        if (clearError) errors.push(`clear ${warning.user_id}: ${clearError.message}`);
        else clearedWarnings++;
      }
    }
  }

  // ---- Step 3: hard-delete users whose grace period expired -------
  const { data: dueWarnings } = await supabase
    .from('account_deletion_warnings')
    .select('user_id')
    .lt('scheduled_deletion_at', now.toISOString());

  for (const due of dueWarnings ?? []) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(due.user_id);
    if (deleteError) {
      errors.push(`delete ${due.user_id}: ${deleteError.message}`);
    } else {
      deletedAccounts++;
      // Audit log for compliance — the trigger ensures append-only.
      await supabase.from('admin_audit_log').insert({
        actor_id: null, // system-initiated
        action: 'account.auto_delete_inactive',
        target_user_id: due.user_id,
        metadata: { reason: '3-year-inactivity + 90-day-grace expired' }
      });
    }
  }

  console.log('[purge-inactive-accounts]', { issuedWarnings, clearedWarnings, deletedAccounts, errors });

  return new Response(
    JSON.stringify({ ok: errors.length === 0, issuedWarnings, clearedWarnings, deletedAccounts, errors }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: errors.length === 0 ? 200 : 207 // multi-status when partial
    }
  );
});
