import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { AlertTriangle, Calendar, Camera, Check, Crown, Database, FileText, Lock, Map, MessageSquare, Microscope, Shield, ShieldAlert } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { LandingPage } from '@/components/landing/LandingPage';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { MushroomDayCard } from '@/components/home/MushroomDayCard';
import { BestRegionsCard } from '@/components/home/BestRegionsCard';
import { VarselCta } from '@/components/soppforhold/VarselCta';
import { LastTripCard } from '@/components/home/LastTripCard';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { FLAGS } from '@/lib/flags';
import type { Edibility } from '@/types/species';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { baseSeasonMask, isMonthInMask, peakMask } from '@/lib/utils/season-region';
import { intlLocale } from '@/lib/utils/intl-locale';
import { logger } from '@/lib/log';
import { seasonHeadline } from '@/lib/utils/season-headline';

type HomeTranslator = Awaited<ReturnType<typeof getTranslations<'Home'>>>;

interface SpeciesRow {
  id: number;
  norwegian_name: string;
  swedish_name: string | null;
  latin_name: string;
  edibility: Edibility;
  season_start: number;
  season_end: number;
  /** Curated peak window. Drives the "why now" line — no location needed. */
  peak_season_start: number | null;
  peak_season_end: number | null;
  /** How often the species is actually encountered. Ranks the list. */
  commonality: string | null;
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

function formatTimeAgo(iso: string, t: HomeTranslator, locale: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round(diff / dayMs);
  if (days === 0) return t('timeAgoToday');
  if (days === 1) return t('timeAgoYesterday');
  if (days < 7) return t('timeAgoDays', { days });
  if (days < 30) return t('timeAgoWeeks', { weeks: Math.round(days / 7) });
  return new Date(iso).toLocaleDateString(intlLocale(locale), { day: '2-digit', month: 'short' });
}

function getMonthName(month: number, t: HomeTranslator) {
  const keys = [
    'monthJanuary', 'monthFebruary', 'monthMarch', 'monthApril', 'monthMay', 'monthJune',
    'monthJuly', 'monthAugust', 'monthSeptember', 'monthOctober', 'monthNovember', 'monthDecember'
  ] as const;
  return t(keys[month - 1]);
}

// Båndene ligger i season-headline.ts, som er testet. Her gjenstår bare
// oversettelsen. Se den filen for hvorfor: tre av de fem gamle overskriftene
// endte på «… i skogen» og dekket 10 av 12 måneder, og «headlineFewInSeason»
// krevde 0 arter i sesong når laveste tall året rundt er 2.
function getSeasonHeadline(month: number, edibleCount: number, t: HomeTranslator) {
  const { key, count } = seasonHeadline(month, edibleCount);
  return count == null ? t(key) : t(key, { count });
}

export default async function HomePage() {
  const t = await getTranslations('Home');
  const locale = await getLocale();
  const supabase = createClient();
  const month = new Date().getMonth() + 1;
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Logged-out visitors get the marketing landing page; logged-in users (web
  // AND the native shell, whose sessions persist) go straight to the app home.
  if (!user) {
    return <LandingPage />;
  }

  const [{ data }, { data: recentFindings }] = await Promise.all([
    supabase
      .from('mushroom_species')
      .select('id,norwegian_name,swedish_name,latin_name,edibility,season_start,season_end,peak_season_start,peak_season_end,commonality,primary_image_url')
      .order('norwegian_name', { ascending: true }),
    supabase
      .from('public_findings')
      .select('id,found_at,location_name,species_id,norwegian_name,edibility,primary_image_url')
      .order('found_at', { ascending: false })
      .limit(4)
  ]);

  const species = (data ?? []) as SpeciesRow[];
  const findings = (recentFindings ?? []) as unknown as RecentFindingRow[];
  // Season is the part of the model that is actually validated (~0.89 AUC),
  // and it needs no location — so this is what the front page may state
  // plainly. Anything about WHICH FOREST belongs on the map, where the user has
  // chosen a point and the claim is "this forest suits X", not "X is here".
  // very_common first. Unknown sorts last rather than first, so a missing value
  // never promotes a species onto the front page.
  const COMMONALITY_ORDER: Record<string, number> = {
    very_common: 0,
    common: 1,
    uncommon: 2,
    rare: 3,
    very_rare: 4
  };
  const commonalityRank = (value: string | null) => COMMONALITY_ORDER[value ?? ''] ?? 9;
  // Samme kalibrerte sesongvindu som kalenderen bruker — katalogvinduet utvidet
  // med månedene der 90 % av de daterte funnene faktisk ligger. Uten posisjon,
  // så ingen regionjustering her.
  const atPeak = (s: SpeciesRow) => isMonthInMask(peakMask(s), month);
  const edibleInSeason = species.filter(
    (s) =>
      (s.edibility === 'edible' || s.edibility === 'conditionally_edible') &&
      isMonthInMask(baseSeasonMask(s), month)
  );
  // ⚠️ HELE tallet, før kuttet på 6 under. Overskriften skal si hvor mange
  // matsopp som er i sesong, ikke hvor mange det er plass til i lista.
  // `inSeasonEdible.length` er `min(antall, 6)`, så den kunne aldri skille
  // august (39) fra januar (2) — begge leste som 6 og 2. Det var en tredje grunn
  // til at overskriften sto stille 10 av 12 måneder.
  const edibleInSeasonCount = edibleInSeason.length;
  const inSeasonEdible = edibleInSeason
    // Peak season first — the strongest thing we can say — then by how often
    // the species is actually encountered. Ranking alphabetically inside the
    // peak group buried kantarell and steinsopp under whatever started with B.
    // "Most likely to find" is exactly what commonality records, and it is a
    // catalogued property, not a claim about a place.
    .sort(
      (a, b) =>
        Number(atPeak(b)) - Number(atPeak(a)) ||
        commonalityRank(a.commonality) - commonalityRank(b.commonality) ||
        getSpeciesDisplayName(a, locale).localeCompare(getSpeciesDisplayName(b, locale), intlLocale(locale))
    )
    .slice(0, 6);
  const dangerousInSeason = species.filter(
    (s) => (s.edibility === 'toxic' || s.edibility === 'deadly') && isMonthInMask(baseSeasonMask(s), month)
  );
  const speciesNames = new globalThis.Map(species.map((item) => [item.id, getSpeciesDisplayName(item, locale)]));

  let userStats: { total: number; species: number } | null = null;
  if (user) {
    const { data: myFindings, error: myFindingsError } = await supabase
      .from('findings')
      .select('species_id')
      .eq('user_id', user.id)
      .eq('is_negative_observation', false)
      // Slettede funn (migrasjon 056) skal ikke telle på statistikk-kortet.
      .is('deleted_at', null)
      .limit(1000);
    // Statistikkortet forsvinner uansett hvis spørringa feiler (userStats
    // forblir null), men da skal det i det minste stå i loggen — ellers ser en
    // spørrefeil nøyaktig ut som «brukeren har ingen funn».
    if (myFindingsError) {
      logger.error('home.user_findings_failed', { userId: user.id, message: myFindingsError.message });
    }
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
            {getSeasonHeadline(month, edibleInSeasonCount, t)}
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

        {/* Rett under «hvordan er det her i dag» kommer «hvor er det best i
            landet». Det er den ene romlige sammenligningen modellen bærer —
            47 poengs spenn mellom regioner mot 7 inne i ett kartutsnitt. Se
            BestRegionsCard. */}
        <BestRegionsCard />

        {/* Soppvarselet sto uten en eneste dør inn i appen: bunnmenyen har det
            ikke, forsiden lenket ikke til /soppforhold (der den eneste
            påmeldingsknappen lå), og kortet selv ligger nederst på
            profilsiden — under funn, innlegg, forum og rapporter. Appen heter
            «Soppvarsel & soppkart» i App Store, så funksjonen var i praksis
            skjult for alle som ikke kom inn utenfra.

            Her, rett under «hvor er det best i landet», er øyeblikket for det:
            leseren har akkurat sett at ett sted ligger på 100 og et annet på
            45, og det neste spørsmålet er «si fra når det snur her». */}
        <VarselCta land={locale === 'sv' ? 'SE' : 'NO'} innlogget />

        {inSeasonEdible.length > 0 ? (
          <article className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl font-bold text-forest-900">{t('inSeasonTitle')}</h2>
              <Link href="/species" className="shrink-0 text-xs font-medium text-forest-800 hover:underline">
                {t('inSeasonSeeAll')}
              </Link>
            </div>
            <p className="mt-0.5 text-xs text-gray-600">{t('inSeasonWhy')}</p>

            <ul className="mt-2.5 space-y-1">
              {inSeasonEdible.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/species/${s.id}`}
                    className="flex items-baseline justify-between gap-2 rounded-lg px-1 py-1 hover:bg-gray-50"
                  >
                    <span className="truncate text-sm font-medium text-gray-900">
                      {getSpeciesDisplayName(s, locale)}
                    </span>
                    <span
                      className={`shrink-0 text-xs ${atPeak(s) ? 'font-medium text-forest-700' : 'text-gray-500'}`}
                    >
                      {atPeak(s) ? t('inSeasonAtPeak') : t('inSeasonInSeason')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {dangerousInSeason.length > 0 ? (
              <Link
                href="/sikkerhet"
                className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 hover:bg-amber-100"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{t('inSeasonDangerous', { count: dangerousInSeason.length })}</span>
              </Link>
            ) : null}
          </article>
        ) : null}

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
                          alt={getSpeciesDisplayName(s, locale)}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : null}
                    </div>
                    <p className="truncate p-2 text-sm font-medium text-forest-900">{getSpeciesDisplayName(s, locale)}</p>
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
                    {getSpeciesDisplayName(s, locale)} <span className="italic text-red-700/80">({s.latin_name})</span>
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
                        <img src={f.primary_image_url} alt={(f.species_id ? speciesNames.get(f.species_id) : null) ?? f.norwegian_name ?? t('mushroomAlt')} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{(f.species_id ? speciesNames.get(f.species_id) : null) ?? f.norwegian_name ?? t('unknownSpecies')}</p>
                      <p className="truncate text-xs text-gray-600">
                        {f.location_name ?? t('unknownLocation')} · {formatTimeAgo(f.found_at, t, locale)}
                      </p>
                    </div>
                    {f.edibility ? <EdibilityBadge edibility={f.edibility} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Spiselighetsmerket over kommer fra artskatalogen, altså «arten
                som ble OPPGITT er spiselig» — ikke «dette funnet er riktig
                bestemt». Ingenting kontrollerer artspåstanden i dag. */}
            <p className="mt-3 text-xs text-gray-500">{t('communityUnverifiedNote')}</p>
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
          <Link
            href="/vilkar"
            className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-forest-800" /> {t('navTerms')}</span>
          </Link>
          <Link
            href="/kjopsvilkar"
            className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-forest-800" /> {t('navPurchaseTerms')}</span>
          </Link>
          <Link
            href="/apenhet"
            className="block rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2"><Microscope className="h-4 w-4 text-forest-800" /> {t('navTransparency')}</span>
          </Link>
        </div>

        <div className="flex justify-center pt-1">
          <LanguageToggle />
        </div>
      </section>
    </PageWrapper>
  );
}
