import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Crown, Leaf, MapPin, ShieldCheck } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { AccountDataActions } from '@/components/profile/AccountDataActions';
import { LogoutButton } from '@/components/profile/LogoutButton';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { createClient } from '@/lib/supabase/server';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import type { Edibility } from '@/types/species';

interface UserStats {
  total_findings: number;
  unique_species: number;
  total_posts: number;
  total_likes_received: number;
}

interface FindingRow {
  id: string;
  found_at: string;
  location_name: string | null;
  notes: string | null;
  mushroom_species: { norwegian_name: string; latin_name: string; edibility: Edibility } | null;
}

interface PostRow {
  id: string;
  title: string;
  category: string;
  created_at: string;
  comments_count: number;
  likes_count: number;
}

function categoryLabels(t: Awaited<ReturnType<typeof getTranslations>>): Record<string, string> {
  return {
    find: t('categoryFind'),
    question: t('categoryQuestion'),
    tip: t('categoryTip'),
    discussion: t('categoryDiscussion')
  };
}

export default async function ProfilePage() {
  const t = await getTranslations('Profile');
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // Middleware should redirect, but be safe.
    return (
      <PageWrapper>
        <p className="text-sm text-gray-700">{t('mustBeLoggedIn')}</p>
      </PageWrapper>
    );
  }

  const [{ data: profile }, statsRes, findingsRes, postsRes, subscription, { data: roleRow }] = await Promise.all([
    supabase.from('profiles').select('username,display_name,bio,location,created_at,avatar_url').eq('id', user.id).maybeSingle(),
    supabase.rpc('get_user_stats', { p_user_id: user.id }),
    supabase
      .from('findings')
      .select('id,found_at,location_name,notes,mushroom_species(norwegian_name,latin_name,edibility)')
      .eq('user_id', user.id)
      .eq('is_negative_observation', false)
      .order('found_at', { ascending: false })
      .limit(5),
    supabase
      .from('forum_posts')
      .select('id,title,category,created_at,comments_count,likes_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    getUserBillingSubscription(supabase, user.id).catch(() => null),
    supabase.from('moderator_roles').select('role').eq('user_id', user.id).maybeSingle()
  ]);

  const stats = (statsRes.data?.[0] as UserStats | undefined) ?? {
    total_findings: 0,
    unique_species: 0,
    total_posts: 0,
    total_likes_received: 0
  };
  const findings = (findingsRes.data ?? []) as unknown as FindingRow[];
  const posts = (postsRes.data ?? []) as PostRow[];
  const billing = getBillingCapabilities(subscription);
  const isAdmin = roleRow?.role === 'admin' || roleRow?.role === 'moderator';

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('nb-NO', { year: 'numeric', month: 'long' })
    : null;

  const TierIcon = billing.tier === 'premium' ? Crown : billing.tier === 'season_pass' ? Leaf : null;
  const CATEGORY_LABELS = categoryLabels(t);

  return (
    <PageWrapper>
      <section className="space-y-4">
        <article className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-900">
              <span className="text-xl font-semibold">
                {(profile?.display_name ?? profile?.username ?? user.email ?? '?').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-serif text-2xl font-bold text-forest-900">{profile?.display_name ?? profile?.username ?? t('myProfile')}</h1>
              {profile?.username ? <p className="text-sm text-gray-600">@{profile.username}</p> : null}
              <p className="truncate text-sm text-gray-700">{user.email}</p>
              {memberSince ? <p className="mt-1 text-xs text-gray-500">{t('memberSince', { date: memberSince })}</p> : null}
            </div>
          </div>
          {profile?.bio ? <p className="mt-3 text-sm text-gray-800">{profile.bio}</p> : null}
        </article>

        <article className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('statFindings')} value={Number(stats.total_findings)} />
          <StatCard label={t('statSpecies')} value={Number(stats.unique_species)} />
          <StatCard label={t('statPosts')} value={Number(stats.total_posts)} />
          <StatCard label={t('statLikes')} value={Number(stats.total_likes_received)} />
        </article>

        <article className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('subscription')}</h2>
            {/* Web-only: native must not steer to the external Stripe page (App Store 3.1.1). */}
            <NonNativeOnly>
              <Link href="/pricing" className="text-xs font-medium text-forest-800 hover:underline">
                {t('change')} →
              </Link>
            </NonNativeOnly>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            {TierIcon ? <TierIcon className="h-4 w-4 text-forest-800" /> : null}
            <span className="font-medium capitalize">{billing.tier.replace('_', ' ')}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-700">{billing.status}</span>
          </div>
          {!billing.paid && billing.aiDailyLimit !== null ? (
            <p className="mt-1 text-xs text-gray-600">{t('aiQuota', { limit: billing.aiDailyLimit })}</p>
          ) : null}
        </article>

        <article className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t('myLatestFindings')}</h2>
            <Link href="/mine-steder" className="text-xs font-medium text-forest-800 hover:underline">
              📍 {t('myPlaces')} →
            </Link>
          </div>
          {findings.length === 0 ? (
            <p className="text-sm text-gray-700">{t('noFindingsYet')}</p>
          ) : (
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.id} className="rounded-lg border border-gray-100 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.mushroom_species?.norwegian_name ?? t('unknownSpecies')}</p>
                      <p className="truncate text-xs italic text-gray-600">{f.mushroom_species?.latin_name}</p>
                    </div>
                    {f.mushroom_species ? <EdibilityBadge edibility={f.mushroom_species.edibility} /> : null}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                    <MapPin className="h-3 w-3" />
                    {f.location_name ?? t('unknownLocation')}
                    <span>·</span>
                    {new Date(f.found_at).toLocaleDateString('nb-NO')}
                  </p>
                  {f.notes ? <p className="mt-1 text-sm text-gray-800">{f.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="mb-3 font-semibold">{t('myPosts')}</h2>
          {posts.length === 0 ? (
            <p className="text-sm text-gray-700">{t('noPostsYet')}</p>
          ) : (
            <ul className="space-y-2">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/forum/${p.id}`} className="block rounded-lg border border-gray-100 p-2 hover:border-forest-700">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {CATEGORY_LABELS[p.category] ?? p.category} · {new Date(p.created_at).toLocaleDateString('nb-NO')} · {t('commentsCount', { count: p.comments_count })} · {t('likesCount', { count: p.likes_count })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="space-y-2">
          {isAdmin ? (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-lg border border-forest-600/30 bg-forest-50 px-3 py-2 text-sm font-medium text-forest-900 hover:bg-forest-100"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t('adminLink')}
            </Link>
          ) : null}
          <Link
            href="/forum/reports"
            className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            {t('myReports')}
          </Link>
        </article>

        <AccountDataActions />

        <article className="pt-1">
          <LogoutButton />
        </article>
      </section>
    </PageWrapper>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-card">
      <p className="text-2xl font-bold text-forest-900">{value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}
