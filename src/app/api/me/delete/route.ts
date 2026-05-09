import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * GDPR Article 17 — right to erasure ("right to be forgotten").
 *
 * Hard-deletes the user's auth.users row. After migration 011, FK
 * cascades from profiles to findings/forum_posts/comments use
 * ON DELETE SET NULL — so deleted users' negative observations and
 * forum threads survive in anonymized form (per retention policy).
 *
 * Two-step deletion to honor the policy distinction:
 *
 *   STEP 1 (this handler, BEFORE auth deletion): explicitly delete the
 *     rows that should NOT be anonymized:
 *       - all positive findings (any visibility)
 *       - private negative findings (visibility='private')
 *
 *   STEP 2 (Supabase auth.admin.deleteUser): cascade to profiles, which
 *     SET NULLs the user_id on:
 *       - public/approximate negative findings  → kept as training data
 *       - all forum_posts                       → "[slettet bruker]" in UI
 *       - all comments                          → same
 *     Other tables (post_likes, comment_likes, saved_posts, reports)
 *     keep ON DELETE CASCADE — personal interaction signals.
 *
 * Confirmation:
 *   - Method must be POST (not DELETE — added friction is intentional)
 *   - Body must contain { "confirm": "DELETE-MY-ACCOUNT" } literally
 *   - The UI should require the user to type that string before enabling
 *     the submit button, matching common destructive-action UX
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the deployment env;
 * fails with 500 otherwise.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  // warn on entry — destroying user data is high-signal even when expected.
  // Pages an alerting hook later if we want one.
  log.warn('account.self_delete.start');

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    log.info('account.self_delete.unauthenticated');
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const userLog = log.child({ userId: user.id });

  // Rate limit defends against repeated triggers (no honest user clicks
  // delete five times in a minute). Defense in depth on top of the literal
  // confirm token.
  const rateLimit = checkRateLimit(`me-delete:${getClientKey(request, user.id)}`, 5, 60);
  if (!rateLimit.allowed) {
    userLog.warn('account.self_delete.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE-MY-ACCOUNT') {
    userLog.info('account.self_delete.confirm_missing');
    return NextResponse.json(
      {
        error: 'Bekreftelse mangler eller er feil',
        hint: 'POST body må være { "confirm": "DELETE-MY-ACCOUNT" }.'
      },
      { status: 400 }
    );
  }

  // Pre-deletion counts so we can return a receipt of what was wiped.
  // Done via session client so RLS scopes them correctly.
  const [
    positiveFindingsCount,
    privateNegativeFindingsCount,
    anonymizedNegativeFindingsCount,
    postsCount,
    commentsCount,
    likesCount,
    savedCount,
    reportsCount
  ] = await Promise.all([
    supabase
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_negative_observation', false),
    supabase
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_negative_observation', true)
      .eq('visibility', 'private'),
    supabase
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_negative_observation', true)
      .neq('visibility', 'private'),
    supabase.from('forum_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('saved_posts').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id)
  ]);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    userLog.error('account.self_delete.no_service_role_key');
    return NextResponse.json(
      {
        error: 'Server-konfigurasjonsfeil',
        details: 'SUPABASE_SERVICE_ROLE_KEY mangler. Kontoen din ble IKKE slettet. Kontakt support.'
      },
      { status: 500 }
    );
  }

  // STEP 1 — explicitly delete findings that should NOT be anonymized
  // before auth.users is removed. After migration 011 the FK on
  // findings.user_id is ON DELETE SET NULL, so the auth-cascade only
  // anonymizes whatever survives this deletion.
  const { error: positiveDeleteError } = await admin
    .from('findings')
    .delete()
    .eq('user_id', user.id)
    .eq('is_negative_observation', false);
  if (positiveDeleteError) {
    userLog.error('account.self_delete.positive_findings_delete_failed', positiveDeleteError);
    return NextResponse.json(
      {
        error: 'Kunne ikke fjerne dine personlige funn før kontosletting',
        details: positiveDeleteError.message
      },
      { status: 500 }
    );
  }

  const { error: privateDeleteError } = await admin
    .from('findings')
    .delete()
    .eq('user_id', user.id)
    .eq('is_negative_observation', true)
    .eq('visibility', 'private');
  if (privateDeleteError) {
    userLog.error('account.self_delete.private_findings_delete_failed', privateDeleteError);
    return NextResponse.json(
      {
        error: 'Kunne ikke fjerne private observasjoner før kontosletting',
        details: privateDeleteError.message
      },
      { status: 500 }
    );
  }

  // STEP 2 — delete the auth.users row. Cascades to profiles which
  // SET NULLs user_id on findings (only public/approximate negatives
  // remain), forum_posts, and comments.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    userLog.error('account.self_delete.failed', deleteError);
    return NextResponse.json(
      {
        error: 'Kunne ikke slette konto',
        details: deleteError.message
      },
      { status: 500 }
    );
  }

  // Audit log the self-deletion. Done after the auth.users row is gone —
  // the user's UUID is captured from the pre-delete `user` variable; the
  // log table has no FK on actor/target so the entry persists even though
  // auth.users(id) no longer exists. logAdminAction is failure-safe; if
  // the audit insert fails (no service role, no migration 008) the user-
  // facing deletion is unaffected.
  const counts = {
    positiveFindings: positiveFindingsCount.count ?? 0,
    privateNegativeFindings: privateNegativeFindingsCount.count ?? 0,
    anonymizedNegativeFindings: anonymizedNegativeFindingsCount.count ?? 0,
    forumPosts: postsCount.count ?? 0,
    comments: commentsCount.count ?? 0,
    postLikes: likesCount.count ?? 0,
    savedPosts: savedCount.count ?? 0,
    reportsFiled: reportsCount.count ?? 0
  };

  await logAdminAction({
    actorId: user.id,
    action: 'account.self_delete',
    targetUserId: user.id,
    metadata: { counts },
    request
  });

  userLog.warn('account.self_delete.success', { counts });

  // Best-effort sign-out so the cookie session is invalidated. The auth row
  // is already gone, so this just clears local cookies; if it errors we
  // ignore — the deletion itself already succeeded.
  await supabase.auth.signOut().catch(() => undefined);

  return NextResponse.json({
    ok: true,
    deletedUserId: user.id,
    deletedAt: new Date().toISOString(),
    counts
  });
}
