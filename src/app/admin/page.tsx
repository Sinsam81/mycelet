import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Database,
  MapPin,
  MessageSquare,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Users
} from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Admin statistics dashboard — the `/admin` landing page (and hub linking to
 * the other admin tools). Read-only overview of the whole app: users, billing,
 * findings, community engagement, the moderation queue, and catalog health.
 *
 * Access mirrors the other /admin pages:
 *   - Middleware gates /admin/* against logged-out users (PROTECTED_PATHS).
 *   - This page additionally requires a moderator/admin row in moderator_roles
 *     and renders an explicit "no access" card for logged-in non-admins.
 *   - All stats run through the service-role client so the numbers don't depend
 *     on a single moderator's RLS visibility, and a missing service key / table
 *     degrades gracefully (a null stat renders as "—") instead of crashing.
 *
 * No new migration or RPC: every figure is a cheap COUNT(head) query or a fetch
 * over a small/bounded table, aggregated in JS. "Top species" reads up to 1000
 * recent findings; if findings ever outgrow that it should move to an RPC.
 */

export const metadata = {
  title: 'Statistikk — Mycelet admin',
  description: 'Oversikt over brukere, funn, samfunn, moderering og artskatalog.'
};

// Reads live data + cookies/auth; never prerender at build time.
export const dynamic = 'force-dynamic';

const EDIBILITY_LABELS: Record<string, string> = {
  edible: 'Spiselig',
  conditionally_edible: 'Betinget',
  inedible: 'Uspiselig',
  toxic: 'Giftig',
  deadly: 'Dødelig'
};

const CATEGORY_LABELS: Record<string, string> = {
  find: 'Funn',
  question: 'Spørsmål',
  tip: 'Tips',
  discussion: 'Diskusjon'
};

export default async function AdminDashboardPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <PageWrapper>
        <p className="text-sm text-gray-700">Du må være logget inn for å se denne siden.</p>
      </PageWrapper>
    );
  }

  const { data: roleRow } = await supabase
    .from('moderator_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = roleRow?.role ?? null;
  if (role !== 'admin' && role !== 'moderator') {
    return (
      <PageWrapper>
        <article className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <p className="text-base font-bold text-amber-900">Ingen tilgang</p>
              <p className="text-sm text-amber-900">
                Statistikk-dashbordet er kun for moderatorer og administratorer. Trenger du tilgang, må en eksisterende
                admin legge til en rad i <code>moderator_roles</code>.
              </p>
            </div>
          </div>
        </article>
      </PageWrapper>
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return (
      <PageWrapper>
        <article className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-700" />
            <div>
              <p className="text-base font-bold text-red-900">Server-konfigurasjonsfeil</p>
              <p className="text-sm text-red-900">
                <code>SUPABASE_SERVICE_ROLE_KEY</code> mangler i miljøet. Statistikken kan ikke leses uten den.
              </p>
            </div>
          </div>
        </article>
      </PageWrapper>
    );
  }

  const c = async (table: string, build?: (q: any) => any): Promise<number | null> => {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    if (build) q = build(q);
    const { count, error } = await q;
    return error ? null : count ?? 0;
  };

  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const WEEK = iso(7 * 864e5);
  const MONTH = iso(30 * 864e5);

  const fetchBilling = async () => {
    const { data } = await admin.from('billing_subscriptions').select('tier,status');
    const rows = data ?? [];
    const byTier: Record<string, number> = { free: 0, premium: 0, season_pass: 0 };
    let paid = 0;
    for (const r of rows) {
      byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
      if (r.tier !== 'free' && (r.status === 'active' || r.status === 'trialing')) paid += 1;
    }
    return { total: rows.length, byTier, paid };
  };

  const fetchSpecies = async () => {
    const { data } = await admin.from('mushroom_species').select('edibility,verified');
    const rows = data ?? [];
    const byEdibility: Record<string, number> = {};
    let verified = 0;
    for (const r of rows) {
      byEdibility[r.edibility] = (byEdibility[r.edibility] ?? 0) + 1;
      if (r.verified) verified += 1;
    }
    return { total: rows.length, byEdibility, verified };
  };

  const fetchForumCategories = async () => {
    const { data } = await admin.from('forum_posts').select('category');
    const byCategory: Record<string, number> = {};
    for (const r of data ?? []) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    return byCategory;
  };

  const fetchTopSpecies = async (limit = 5): Promise<Array<[string, number]>> => {
    const { data } = await admin.from('findings').select('species_id,species_name_override').limit(1000);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.species_id).filter(Boolean))] as number[];
    const nameById = new Map<number, string>();
    if (ids.length > 0) {
      const { data: sp } = await admin.from('mushroom_species').select('id,norwegian_name').in('id', ids);
      for (const s of sp ?? []) nameById.set(s.id as number, s.norwegian_name as string);
    }
    const counts = new Map<string, number>();
    for (const r of rows) {
      const name = r.species_id
        ? nameById.get(r.species_id) ?? `#${r.species_id}`
        : (r.species_name_override as string) ?? 'Uten art';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  };

  const [
    usersTotal,
    usersWeek,
    usersMonth,
    findTotal,
    findWeek,
    findMonth,
    findPublic,
    findApprox,
    findPrivate,
    findNegative,
    findAi,
    postsTotal,
    postsHidden,
    commentsTotal,
    likesPost,
    likesComment,
    savedTotal,
    reportsTotal,
    reportsPending,
    occurrences,
    tiles,
    verifiedForagers,
    moderators,
    pendingDeletions,
    billing,
    species,
    forumCategories,
    topSpecies
  ] = await Promise.all([
    c('profiles'),
    c('profiles', (q) => q.gte('created_at', WEEK)),
    c('profiles', (q) => q.gte('created_at', MONTH)),
    c('findings'),
    c('findings', (q) => q.gte('created_at', WEEK)),
    c('findings', (q) => q.gte('created_at', MONTH)),
    c('findings', (q) => q.eq('visibility', 'public')),
    c('findings', (q) => q.eq('visibility', 'approximate')),
    c('findings', (q) => q.eq('visibility', 'private')),
    c('findings', (q) => q.eq('is_negative_observation', true)),
    c('findings', (q) => q.eq('ai_used', true)),
    c('forum_posts'),
    c('forum_posts', (q) => q.eq('is_hidden', true)),
    c('comments'),
    c('post_likes'),
    c('comment_likes'),
    c('saved_posts'),
    c('reports'),
    c('reports', (q) => q.eq('status', 'pending')),
    c('species_occurrences'),
    c('prediction_tiles'),
    c('verified_foragers'),
    c('moderator_roles'),
    c('account_deletion_warnings'),
    fetchBilling(),
    fetchSpecies(),
    fetchForumCategories(),
    fetchTopSpecies()
  ]);

  const likesTotal = likesPost == null && likesComment == null ? null : (likesPost ?? 0) + (likesComment ?? 0);

  return (
    <PageWrapper wide>
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-forest-900">Statistikk</h1>
          <p className="text-sm text-gray-700">
            Oversikt over hele appen. Kun synlig for moderatorer og administratorer. Tallene er live.
          </p>
        </header>

        {/* Admin tools hub */}
        <nav className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <AdminLink href="/admin/forum-trust" icon={ShieldCheck} title="Forum & tillit" desc="Moderering og verifiserte plukkere" />
          <AdminLink href="/admin/audit-log" icon={ScrollText} title="Audit-logg" desc="Sporbare admin-handlinger" />
          <AdminLink href="/admin/prediction" icon={SlidersHorizontal} title="Prediksjon" desc="Soppvarsel-fliser" />
        </nav>

        <Section title="Brukere & abonnement" icon={Users}>
          <Grid>
            <StatCard label="Brukere totalt" value={usersTotal} />
            <StatCard label="Nye (7 dager)" value={usersWeek} />
            <StatCard label="Nye (30 dager)" value={usersMonth} />
            <StatCard label="Betalende" value={billing.paid} tone={billing.paid > 0 ? 'good' : 'default'} />
          </Grid>
          <Grid>
            <StatCard label="Premium" value={billing.byTier.premium ?? 0} icon={CreditCard} />
            <StatCard label="Sesongpass" value={billing.byTier.season_pass ?? 0} icon={CreditCard} />
            <StatCard label="Gratis" value={billing.byTier.free ?? 0} />
            <StatCard label="Abonnement-rader" value={billing.total} />
          </Grid>
        </Section>

        <Section title="Funn" icon={MapPin} hint="Synlighet styrer hvor presis posisjon vises på kartet.">
          <Grid>
            <StatCard label="Funn totalt" value={findTotal} />
            <StatCard label="Nye (7 dager)" value={findWeek} />
            <StatCard label="Nye (30 dager)" value={findMonth} />
            <StatCard label="Med AI-bestemming" value={findAi} />
          </Grid>
          <Grid>
            <StatCard label="Offentlige" value={findPublic} />
            <StatCard label="Omtrentlige" value={findApprox} />
            <StatCard label="Private" value={findPrivate} />
            <StatCard label="Negative obs." value={findNegative} />
          </Grid>
          {topSpecies.length > 0 && (
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Mest registrerte arter</p>
              <ul className="space-y-1">
                {topSpecies.map(([name, n]) => (
                  <li key={name} className="flex justify-between text-sm">
                    <span className="text-gray-800">{name}</span>
                    <span className="font-medium text-forest-900">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Samfunn" icon={MessageSquare}>
          <Grid>
            <StatCard label="Forum-innlegg" value={postsTotal} />
            <StatCard label="Kommentarer" value={commentsTotal} />
            <StatCard label="Likes" value={likesTotal} />
            <StatCard label="Lagrede innlegg" value={savedTotal} />
          </Grid>
          <Grid>
            {Object.keys(CATEGORY_LABELS).map((key) => (
              <StatCard key={key} label={CATEGORY_LABELS[key]} value={forumCategories[key] ?? 0} />
            ))}
          </Grid>
          {postsHidden != null && postsHidden > 0 && (
            <p className="text-xs text-amber-800">
              {postsHidden} innlegg er skjult av moderator.
            </p>
          )}
        </Section>

        <Section title="Moderering" icon={ShieldAlert}>
          <Grid>
            <StatCard
              label="Rapporter — venter"
              value={reportsPending}
              tone={reportsPending != null && reportsPending > 0 ? 'warn' : 'default'}
            />
            <StatCard label="Rapporter totalt" value={reportsTotal} />
            <StatCard label="Verifiserte plukkere" value={verifiedForagers} />
            <StatCard label="Moderatorer/admins" value={moderators} />
          </Grid>
          {pendingDeletions != null && pendingDeletions > 0 && (
            <p className="text-xs text-amber-800">
              {pendingDeletions} konto(er) er varslet for sletting (inaktivitet).
            </p>
          )}
        </Section>

        <Section title="Artskatalog" icon={Sprout} hint={`${species.verified} av ${species.total} arter er ekspertgodkjent (verified).`}>
          <Grid>
            <StatCard label="Arter totalt" value={species.total} icon={Sprout} />
            <StatCard label="Godkjent" value={species.verified} />
            <StatCard label="Funnpunkter (GBIF)" value={occurrences} icon={Database} />
            <StatCard label="Prediksjons-fliser" value={tiles} />
          </Grid>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.keys(EDIBILITY_LABELS).map((key) => (
              <StatCard
                key={key}
                label={EDIBILITY_LABELS[key]}
                value={species.byEdibility[key] ?? 0}
                tone={key === 'deadly' ? 'danger' : key === 'toxic' ? 'warn' : 'default'}
              />
            ))}
          </div>
        </Section>
      </div>
    </PageWrapper>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>;
}

function Section({
  title,
  icon: Icon,
  hint,
  children
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-forest-700" />
        <h2 className="text-base font-semibold text-forest-900">{title}</h2>
      </div>
      {hint && <p className="-mt-1 text-xs text-gray-500">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
  icon: Icon
}: {
  label: string;
  value: number | string | null;
  tone?: 'default' | 'warn' | 'danger' | 'good';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const display = typeof value === 'number' ? value.toLocaleString('nb-NO') : value ?? '—';
  const box =
    tone === 'warn'
      ? 'border-amber-300 bg-amber-50'
      : tone === 'danger'
        ? 'border-red-300 bg-red-50'
        : tone === 'good'
          ? 'border-forest-600/30 bg-forest-50'
          : 'border-transparent bg-white';
  const valueColor =
    tone === 'warn' ? 'text-amber-800' : tone === 'danger' ? 'text-red-800' : 'text-forest-900';
  return (
    <div className={`rounded-xl border ${box} p-3 text-center shadow-sm`}>
      <p className={`text-2xl font-bold ${valueColor}`}>{display}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-gray-600">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
    </div>
  );
}

function AdminLink({
  href,
  icon: Icon,
  title,
  desc
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-forest-600 hover:bg-forest-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-800">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-forest-900">{title}</span>
        <span className="block truncate text-xs text-gray-600">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:text-forest-700" />
    </Link>
  );
}
