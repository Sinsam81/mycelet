import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { AlertTriangle, Calendar, Camera, Check, Crown, Database, Lock, Map, MessageSquare, Shield } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { MushroomDayCard } from '@/components/home/MushroomDayCard';
import { LastTripCard } from '@/components/home/LastTripCard';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { FLAGS } from '@/lib/flags';
import type { Edibility } from '@/types/species';

type HomeTranslator = Awaited<ReturnType<typeof getTranslations<'Home'>>>;

interface SpeciesRow {
  id: number;
  norwegian_name: string;
  latin_name: string;
  edibility: Edibility;
  season_start: number;
  season_end: number;
  primary_image_url: string | null;
}

// Rows come from the public_findings VIEW (masked display coords), never the
// findings table — direct table reads are owner-only since migration 015.
interface RecentFindingRow {
  id: string;
  found_at: string;
  location_name: string | null;
  species_id: number | null;
  norwegian_name: string | null;
  edibility: Edibility | null;
  primary_image_url: string | null;
}

function formatTimeAgo(iso: string, t: HomeTranslator) {
  const diff = Date.now() - new Date(iso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round(diff / dayMs);
  if (days === 0) return t('timeAgoToday');
  if (days === 1) return t('timeAgoYesterday');
  if (days < 7) return t('timeAgoDays', { days });
  if (days < 30) return t('timeAgoWeeks', { weeks: Math.round(days / 7) });
  return new Date(iso).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short' });
}

function getMonthName(month: number, t: HomeTranslator) {
  const keys = [
    'monthJanuary', 'monthFebruary', 'monthMarch', 'monthApril', 'monthMay', 'monthJune',
    'monthJuly', 'monthAugust', 'monthSeptember', 'monthOctober', 'monthNovember', 'monthDecember'
  ] as const;
  return t(keys[month - 1]);
}

function isInMonth(month: number, start: number, end: number) {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

function getSeasonHeadline(month: number, edibleCount: number, t: HomeTranslator) {
  if (edibleCount === 0) return t('headlineFewInSeason');
  if (month >= 4 && month <= 5) return t('headlineSpring');
  if (month >= 6 && month <= 7) return t('headlineSummer');
  if (month >= 8 && month <= 10) return t('headlineHighSeason');
  return t('headlineQuiet');
}

export default async function HomePage() {
  const t = await getTranslations('Home');
  const supabase = createClient();
  const month = new Date().getMonth() + 1;
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data }, { data: recentFindings }] = await Promise.all([
    supabase
      .from('mushroom_species')
      .select('id,norwegian_name,latin_name,edibility,season_start,season_end,primary_image_url')
      .order('norwegian_name', { ascending: true }),
    supabase
      .from('public_findings')
      .select('id,found_at,location_name,species_id,norwegian_name,edibility,primary_image_url')
      .order('found_at', { ascending: false })
      .limit(4)
  ]);

  const species = (data ?? []) as SpeciesRow[];
  const findings = (recentFindings ?? []) as unknown as RecentFindingRow[];
  const inSeasonEdible = species
    .filter((s) => (s.edibility === 'edible' || s.edibility === 'conditionally_edible') && isInMonth(month, s.season_start, s.season_end))
    .slice(0, 4);
  const dangerousInSeason = species.filter((s) => (s.edibility === 'toxic' || s.edibility === 'deadly') && isInMonth(month, s.season_start, s.season_end));

  let userStats: { total: number; species: number } | null = null;
  if (user) {
    const { data: myFindings } = await supabase
      .from('findings')
      .select('species_id')
      .eq('user_id', user.id)
      .limit(1000);
    const rows = (myFindings ?? []) as { species_id: number | null }[];
    if (rows.length > 0) {
      userStats = {
        total: rows.length,
        species: new Set(rows.map((r) => r.species_id).filter((id): id is number => id != null)).size
      };
    }
  }

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header className="pt-2 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">
            {getMonthName(month, t)} {new Date().getFullYear()}
          </p>
          <h1 className="mt-1 font-serif text-4xl font-bold tracking-tight text-forest-900">
            {getSeasonHeadline(month, inSeasonEdible.length, t)}
          </h1>
          {inSeasonEdible.length > 0 ? (
            <p className="mt-1 text-sm text-gray-700">
              {t('edibleInSeasonCount', { count: inSeasonEdible.length })}
              {dangerousInSeason.length > 0
                ? ` · ${t('dangerousToWatch', { count: dangerousInSeason.length })}`
                : ''}
            </p>
          ) : null}
        </header>

        <MushroomDayCard />

        <Link
          href="/identify"
          className="block rounded-2xl bg-gradient-to-br from-forest-800 via-forest-700 to-forest-800 p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Camera className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <h2 className="font-serif text-xl font-semibold">{t('identifyTitle')}</h2>
              <p className="text-sm text-white/85">{t('identifySubtitle')}</p>
            </div>
            <span aria-hidden="true" className="text-2xl text-white/70">→</span>
          </div>
        </Link>

        {userStats ? (
          <article className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-forest-900">🍄 {t('yourFindings')}</h2>
              <Link href="/profile" className="text-xs font-medium text-forest-800 hover:underline">
                {t('seeYourProfile')} →
              </Link>
            </div>
            <div className="mt-3 flex gap-8">
              <div>
                <p className="text-2xl font-bold text-forest-900">{userStats.total}</p>
                <p className="text-xs text-gray-600">{t('findingsRegistered')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-forest-900">{userStats.species}</p>
                <p className="text-xs text-gray-600">{t('speciesCount', { count: userStats.species })}</p>
              </div>
            </div>
          </article>
        ) : null}

        <LastTripCard />

        <article className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-forest-800" />
              <h2 className="font-semibold">{t('inSeasonNow', { month: getMonthName(month, t) })}</h2>
            </div>
            <Link href="/calendar" className="text-xs font-medium text-forest-800 hover:underline">
              {t('seeFullCalendar')} →
            </Link>
          </div>
          {inSeasonEdible.length === 0 ? (
            <p className="text-sm text-gray-700">
              {t('noneInSeason', { month: getMonthName(month, t) })}
            </p>
          ) : (
            <ul
              className={`grid grid-cols-2 gap-2 ${
                inSeasonEdible.length === 3
                  ? 'sm:grid-cols-3'
                  : inSeasonEdible.length >= 4
                    ? 'sm:grid-cols-4'
                    : ''
              }`}
            >
              {inSeasonEdible.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/species/${s.id}`}
                    className="group block overflow-hidden rounded-xl border border-gray-100 bg-forest-50/50 transition hover:border-forest-600 hover:shadow-card"
                  >
                    <div className="aspect-square w-full overflow-hidden bg-gray-100">
                      {s.primary_image_url ? (
                        <img
                          src={s.primary_image_url}
                          alt={s.norwegian_name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : null}
                    </div>
                    <p className="truncate p-2 text-sm font-medium text-forest-900">{s.norwegian_name}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500">
            {t('seasonSafetyNote')}{' '}
            <Link href="/sikkerhet" className="font-medium text-forest-800 hover:underline">
              {t('checkWithSoppkontrollen')}
            </Link>
            .
          </p>
        </article>

        {dangerousInSeason.length > 0 ? (
          <article className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-700" />
              <h2 className="font-semibold text-red-900">{t('dangerousWarningTitle')}</h2>
            </div>
            <ul className="space-y-1">
              {dangerousInSeason.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/species/${s.id}`} className="text-sm text-red-900 hover:underline">
                    {s.norwegian_name} <span className="italic text-red-700/80">({s.latin_name})</span>
                  </Link>
                  <EdibilityBadge edibility={s.edibility} />
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {findings.length > 0 ? (
          <article className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t('latestFromCommunity')}</h2>
              <Link href="/map" className="text-xs font-medium text-forest-800 hover:underline">
                {t('seeOnMap')} →
              </Link>
            </div>
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.id}>
                  <Link
                    href={f.species_id ? `/species/${f.species_id}` : '/map'}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 p-2 hover:border-forest-700"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                      {f.primary_image_url ? (
                        <img src={f.primary_image_url} alt={f.norwegian_name ?? t('mushroomAlt')} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.norwegian_name ?? t('unknownSpecies')}</p>
                      <p className="truncate text-xs text-gray-600">
                        {f.location_name ?? t('unknownLocation')} · {formatTimeAgo(f.found_at, t)}
                      </p>
                    </div>
                    {f.edibility ? <EdibilityBadge edibility={f.edibility} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        <Link
          href="/map"
          className="block rounded-xl bg-white p-4 shadow-sm transition hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-forest-800" />
            <div className="flex-1">
              <h2 className="font-semibold">{t('mapTitle')}</h2>
              <p className="text-sm text-gray-700">{t('mapSubtitle')}</p>
            </div>
          </div>
        </Link>

        <NonNativeOnly>
          <Link
            href="/pricing"
            className="block rounded-2xl bg-gradient-to-br from-forest-900 to-forest-800 p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" />
              <h2 className="font-serif text-xl font-semibold">{t('premiumTitle')}</h2>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-white/90">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-amber-400" /> {t('premiumFeatureUnlimitedAi')}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-amber-400" /> {t('premiumFeatureFullPrediction')}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-amber-400" /> {t('premiumFeatureOfflineMap')}
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-white/80">
                {t('premiumPriceFrom')}{' '}
                <span className="font-serif text-lg font-bold text-amber-300">
                  {t('premiumPricePerMonth', { price: Math.round((BILLING_PLANS.season_pass.yearlyNok ?? 249) / 12) })}
                </span>{' '}
                {t('premiumPriceWithPass')}
              </p>
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-forest-900">{t('premiumSeePlans')}</span>
            </div>
          </Link>
        </NonNativeOnly>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/calendar"
            className={`rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium ${FLAGS.forumInNav ? '' : 'col-span-2'}`}
          >
            <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" /> {t('navCalendar')}</span>
          </Link>
          {FLAGS.forumInNav ? (
            <Link href="/forum" className="rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium">
              <span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" /> {t('navForum')}</span>
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/sikkerhet"
            className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2"><Shield className="h-4 w-4 text-forest-800" /> {t('navSafety')}</span>
          </Link>
          <Link
            href="/personvern"
            className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4 text-forest-800" /> {t('navPrivacy')}</span>
          </Link>
          <Link
            href="/datakilder"
            className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2"><Database className="h-4 w-4 text-forest-800" /> {t('navDataSources')}</span>
          </Link>
        </div>

        <div className="flex justify-center pt-1">
          <LanguageToggle />
        </div>
      </section>
    </PageWrapper>
  );
}
