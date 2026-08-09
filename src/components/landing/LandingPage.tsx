import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Camera,
  Check,
  CloudRain,
  Crown,
  Leaf,
  Map,
  TreePine,
  WifiOff
} from 'lucide-react';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { BILLING_PLANS, FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';

/**
 * Marketing landing page shown to logged-OUT visitors on `/` (logged-in users
 * get the app home). Ported from the Claude Design draft («Vit når soppen
 * kommer») into the app's own design system. Honesty rule applies here more
 * than anywhere: we sell WHEN + right forest type — never exact spots.
 *
 * Renders inside the app chrome (Header + BottomNav), so it has no nav of its
 * own; the bottom nav doubles as an invitation to explore the open pages.
 */

const PREMIUM_MONTHLY = BILLING_PLANS.premium.monthlyNok ?? 79;
const SEASON_YEARLY = BILLING_PLANS.season_pass.yearlyNok ?? 249;

/** Én rad i FAQ-en. Egen komponent fordi én av dem skjules i iOS-skallet. */
function FaqRow({ q, a }: { q: string; a: string }) {
  return (
    <details className="group py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-gray-900">
        {q}
        <span aria-hidden="true" className="text-gray-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-700">{a}</p>
    </details>
  );
}

/** Mini soppforhold-gauge for the phone mockup (static, matches a real July day). */
function MockGauge() {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * 0.72;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden="true">
      <circle cx="32" cy="32" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke="#15803d"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="#14532d">
        72
      </text>
      <text x="32" y="42" textAnchor="middle" fontSize="8" fill="#6b7280">
        av 100
      </text>
    </svg>
  );
}

/** Static phone mockup of the app's home screen (pure CSS/SVG — no screenshot). */
function PhoneMockup({ t }: { t: Awaited<ReturnType<typeof getTranslations<'Landing'>>> }) {
  const forecastBars = [
    { h: 'h-9', tone: 'bg-forest-600', label: t('mockToday') },
    { h: 'h-6', tone: 'bg-amber-500', label: 'ons' },
    { h: 'h-7', tone: 'bg-amber-500', label: 'tor' },
    { h: 'h-6', tone: 'bg-amber-500', label: 'fre' },
    { h: 'h-9', tone: 'bg-forest-600', label: 'lør' },
    { h: 'h-8', tone: 'bg-amber-500', label: 'søn' },
    { h: 'h-7', tone: 'bg-amber-500', label: 'man' }
  ];

  return (
    <div className="mx-auto w-[290px] rounded-[2.4rem] border-[10px] border-[#122706] bg-[#122706] shadow-2xl">
      <div className="overflow-hidden rounded-[1.8rem] bg-cream">
        {/* Statuslinje */}
        <div className="flex items-center justify-between bg-forest-900 px-5 pb-1 pt-2 text-[10px] font-semibold text-white">
          <span>09:41</span>
          <span aria-hidden="true">📶 🔋</span>
        </div>
        {/* App-header */}
        <div className="flex items-center justify-between bg-forest-900 px-4 pb-2 text-white">
          <span className="font-serif text-sm font-semibold">🍄 Mycelet</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold">{t('mockFreeBadge')}</span>
        </div>
        <div className="space-y-2.5 p-3">
          <div className="text-center">
            <p className="text-[9px] font-medium uppercase tracking-widest text-forest-700">{t('mockMonth')}</p>
            <p className="font-serif text-lg font-bold text-forest-900">{t('mockHeadline')}</p>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <MockGauge />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-forest-900">🍄 {t('mockVerdict')}</p>
                <p className="text-[9px] leading-snug text-gray-600">{t('mockVerdictSub')}</p>
              </div>
            </div>
            <p className="mt-2 border-t border-gray-100 pt-2 text-[9px] font-medium text-gray-500">{t('mockOutlook')}</p>
            <div className="mt-1 flex items-end justify-between gap-1">
              {forecastBars.map((bar, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-0.5">
                  <div className={`w-full rounded-sm ${bar.h} ${bar.tone}`} />
                  <span className={`text-[7px] ${index === 0 ? 'font-bold text-forest-900' : 'text-gray-500'}`}>{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-gradient-to-br from-forest-800 to-forest-700 p-3 text-white">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Camera className="h-4 w-4" />
            </span>
            <div>
              <p className="font-serif text-xs font-semibold">{t('mockIdentify')}</p>
              <p className="text-[9px] text-white/80">{t('mockIdentifySub')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function LandingPage() {
  const t = await getTranslations('Landing');

  const steps = [
    { icon: CloudRain, title: t('step1Title'), body: t('step1Body') },
    { icon: Map, title: t('step2Title'), body: t('step2Body') },
    { icon: Camera, title: t('step3Title'), body: t('step3Body') }
  ];

  const features = [
    { icon: CloudRain, title: t('featForecastTitle'), body: t('featForecastBody') },
    { icon: Map, title: t('featMapTitle'), body: t('featMapBody') },
    { icon: Camera, title: t('featAiTitle'), body: t('featAiBody') },
    { icon: Calendar, title: t('featCalendarTitle'), body: t('featCalendarBody') },
    { icon: BookOpen, title: t('featLibraryTitle'), body: t('featLibraryBody') },
    { icon: WifiOff, title: t('featOfflineTitle'), body: t('featOfflineBody') }
  ];

  const forestRows = [
    { forest: t('forestSpruce'), species: t('forestSpruceSpecies') },
    { forest: t('forestBirch'), species: t('forestBirchSpecies') },
    { forest: t('forestPine'), species: t('forestPineSpecies') },
    { forest: t('forestMeadow'), species: t('forestMeadowSpecies') }
  ];

  const faqs = [
    { q: t('faqFreeQ'), a: t('faqFreeA', { limit: FREE_DAILY_AI_LIMIT }) },
    { q: t('faqSwedenQ'), a: t('faqSwedenA') },
    { q: t('faqAiQ'), a: t('faqAiA') },
    { q: t('faqOfflineQ'), a: t('faqOfflineA') }
    // «Når kommer iOS-appen?» er FLYTTET ned i en NonNativeOnly-blokk. Den lå
    // her, og siden dette er den første skjermen i iOS-skallet (capacitor
    // server.url peker på www.mycelet.com, og /-ruten viser LandingPage til
    // alle som ikke er logget inn), fortalte appen sin egen anmelder hos Apple
    // at den «er til vurdering hos Apple» og ba dem åpne mycelet.com i
    // nettleseren i mellomtiden. Det er en oppfordring ut av appen, til et sted
    // der de samme abonnementene selges via Stripe — retningslinje 3.1.1.
  ];

  return (
    <PageWrapper wide>
      <div className="space-y-14 pb-10 pt-2 lg:space-y-20 lg:pt-6">
      {/* ── Hero: stablet på mobil, delt tekst/telefon på desktop ───── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 space-y-5 text-center lg:grid-cols-[1.2fr_1fr] lg:gap-6 lg:space-y-0 lg:text-left">
        <div className="space-y-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-forest-900">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {t('heroBadge')}
        </span>
        <h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight text-forest-900 lg:text-7xl">
          {t('heroTitle')}
        </h1>
        <p className="mx-auto max-w-md text-base text-gray-700 lg:mx-0 lg:text-lg">{t('heroSub')}</p>
        <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 rounded-xl bg-forest-800 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-700"
          >
            {t('heroCta')} →
          </Link>
          <NonNativeOnly>
            <span className="inline-flex flex-col items-start rounded-xl border border-gray-300 px-5 py-2 text-left">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{t('heroAppStoreKicker')}</span>
              <span className="text-sm font-semibold text-gray-800">App Store</span>
            </span>
          </NonNativeOnly>
        </div>
        <p className="text-xs text-gray-500">{t('heroTrust')}</p>
        </div>
        <div className="pt-2 lg:pt-0">
          <PhoneMockup t={t} />
        </div>
      </section>

      {/* ── Slik virker det ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-center font-serif text-3xl font-bold text-forest-900 lg:text-4xl">{t('howHeading')}</h2>
        <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-2xl bg-white p-4 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-100 font-serif text-lg font-bold text-forest-800">
                {index + 1}
              </span>
              <h3 className="mt-3 flex items-center gap-2 font-semibold text-forest-900">
                <step.icon className="h-4 w-4 text-forest-700" />
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Funksjoner ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-center font-serif text-3xl font-bold text-forest-900 lg:text-4xl">{t('featuresHeading')}</h2>
        <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-2xl bg-white p-4 shadow-card">
              <h3 className="flex items-center gap-2 font-semibold text-forest-900">
                <feature.icon className="h-4 w-4 shrink-0 text-forest-700" />
                {feature.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Lær skogen ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-center font-serif text-3xl font-bold text-forest-900 lg:text-4xl">{t('forestHeading')}</h2>
        <p className="mx-auto max-w-md text-center text-sm text-gray-700">{t('forestIntro')}</p>
        <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2">
          {forestRows.map((row) => (
            <div
              key={row.forest}
              className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card"
            >
              <TreePine className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
              <div>
                <p className="font-semibold text-forest-900">{row.forest}</p>
                <p className="text-sm text-gray-700">{row.species}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Priser ──────────────────────────────────────────────────────
          Skjult i iOS-skallet. Beløpene her er hardkodede norske kroner fra
          BILLING_PLANS (Stripe-prisen), mens App Store krever at prisen en
          bruker ser, er den App Store faktisk vil trekke — i kontoens egen
          valuta. En svensk eller amerikansk konto fikk «79 kr» servert på
          appens første skjerm. Prissiden (/pricing) gjør dette riktig: den
          leser priceString fra RevenueCat. Her finnes ikke den muligheten,
          fordi seksjonen vises til utloggede brukere før RevenueCat er satt
          opp — så da vises den ikke i appen i det hele tatt. To «Kom i gang
          gratis»-knapper står igjen (hero og bunn), så ingen vei bort blir
          borte. ── Apple 3.1.2. */}
      <NonNativeOnly>
      <section className="space-y-4">
        <h2 className="text-center font-serif text-3xl font-bold text-forest-900 lg:text-4xl">{t('pricingHeading')}</h2>
        <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-3">
          <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="font-serif text-lg font-semibold text-forest-900">{t('planFree')}</h3>
            <p className="mt-1 text-2xl font-bold text-forest-900">0 kr</p>
            <ul className="mt-2 flex-1 space-y-1 text-sm text-gray-700">
              {[t('planFreeF1', { limit: FREE_DAILY_AI_LIMIT }), t('planFreeF2'), t('planFreeF3')].map((feature) => (
                <li key={feature} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" />
                  {feature}
                </li>
              ))}
            </ul>
          </article>
          <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="flex items-center justify-between font-serif text-lg font-semibold text-forest-900">
              {t('planPremium')} <Crown className="h-4 w-4 text-forest-800" />
            </h3>
            <p className="mt-1 text-2xl font-bold text-forest-900">
              {PREMIUM_MONTHLY} kr<span className="text-sm font-medium text-gray-600">{t('perMonth')}</span>
            </p>
            <ul className="mt-2 flex-1 space-y-1 text-sm text-gray-700">
              {[t('planPremiumF1'), t('planPremiumF2'), t('planPremiumF3')].map((feature) => (
                <li key={feature} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" />
                  {feature}
                </li>
              ))}
            </ul>
          </article>
          <article className="relative flex flex-col rounded-2xl border-2 border-forest-700 bg-white p-4 ring-1 ring-forest-700">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-forest-900">
              {t('bestValue')}
            </span>
            <h3 className="flex items-center justify-between font-serif text-lg font-semibold text-forest-900">
              {t('planSeason')} <Leaf className="h-4 w-4 text-forest-800" />
            </h3>
            <p className="mt-1 text-2xl font-bold text-forest-900">
              {SEASON_YEARLY} kr<span className="text-sm font-medium text-gray-600">{t('perYear')}</span>
            </p>
            <ul className="mt-2 flex-1 space-y-1 text-sm text-gray-700">
              {[t('planSeasonF1'), t('planSeasonF2')].map((feature) => (
                <li key={feature} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-700" />
                  {feature}
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p className="text-center text-sm">
          <Link href="/auth/register" className="font-semibold text-forest-800 underline">
            {t('pricingCta')}
          </Link>
          <span className="text-gray-500"> · {t('pricingNote')}</span>
        </p>
      </section>
      </NonNativeOnly>

      {/* ── Sikkerhet ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-forest-900">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          {t('safetyHeading')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">{t('safetyBody')}</p>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-center font-serif text-3xl font-bold text-forest-900 lg:text-4xl">{t('faqHeading')}</h2>
        <div className="mx-auto max-w-3xl divide-y divide-gray-100 rounded-2xl bg-white p-4 shadow-card">
          {faqs.map((faq) => (
            <FaqRow key={faq.q} q={faq.q} a={faq.a} />
          ))}
          {/* Spørsmålet gir bare mening for en som IKKE allerede sitter i
              iOS-appen. Se kommentaren ved `faqs` over. */}
          <NonNativeOnly>
            <FaqRow q={t('faqIosQ')} a={t('faqIosA')} />
          </NonNativeOnly>
        </div>
      </section>

      {/* ── Avslutnings-CTA + footer ────────────────────────────────── */}
      <section className="space-y-6 text-center">
        <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-br from-forest-900 to-forest-800 p-6 text-white lg:p-10">
          <h2 className="font-serif text-2xl font-bold">{t('finalCtaHeading')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-white/85">{t('finalCtaSub')}</p>
          <Link
            href="/auth/register"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-forest-900 transition hover:bg-amber-300"
          >
            {t('heroCta')} →
          </Link>
        </div>
        <p className="text-xs text-gray-500">{t('sourcesLine')}</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <Link href="/personvern" className="hover:underline">
            {t('footerPrivacy')}
          </Link>
          <Link href="/kjopsvilkar" className="hover:underline">
            {t('footerTerms')}
          </Link>
          <Link href="/datakilder" className="hover:underline">
            {t('footerSources')}
          </Link>
          <a href="mailto:post@mycelet.com" className="hover:underline">
            post@mycelet.com
          </a>
        </nav>
      </section>
      </div>
    </PageWrapper>
  );
}
