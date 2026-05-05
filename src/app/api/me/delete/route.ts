import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GDPR Article 17 — right to erasure ("right to be forgotten").
 *
 * Hard-deletes the user's auth.users row using the service-role admin
 * client. Foreign-key cascades from auth.users -> profiles -> findings /
 * forum_posts / comments / likes / saved_posts / reports take care of
 * everything else automatically. billing_subscriptions also cascades
 * directly from auth.users.
 *
 * Side effect: when a user's forum_posts are cascade-deleted, their
 * comment threads (replies from other users) are also removed because
 * comments cascade from post_id. This is acceptable per GDPR and matches
 * the documented retention policy. If we later want to anonymize public
 * threads instead of deleting, that requires a different schema.
 *
 * Confirmation:
 *   - Method must be POST (not DELETE — added friction is intentional)
 *   - Body must contain { "confirm": "DELETE-MY-ACCOUNT" } literally
 *   - The UI should require the user to type that string before enabling
 *     the submit button, matching common destructive-action UX
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the deployment env;
 * fails with 500 otherwise.
 *
 * NOTE: There is no GDPR audit log table yet. Adding one is a Phase B
 * follow-up — until then, deletion events are not recorded server-side
 * beyond what auth.audit_log_entries captures by default in Supabase.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE-MY-ACCOUNT') {
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
  const [findingsCount, postsCount, commentsCount, likesCount, savedCount, reportsCount] = await Promise.all([
    supabase.from('findings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
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
    return NextResponse.json(
      {
        error: 'Server-konfigurasjonsfeil',
        details: 'SUPABASE_SERVICE_ROLE_KEY mangler. Kontoen din ble IKKE slettet. Kontakt support.'
      },
      { status: 500 }
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json(
      {
        error: 'Kunne ikke slette konto',
        details: deleteError.message
      },
      { status: 500 }
    );
  }

  // Best-effort sign-out so the cookie session is invalidated. The auth row
  // is already gone, so this just clears local cookies; if it errors we
  // ignore — the deletion itself already succeeded.
  await supabase.auth.signOut().catch(() => undefined);

  return NextResponse.json({
    ok: true,
    deletedUserId: user.id,
    deletedAt: new Date().toISOString(),
    deletedCounts: {
      findings: findingsCount.count ?? 0,
      forumPosts: postsCount.count ?? 0,
      comments: commentsCount.count ?? 0,
      postLikes: likesCount.count ?? 0,
      savedPosts: savedCount.count ?? 0,
      reportsFiled: reportsCount.count ?? 0
    }
  });
}
