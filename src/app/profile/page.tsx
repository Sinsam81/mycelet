import Link from 'next/link';
import { Crown, Leaf, MapPin } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { AccountDataActions } from '@/components/profile/AccountDataActions';
import { LogoutButton } from '@/components/profile/LogoutButton';
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

const CATEGORY_LABELS: Record<string, string> = {
  find: 'Funn',
  question: 'Spørsmål',
  tip: 'Tips',
  discussion: 'Diskusjon'
};

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // Middleware should redirect, but be safe.
    return (
      <PageWrapper>
        <p className="text-sm text-gray-700">Du må være logget inn.</p>
      </PageWrapper>
    );
  }

  const [{ data: profile }, statsRes, findingsRes, postsRes, subscription] = await Promise.all([
    supabase.from('profiles').select('username,display_name,bio,location,created_at,avatar_url').eq('id', user.id).maybeSingle(),
    supabase.rpc('get_user_stats', { p_user_id: user.id }),
    supabase
      .from('findings')
      .select('id,found_at,location_name,notes,mushroom_species(norwegian_name,latin_name,edibility)')
      .eq('user_id', user.id)
      .order('found_at', { ascending: false })
      .limit(5),
    supabase
      .from('forum_posts')
      .select('id,title,category,created_at,comments_count,likes_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    getUserBillingSubscription(supabase, user.id).catch(() => null)
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

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('nb-NO', { year: 'numeric', month: 'long' })
    : null;

  const TierIcon = billing.tier === 'premium' ? Crown : billing.tier === 'season_pass' ? Leaf : null;

  return (
    <PageWrapper>
      <section className="space-y-4">
        <article className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-900">
              <span className="text-xl font-semibold">
                {(profile?.display_name ?? profile?.username ?? user.email ?? '?').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold">{profile?.display_name ?? profile?.username ?? 'Min profil'}</h1>
              {profile?.username ? <p className="text-sm text-gray-600">@{profile.username}</p> : null}
              <p className="truncate text-sm text-gray-700">{user.email}</p>
              {memberSince ? <p className="mt-1 text-xs text-gray-500">Medlem siden {memberSince}</p> : null}
            </div>
          </div>
          {profile?.bio ? <p className="mt-3 text-sm text-gray-800">{profile.bio}</p> : null}
        </article>

        <article className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Funn" value={Number(stats.total_findings)} />
          <StatCard label="Arter" value={Number(stats.unique_species)} />
          <StatCard label="Innlegg" value={Number(stats.total_posts)} />
          <StatCard label="Likes" value={Number(stats.total_likes_received)} />
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Abonnement</h2>
            <Link href="/pricing" className="text-xs font-medium text-forest-800 hover:underline">
              Endre →
            </Link>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            {TierIcon ? <TierIcon className="h-4 w-4 text-forest-800" /> : null}
            <span className="font-medium capitalize">{billing.tier.replace('_', ' ')}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-700">{billing.status}</span>
          </div>
          {!billing.paid && billing.aiDailyLimit !== null ? (
            <p className="mt-1 text-xs text-gray-600">AI-kvote: {billing.aiDailyLimit} per døgn</p>
          ) : null}
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Mine siste funn</h2>
          {findings.length === 0 ? (
            <p className="text-sm text-gray-700">Du har ikke registrert funn ennå. Bruk kartet for å legge til ditt første.</p>
          ) : (
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.id} className="rounded-lg border border-gray-100 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.mushroom_species?.norwegian_name ?? 'Ukjent art'}</p>
                      <p className="truncate text-xs italic text-gray-600">{f.mushroom_species?.latin_name}</p>
                    </div>
                    {f.mushroom_species ? <EdibilityBadge edibility={f.mushroom_species.edibility} /> : null}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                    <MapPin className="h-3 w-3" />
                    {f.location_name ?? 'Ukjent sted'}
                    <span>·</span>
                    {new Date(f.found_at).toLocaleDateString('nb-NO')}
                  </p>
                  {f.notes ? <p className="mt-1 text-sm text-gray-800">{f.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Mine innlegg</h2>
          {posts.length === 0 ? (
            <p className="text-sm text-gray-700">Du har ikke postet i forumet ennå.</p>
          ) : (
            <ul className="space-y-2">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/forum/${p.id}`} className="block rounded-lg border border-gray-100 p-2 hover:border-forest-700">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {CATEGORY_LABELS[p.category] ?? p.category} · {new Date(p.created_at).toLocaleDateString('nb-NO')} · {p.comments_count} kommentarer · {p.likes_count} likes
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="space-y-2">
          <Link
            href="/forum/reports"
            className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Mine rapporteringer
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
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <p className="text-2xl font-bold text-forest-900">{value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}
