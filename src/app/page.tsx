import { Suspense } from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { AlertTriangle, Calendar, Camera, Check, Crown, Map, MessageSquare } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { LandingPage } from '@/components/landing/LandingPage';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { kanLoveProve, provesvarForVisning, type Provesvar } from '@/lib/billing/tidligere-abonnent-visning';
import { getStripeServerClient } from '@/lib/stripe/server';
import { ProvGratisVedStart } from '@/components/billing/ProvGratisVedStart';
import { ProveLofteTekst } from '@/components/billing/ProveLofteTekst';
import { HjemSkjelett } from '@/components/home/HjemSkjelett';
import { MushroomDayCard } from '@/components/home/MushroomDayCard';
import { BestRegionsCard } from '@/components/home/BestRegionsCard';
import { SkjulNarFolger } from '@/components/home/SkjulNarFolger';
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
// «i dag», «i går», datoen: Oslo-dager, ikke serverens UTC — se fila.
import { formatTimeAgo } from '@/lib/utils/time-ago';
import { logger } from '@/lib/log';
import { BLOKKERINGSMARGIN, utenBlokkerte } from '@/lib/moderation/blokkering';
import { seasonHeadline } from '@/lib/utils/season-headline';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { prediksjonspunktHjem } from '@/lib/billing/sesongtekst';
import { erOppsummeringstid, sesongoppsummering } from '@/lib/findings/sesongoppsummering';

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

const SISTE_FUNN_ANTALL = 4;
/**
 * Så mange egne funn leses. PostgREST kapper på 1000 uansett, uten å si fra —
 * taket står derfor her, så sesongoppsummeringen kan se om lista er avkortet.
 */
const EGNE_FUNN_TAK = 1000;

// Rows come from the public_findings VIEW (masked display coords), never the
// findings table — direct table reads are owner-only since migration 015.
interface RecentFindingRow {
  id: string;
  user_id: string | null;
  found_at: string;
  location_name: string | null;
  species_id: number | null;
  norwegian_name: string | null;
  edibility: Edibility | null;
  primary_image_url: string | null;
}

/** «14. august» / «14 augusti» for en Oslo-dato («ÅÅÅÅ-MM-DD»). Datoen er alt regnet om; formater den som den står. */
function formatDagOgManed(osloDato: string, locale: string) {
  return new Date(`${osloDato}T12:00:00Z`).toLocaleDateString(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  });
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
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Logged-out visitors get the marketing landing page; logged-in users (web
  // AND the native shell, whose sessions persist) go straight to the app home.
  // Avgjøres FØR noe strømmes: landingssiden skal sendes hel, med ekte status,
  // aldri bak et skjelett.
  if (!user) {
    return <LandingPage />;
  }

  // Toppen, bunnmenyen og et skjelett sendes så snart innloggingen er kjent;
  // innholdet skyves inn i samme svar når dataene er hentet. Før ventet HELE
  // siden på fem rundturer etter hverandre pluss et Stripe-oppslag, så et trykk
  // på «Hjem» sto uten noe tegn til liv til alt var ferdig.
  //
  // Bevisst en <Suspense> HER og ikke en loading.tsx: den måtte ligget i roten
  // av src/app og ville pakket inn landingssiden over og alle offentlige sider
  // uten egen loading-fil (se HjemSkjelett).
  return (
    <PageWrapper>
      <Suspense fallback={<HjemSkjelett />}>
        <HjemInnhold supabase={supabase} bruker={{ id: user.id, email: user.email ?? null }} />
      </Suspense>
    </PageWrapper>
  );
}

/**
 * Alt innlogget innhold på forsiden — ÉN strømmet enhet.
 *
 * Én, ikke flere: tilbudsarket (ProvGratisVedStart) må stå i treet FØR
 * prognosekortet og monteres sammen med det, fordi arket lytter etter kortets
 * «jeg har data»-hendelse, som sendes én gang. Deles de på hver sin
 * Suspense-grense, kan kortet rekke å melde fra før arket lytter.
 */
async function HjemInnhold({
  supabase,
  bruker
}: {
  /** Samme klient som avgjorde innloggingen — den bærer den ferske økta. */
  supabase: ReturnType<typeof createClient>;
  bruker: { id: string; email: string | null };
}) {
  // Måned og år i Oslo-tid, fra den ene kilden (sesongtilstand.ts). Før sto
  // det `new Date().getMonth()`: serverens klokke går i UTC, så forsiden lå en
  // time eller to etter ved hvert månedsskifte — og ville sagt «oktober» over
  // et kort som alt regnet med november.
  const naa = new Date();
  const sesong = sesongtilstand(naa);
  const month = sesong.maaned;
  const aar = Number(sesong.osloDato.slice(0, 4));

  // Premium-kortet: aldri til betalende (de kan ikke løse inn noe), nøytral
  // knapp til tidligere abonnenter (ingen ny gratisuke), «prøv gratis» til nye.
  // «Tidligere» avgjøres av samme regel som checkout og /api/billing/status
  // (tidligere-abonnent.ts) — ikke av om raden finnes: en slettet konto med
  // samme e-post har ingen rad, men Stripe nekter uka.
  //
  // Stripe-oppslaget starter i det raden er lest, og går samtidig med resten.
  // Det har en FRIST (tidligere-abonnent-visning.ts): svarer ikke Stripe i
  // tide, lover forsiden ingenting denne gangen, i stedet for at hver
  // gratisbruker venter på et oppslag som bare er til pynt på en knapp.
  // Betalende spør vi ikke om.
  const abonnementP = getUserBillingSubscription(supabase, bruker.id);
  const provesvarP: Promise<Provesvar> = abonnementP.then((rad) =>
    getBillingCapabilities(rad).paid
      ? 'tidligere'
      : provesvarForVisning({ subscription: rad, email: bruker.email, stripe: getStripeServerClient })
  );

  // ALT som bare trenger bruker-id-en, i én runde. Funnene og varselet sto
  // tidligere etter hverandre under — to rundturer til for ingenting. Begge
  // svarer med {error} i stedet for å kaste, så de kan ikke velte de andre.
  const [
    t,
    locale,
    abonnement,
    provesvar,
    { data },
    { data: recentFindings },
    { data: blokkerte },
    { data: myFindings, error: myFindingsError },
    { data: varsel, error: varselError }
  ] = await Promise.all([
    getTranslations('Home'),
    getLocale(),
    abonnementP,
    provesvarP,
    supabase
      .from('mushroom_species')
      .select('id,norwegian_name,swedish_name,latin_name,edibility,season_start,season_end,peak_season_start,peak_season_end,commonality,primary_image_url')
      .order('norwegian_name', { ascending: true }),
    supabase
      .from('public_findings')
      .select('id,user_id,found_at,location_name,species_id,norwegian_name,edibility,primary_image_url')
      .order('found_at', { ascending: false })
      // Noen flere enn de fire som vises, så lista er full også etter at funn
      // fra blokkerte brukere er tatt ut under.
      .limit(SISTE_FUNN_ANTALL * BLOKKERINGSMARGIN),
    // Egne rader via RLS. Feiler oppslaget, vises funnene ufiltrert som før.
    supabase.from('blocked_users').select('blocked_id'),
    supabase
      .from('findings')
      // found_at for «Sesongen din» (sesongoppsummering.ts). Samme spørring
      // som før — ingen ny rundtur.
      .select('species_id,found_at')
      .eq('user_id', bruker.id)
      .eq('is_negative_observation', false)
      // Slettede funn (migrasjon 056) skal ikke telle på statistikk-kortet.
      .is('deleted_at', null)
      // Nyeste først: treffer en bruker taket, er det de ELDSTE som faller
      // ut, og inneværende sesong er hel.
      .order('found_at', { ascending: false })
      .limit(EGNE_FUNN_TAK),
    // .limit(1).maybeSingle() av samme grunn som i /api/me/soppvarsel:
    // tabellen tillater flere rader per bruker.
    supabase
      .from('alert_subscriptions')
      .select('region')
      .eq('user_id', bruker.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
  ]);

  const betaler = getBillingCapabilities(abonnement).paid;
  if (!betaler && provesvar === 'ukjent') {
    // Ingen e-post i loggen. Én linje per visning er nok til å se et tregt Stripe.
    logger.warn('home.provesvar_ukjent', { userId: bruker.id });
  }
  const kanFaaProve = !betaler && kanLoveProve(provesvar);

  const species = (data ?? []) as SpeciesRow[];
  // Blokkering skjuler innlegg og kommentarer via RLS, men public_findings
  // kjenner ikke blokkeringslista — uten dette sto den blokkertes funn fortsatt
  // under «Siste funn fra fellesskapet».
  const findings = utenBlokkerte(
    (recentFindings ?? []) as unknown as RecentFindingRow[],
    ((blokkerte ?? []) as Array<{ blocked_id: string }>).map((rad) => rad.blocked_id)
  ).slice(0, SISTE_FUNN_ANTALL);
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

  // Statistikkortet forsvinner uansett hvis spørringa feiler (userStats
  // forblir null), men da skal det i det minste stå i loggen — ellers ser en
  // spørrefeil nøyaktig ut som «brukeren har ingen funn».
  if (myFindingsError) {
    logger.error('home.user_findings_failed', { userId: bruker.id, message: myFindingsError.message });
  }
  const rows = (myFindings ?? []) as { species_id: number | null; found_at: string | null }[];
  const userStats: { total: number; species: number } | null =
    rows.length > 0
      ? {
          total: rows.length,
          species: new Set(rows.map((r) => r.species_id).filter((id): id is number => id != null)).size
        }
      : null;
  // «Sesongen din 2026»: november–mars, og bare når sesongen har minst ett
  // funn. Da tar den plassen til livstidstallene i kortet under — for de
  // fleste er de to like, og samme tall to ganger er det forsiden nettopp ble
  // kvitt. Reglene (sesongår, Oslo-dato, avkortet liste) står i
  // sesongoppsummering.ts.
  const minSesong = erOppsummeringstid(naa)
    ? sesongoppsummering(rows, naa, { avkortet: rows.length >= EGNE_FUNN_TAK })
    : null;
  const oftestNavn = minSesong?.oftest ? (speciesNames.get(minSesong.oftest.speciesId) ?? null) : null;

  // Har brukeren allerede slått på soppvarsel? Da skal ikke forsiden be henne
  // om det hver eneste dag. På /soppforhold er oppfordringen riktig — der er
  // publikummet uinnloggede besøkende — men her er alle innlogget, og en del
  // av dem er abonnenter fra før.
  //
  // En feil her skal ikke skjule kortet — da er det bedre å spørre en abonnent
  // én gang for mye enn å gjemme funksjonen for en som ikke har den.
  if (varselError) {
    logger.warn('home.varsel_oppslag_feilet', { userId: bruker.id, message: varselError.message });
  }
  const harVarsel = varsel != null;

  return (
    <section className="space-y-4">
      <header className="pt-2 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-forest-700">
          {getMonthName(month, t)} {aar}
        </p>
        <h1 className="mt-1 font-serif text-4xl font-bold tracking-tight text-forest-900">
          {getSeasonHeadline(month, edibleInSeasonCount, t)}
        </h1>
        {inSeasonEdible.length > 0 ? (
          <p className="mt-1 text-sm text-gray-700">
            {/* Hele tallet — ikke de seks kortene vi viser. Overskriften og denne linja sa 46 og 6 om samme sak. */}
            {t('edibleInSeasonCount', { count: edibleInSeasonCount })}
            {dangerousInSeason.length > 0
              ? ` · ${t('dangerousToWatch', { count: dangerousInSeason.length })}`
              : ''}
          </p>
        ) : null}
      </header>

      {/* Før kortet i treet: arket lytter etter «kortet har data» (og introen),
          og lytteren må stå klar før kortets egen mount-effekt kan sende. */}
      {kanFaaProve ? <ProvGratisVedStart /> : null}
      {/* «Følg området ditt» ligger inne i kortet. Serveren vet alt om
          kontoraden finnes, så et abonnent-kort slipper å hente noe. */}
      <MushroomDayCard innlogget folgerOmrade={harVarsel} />

      {/* Tilbudet rett under forholdene, og én gang som ark ved første innlogging —
          gratisbrukere vi betaler for å hente inn, så aldri prissiden (1 av 12 kartbrukere,
          11. sep 2026). Betalende ser ingenting av dette.
          Kortet leder til sesongpasset (?plan=season_pass — prissiden åpner med det
          valgt) og lover ingen sopp: tittelen sier hva du får, ikke hva du finner.
          Punktene i samme rekkefølge som arket: områdene med begrunnelse, offline, AI sist.
          Områdepunktet følger sesongen som arket: november–juni finner ⭐ Lovende
          ofte ingenting, så der står «når forholdene tillater det» (sesongtekst.ts). */}
      {betaler ? null : (
      <Link
        href="/pricing?plan=season_pass"
        className="block rounded-2xl bg-gradient-to-br from-forest-900 to-forest-800 p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
      >
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 shrink-0 text-amber-400" />
            <h2 className="font-serif text-xl font-semibold">{t('premiumTitle')}</h2>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-white/90">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-amber-400" /> {t(prediksjonspunktHjem(naa))}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-amber-400" /> {t('premiumFeatureOfflineMap')}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-amber-400" /> {t('premiumFeatureUnlimitedAi')}
            </li>
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <NonNativeOnly>
              <p className="text-sm text-white/80">
                {t('premiumPriceFrom')}{' '}
                <span className="font-serif text-lg font-bold text-amber-300">
                  {t('premiumPricePerMonth', { price: Math.round((BILLING_PLANS.season_pass.yearlyNok ?? 249) / 12) })}
                </span>{' '}
                {t('premiumPriceWithPass')}
              </p>
            </NonNativeOnly>
            <span className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-semibold text-forest-900">
              {/* «Prøv Sesongpass gratis» bare når butikken faktisk gir gratisuka
                  PÅ PASSET — i appen avgjør App Store det per produkt, og knappen
                  skal ikke love mer enn arket. Ellers «Se Sesongpass og Premium». */}
              {kanFaaProve ? <ProveLofteTekst med={t('premiumSeePlans')} utenProve={t('premiumSeePlansNeutral')} /> : t('premiumSeePlansNeutral')}
            </span>
          </div>
        </Link>
      )}


      {/* Rett under «hvordan er det her i dag» kommer «hvor er det best i
          landet». Det er den ene romlige sammenligningen modellen bærer —
          47 poengs spenn mellom regioner mot 7 inne i ett kartutsnitt. Se
          BestRegionsCard. */}
      <BestRegionsCard folger={harVarsel} />

      {/* Soppvarselet sto uten en eneste dør inn i appen: bunnmenyen har det
          ikke, forsiden lenket ikke til /soppforhold (der den eneste
          påmeldingsknappen lå), og kortet selv ligger nederst på
          profilsiden — under funn, innlegg, forum og rapporter. Appen heter
          «Soppvarsel & soppkart» i App Store, så funksjonen var i praksis
          skjult for alle som ikke kom inn utenfra.

          Her, rett under «hvor er det best i landet», er øyeblikket for det:
          leseren har akkurat sett at ett sted ligger på 100 og et annet på
          45, og det neste spørsmålet er «si fra når det snur her».

          `harVarsel` er det serveren så. Begynner brukeren å følge et område
          fra stripa i kortet over, tar SkjulNarFolger blokka bort der og da —
          ellers ba siden om varselet én gang til, rett under bekreftelsen. */}
      {harVarsel ? null : (
        <SkjulNarFolger>
          <VarselCta land={locale === 'sv' ? 'SE' : 'NO'} innlogget />
        </SkjulNarFolger>
      )}

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
          {/* flex-wrap: «Sesongen din 2026» er lengre enn «Dine funn», og på en
              smal telefon får ikke tittelen og de to lenkene plass på én linje. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="font-semibold text-forest-900">
              {/* Året som tekst: et tall ville blitt formatert «2 026». */}
              🍄 {minSesong ? t('seasonSummaryTitle', { year: String(minSesong.aar) }) : t('yourFindings')}
            </h2>
            <div className="flex gap-3">
              {/* Mine steder lå bare bak Profil — én dør inn til «skogen min» herfra. */}
              <Link href="/mine-steder" className="text-xs font-medium text-forest-800 hover:underline">
                📍 {t('myPlaces')} →
              </Link>
              <Link href="/profile" className="text-xs font-medium text-forest-800 hover:underline">
                {t('seeYourProfile')} →
              </Link>
            </div>
          </div>
          <div className="mt-3 flex gap-8">
            <div>
              <p className="text-2xl font-bold text-forest-900">{minSesong ? minSesong.funn : userStats.total}</p>
              <p className="text-xs text-gray-600">{t('findingsRegistered')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-forest-900">{minSesong ? minSesong.arter : userStats.species}</p>
              <p className="text-xs text-gray-600">
                {t('speciesCount', { count: minSesong ? minSesong.arter : userStats.species })}
              </p>
            </div>
          </div>
          {minSesong ? (
            // Brukerens egen logg, lest opp — ingenting om hva som finnes i
            // skogen. «Registrert», ikke «funnet»: datoen er dagen funnet ble
            // lagt inn (found_at settes av databasen ved lagring).
            <div className="mt-3 space-y-0.5 border-t border-gray-100 pt-2.5 text-xs text-gray-600">
              <p>
                {minSesong.forste === minSesong.siste
                  ? t('seasonSummaryOneDay', { date: formatDagOgManed(minSesong.forste, locale) })
                  : t('seasonSummarySpan', {
                      first: formatDagOgManed(minSesong.forste, locale),
                      last: formatDagOgManed(minSesong.siste, locale)
                    })}
              </p>
              {minSesong.oftest && oftestNavn ? (
                <p>{t('seasonSummaryMostFound', { species: oftestNavn, count: minSesong.oftest.antall })}</p>
              ) : null}
              {/* Livstidstallene bare når de sier noe annet enn sesongen over. */}
              {userStats.total > minSesong.funn ? (
                <p className="text-gray-500">
                  {t('seasonSummaryAllTime', { total: userStats.total, species: userStats.species })}
                </p>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      <LastTripCard />

      {/* ÉN gang. De samme seks artene sto først som tekstliste («Hva som er i
          sesong nå») rett under varselblokka, og så her som bilder — med en
          tredje påminnelse om de giftige imellom. Dette kortet har fått det
          tekstlista hadde alene: toppsesong-merket, linja om at sesong er det
          vi vet sikrest, og «Se alle». Den røde lista under står som før. */}
      <article className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-forest-800" />
            <h2 className="font-semibold">{t('inSeasonNow', { month: getMonthName(month, t) })}</h2>
          </div>
          <Link href="/calendar" className="shrink-0 text-xs font-medium text-forest-800 hover:underline">
            {t('seeFullCalendar')} →
          </Link>
        </div>
        {inSeasonEdible.length === 0 ? (
          <p className="mt-3 text-sm text-gray-700">
            {t('noneInSeason', { month: getMonthName(month, t) })}
          </p>
        ) : (
          <>
            {/* Sesong er den delen av modellen som faktisk er validert, og den
                trenger ingen posisjon. HVILKEN SKOG hører hjemme på kartet. */}
            <p className="mb-3 mt-0.5 text-xs text-gray-600">{t('inSeasonWhy')}</p>
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
                    <div className="p-2">
                      <p className="truncate text-sm font-medium text-forest-900">{getSpeciesDisplayName(s, locale)}</p>
                      {/* Toppsesong kommer fra katalogens toppvindu — en egenskap
                          ved arten og måneden, ikke en påstand om et sted. */}
                      <p className={`text-xs ${atPeak(s) ? 'font-medium text-forest-700' : 'text-gray-600'}`}>
                        {atPeak(s) ? t('inSeasonAtPeak') : t('inSeasonInSeason')}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right">
              <Link href="/species" className="text-xs font-medium text-forest-800 hover:underline">
                {t('inSeasonSeeAll')}
              </Link>
            </p>
          </>
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
                      {f.location_name ?? t('unknownLocation')} · {formatTimeAgo(f.found_at, t, locale, naa)}
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

      {/* Kortet vises også i appen: prissiden selger via App Store der (PR #91).
          Det sto bak NonNativeOnly fra før kjøp i app fantes, og da så ingen
          app-bruker tilbudet — null prøveperioder på 76 brukere (9. sep 2026).
          Bare kroneprisen holdes utenfor appen: den er Stripe-prisen, og butikkens
          pris vises på prissiden. */}

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

      {/* Seks lenker som seks kort tok tre rader nederst på hver forside. De er
          de samme seks, men som én rad tekstlenker. ALLE skal stå: personvern,
          vilkår og kjøpsvilkår må kunne nås inne fra appen (App Store), og
          sikkerhetssiden er veien til Giftinformasjonen. 44 px treffhøyde. */}
      <ul className="flex flex-wrap justify-center gap-x-1">
        {[
          { href: '/sikkerhet', label: t('navSafety') },
          { href: '/personvern', label: t('navPrivacy') },
          { href: '/datakilder', label: t('navDataSources') },
          { href: '/vilkar', label: t('navTerms') },
          { href: '/kjopsvilkar', label: t('navPurchaseTerms') },
          { href: '/apenhet', label: t('navTransparency') }
        ].map((lenke) => (
          <li key={lenke.href}>
            <Link
              href={lenke.href}
              className="inline-flex min-h-[44px] items-center px-2.5 text-xs font-medium text-gray-700 underline-offset-2 hover:text-forest-900 hover:underline"
            >
              {lenke.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex justify-center pt-1">
        <LanguageToggle />
      </div>
    </section>
  );
}
