import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';

/**
 * GDPR Article 15 — right of access.
 *
 * Returns a JSON file containing every row tied to the authenticated user
 * across our database. Uses the session client so RLS is the source of truth
 * for what the user can read. If RLS is missing for some table, that table
 * returns empty here — the fix belongs in the policy, not in this endpoint.
 *
 * Out of scope (intentionally not in the export):
 *   - Public reference data (mushroom species, look-alikes, prediction tiles)
 *   - Forum posts / comments by other users (not personal data about caller)
 *   - Reports filed BY OTHERS about the caller (would expose reporter)
 *
 * For "data about you from other users" requests, the user should contact
 * the privacy mailbox; that requires manual review.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  // The export runs 11 queries across most user tables — defending against
  // a refresh-loop hammering the DB. 10/min is plenty for any honest UI
  // pattern (downloading once, maybe again to verify).
  const rateLimit = checkRateLimit(`me-export:${getClientKey(request, user.id)}`, 10, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  // All queries scoped to the authenticated user_id. RLS would also enforce
  // this — the explicit .eq() is defense in depth.
  const [
    profile,
    findings,
    forumPosts,
    comments,
    postLikes,
    commentLikes,
    savedPosts,
    reports,
    billing,
    moderatorRole,
    verifiedForager
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('findings').select('*').eq('user_id', user.id),
    supabase.from('forum_posts').select('*').eq('user_id', user.id),
    supabase.from('comments').select('*').eq('user_id', user.id),
    supabase.from('post_likes').select('*').eq('user_id', user.id),
    supabase.from('comment_likes').select('*').eq('user_id', user.id),
    supabase.from('saved_posts').select('*').eq('user_id', user.id),
    supabase.from('reports').select('*').eq('reporter_id', user.id),
    supabase.from('billing_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('moderator_roles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('verified_foragers').select('*').eq('user_id', user.id).maybeSingle()
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    account: {
      userId: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null
    },
    profile: profile.data ?? null,
    findings: findings.data ?? [],
    forumPosts: forumPosts.data ?? [],
    comments: comments.data ?? [],
    postLikes: postLikes.data ?? [],
    commentLikes: commentLikes.data ?? [],
    savedPosts: savedPosts.data ?? [],
    reportsFiled: reports.data ?? [],
    billing: billing.data ?? null,
    moderatorRole: moderatorRole.data ?? null,
    verifiedForager: verifiedForager.data ?? null,
    _notes: {
      gdprArticle: 'GDPR Art. 15 — Right of access.',
      coverage:
        'This export contains all rows in our database tied to your user_id. Public reference data (species, look-alikes, prediction tiles) is intentionally not included since it is not personal data about you.',
      dataAboutYouFromOthers:
        'Reports filed BY OTHER USERS about your content are not in this export to protect the reporter. To request that information, contact privacy@soppjakt.no — manual review required.'
    }
  };

  const filename = `soppjakt-data-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
