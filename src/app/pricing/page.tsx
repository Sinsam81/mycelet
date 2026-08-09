'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BILLING_STATUS_KEY } from '@/lib/hooks/useBilling';
import * as Sentry from '@sentry/nextjs';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Crown, Leaf, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { BILLING_PLANS, FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { canPurchasePlan, getBlockingPaidPlan, getPlanViewState } from '@/lib/billing/plan-state';
import { seasonPriceComesFromStore, showsStorePrices } from '@/lib/billing/store-pricing';
import { statusLabel, tierLabel } from '@/lib/billing/labels';
import { useIsNative } from '@/lib/hooks/useIsNative';
import { trackEvent } from '@/lib/analytics';
import { createClient } from '@/lib/supabase/client';
import {
  IapOffer,
  configurePurchases,
  getIapOffers,
  isIapAvailable,
  purchaseIapOffer,
  restoreIapPurchases
} from '@/lib/native/purchases';
import { intlLocale } from '@/lib/utils/intl-locale';

type BillingStatusResponse = {
  subscription: {
    tier: 'free' | 'premium' | 'season_pass';
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    // Kundeportalen krever en Stripe-kunde; uten denne svarer /api/billing/portal
    // 400, så knappen skal ikke vises.
    stripe_customer_id?: string | null;
  } | null;
  capabilities: {
    tier: 'free' | 'premium' | 'season_pass';
    status: string;
    paid: boolean;
    aiDailyLimit: number | null;
  };
};

// Amounts come from BILLING_PLANS (the same source the checkout uses), so the
// page can never advertise a different price than Stripe charges.
const PREMIUM_MONTHLY = BILLING_PLANS.premium.monthlyNok ?? 79;
const SEASON_YEARLY = BILLING_PLANS.season_pass.yearlyNok ?? 249;
// Bump this whenever the consent wording in the checkbox changes, so a stored
// consent can be traced back to the exact text the customer was shown.
const PURCHASE_CONSENT_VERSION = 'v2-2026-07-30';

const SEASON_PER_MONTH = Math.round(SEASON_YEARLY / 12);

// Next 15+ requires useSearchParams() inside a Suspense boundary; default
// export at the bottom wraps PricingInner.
function PricingInner() {
  const t = useTranslations('Pricing');
  const queryClient = useQueryClient();
  const locale = useLocale();
  const searchParams = useSearchParams();

  // Nøklene ligger i src/lib/billing/labels.ts, delt med profilsiden.
  const TIER_LABELS: Record<'free' | 'premium' | 'season_pass', string> = {
    free: tierLabel('free', t),
    premium: tierLabel('premium', t),
    season_pass: tierLabel('season_pass', t)
  };

  const [loadingPlan, setLoadingPlan] = useState<'premium' | 'season_pass' | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Distance-selling consent: the customer must accept immediate delivery + that
  // the 14-day withdrawal right then lapses, before checkout (angrerettloven /
  // distansavtalslagen digital-content exception). Without it, the right extends.
  const [agreedToPurchaseTerms, setAgreedToPurchaseTerms] = useState(false);
  // On iOS, digital subscriptions must go through Apple IAP, not Stripe (App
  // Store rule 3.1.1). The native shell buys via RevenueCat; the web keeps the
  // full Stripe flow. If the RevenueCat key isn't configured (or the shell is
  // an old build without the plugin), the purchase section degrades to an
  // informational message instead of broken buttons.
  const native = useIsNative();
  const [iapOffers, setIapOffers] = useState<IapOffer[] | null>(null);
  const [iapNeedsLogin, setIapNeedsLogin] = useState(false);
  const [iapBusy, setIapBusy] = useState<'purchase' | 'restore' | null>(null);
  const [iapNotice, setIapNotice] = useState<string | null>(null);
  // ⚠️ Apple avviste 1.0 under 3.1.2. Disse to flaggene fantes ikke, og fraværet
  // ga to feil en reviewer ville sett med én gang:
  //
  //  · iapChecked — uten den kunne ikke siden skille «henter tilbudet fra App
  //    Store» fra «det finnes ikke noe tilbud». Alt som ikke var klart ENNÅ ble
  //    meldt som utilgjengelig, så «abonnement kommer snart» blinket forbi ved
  //    HVERT besøk på prissiden — og ble stående for godt hvis kallet feilet.
  //    En reviewer som ser «kommer snart» på en betalingsside, avviser appen.
  //
  //  · iapConfigured — «Gjenopprett kjøp» lå bak `iapReady` (= tilbud lastet).
  //    Feilet tilbudshentingen, forsvant nettopp den knappen Apple krever, for
  //    nettopp den kunden som trengte den: en som allerede har betalt. Restore
  //    trenger bare at SDK-en er satt opp, ikke at tilbudene er hentet.
  const [iapChecked, setIapChecked] = useState(false);
  const [iapConfigured, setIapConfigured] = useState(false);
  /** Bumpes av «Prøv igjen» og kjører oppsettet på nytt. */
  const [iapAttempt, setIapAttempt] = useState(0);
  // Unmount guard shared by the IAP effect and the post-purchase poll, so no
  // fetch/setState survives navigation away from the page.
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const iapReady = (iapOffers?.length ?? 0) > 0;

  // Er det App Store som setter prisen, kan ikke teksten rundt kortet fortsette
  // å love Stripe-prisen i norske kroner. Da hadde det stått «kr 269,00 /år» i
  // kortet, «Tilsvarer 21 kr/mnd» rett under og «(249 kr)» i FAQ-en — tre
  // priser på samme skjerm, og feil valuta for en svensk App Store-konto.
  const storePrices = showsStorePrices({ native, offers: iapOffers });
  const seasonPriceFromStore = seasonPriceComesFromStore({ native, offers: iapOffers });

  const planCards = [
    {
      id: 'free',
      title: t('tierFree'),
      tagline: t('freeTagline'),
      price: '0 kr',
      period: '',
      lead: null,
      features: [
        t('freeFeature1', { limit: FREE_DAILY_AI_LIMIT }),
        t('freeFeature2'),
        t('freeFeature3')
      ],
      highlight: false
    },
    {
      id: 'premium',
      title: t('tierPremium'),
      tagline: t('premiumTagline'),
      price: `${PREMIUM_MONTHLY} kr`,
      period: t('perMonth'),
      lead: t('premiumLead'),
      // «Prioritert eksperthjelp (kommer)» sto her, med hake, som fjerde gode
      // ved Premium. Å selge et abonnement på en funksjon som ikke finnes er
      // 3.1.2 rett i fleisen. Den kommer tilbake den dagen den finnes.
      features: [t('premiumFeature1'), t('premiumFeature2'), t('premiumFeature3')],
      highlight: false
    },
    {
      id: 'season_pass',
      title: t('tierSeasonPass'),
      tagline: t('seasonTagline'),
      price: `${SEASON_YEARLY} kr`,
      period: t('perYear'),
      lead: t('seasonLead'),
      features: [
        seasonPriceFromStore ? t('seasonFeature1Native') : t('seasonFeature1', { perMonth: SEASON_PER_MONTH }),
        t('seasonFeature2'),
        t('seasonFeature3')
      ],
      highlight: true
    }
  ] as const;

  const faqItems = [
    {
      q: t('faq1Q'),
      a: seasonPriceFromStore ? t('faq1ANative') : t('faq1A', { yearly: SEASON_YEARLY })
    },
    {
      q: t('faq2Q'),
      a: t('faq2A')
    },
    {
      q: t('faq3Q'),
      a: t('faq3A', { limit: FREE_DAILY_AI_LIMIT })
    },
    {
      q: t('faq4Q'),
      a: t('faq4A')
    }
  ];

  useEffect(() => {
    if (!native || !isIapAvailable()) return;
    (async () => {
      setIapChecked(false);
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (unmountedRef.current) return;
        if (!user) {
          // Logged-out native user: point at login instead of the misleading
          // "kommer snart" message.
          setIapNeedsLogin(true);
          return;
        }
        setIapNeedsLogin(false);
        const ok = await configurePurchases(user.id);
        if (unmountedRef.current) return;
        if (!ok) return;
        // Fra dette punktet er RevenueCat satt opp for denne brukeren, og
        // restorePurchases() kan kalles trygt — uavhengig av om tilbudene under
        // lar seg hente. Det er hele grunnen til at flagget settes HER og ikke
        // sammen med tilbudene.
        setIapConfigured(true);
        const offers = await getIapOffers();
        if (unmountedRef.current) return;
        setIapOffers(offers);
      } catch (error) {
        // Sto som `catch {}` — helt stille. Da kjøpsknappen uteble i testingen
        // før innsending, fantes det ingenting å lete i. Feilen kan være helt
        // ufarlig (gammelt skall uten plugin), men den kan også være hele
        // grunnen til at ingen kan kjøpe. Nå vet vi forskjellen.
        Sentry.captureException(error, { tags: { område: 'iap', grunn: 'oppsett-kastet' } });
      } finally {
        // Uansett utfall er forsøket over. Først nå har siden lov til å si noe
        // om at kjøp ikke er tilgjengelig.
        if (!unmountedRef.current) setIapChecked(true);
      }
    })();
  }, [native, iapAttempt]);

  // The webhook needs a few seconds to land after Apple confirms the purchase;
  // poll billing status so the page flips to "aktiv plan" without a manual
  // reload. If it never flips (slow webhook), leave an honest "aktiveres
  // snart" message instead of an eternal "aktiverer …".
  const refreshStatusUntilPaid = async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2000 : 5000));
      if (unmountedRef.current) return;
      const data = await loadStatus();
      if (data?.capabilities.paid) {
        // Abonnementet er aktivt. To ting MÅ skje her, og ingen av dem gjorde det:
        //
        // 1. «Takk for kjøpet! Aktiverer abonnementet ditt …» må bort. Løkka
        //    returnerte bare, så meldingen ble stående for alltid — kunden så
        //    «aktiverer» over et kort som allerede sa «Sesongpass · Aktiv».
        // 2. Den DELTE betalingsstatusen må friskes opp. Headerens plan-merke
        //    leser den via TanStack Query med fem minutters levetid, mens
        //    loadStatus() bare oppdaterer denne sidens egen tilstand. Uten
        //    dette sto det «Gratis» øverst på hvert skjermbilde i appen i opptil
        //    fem minutter etter at kunden hadde betalt.
        //
        // Begge deler er verst nettopp her: i sekundene etter at noen har gitt
        // deg penger.
        setIapNotice(null);
        void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_KEY });
        return;
      }
    }
    if (!unmountedRef.current) setIapNotice(t('iapActivationDelayed'));
  };

  const startIapPurchase = async (offer: IapOffer) => {
    try {
      setIapBusy('purchase');
      setIapNotice(null);
      // Vakten må lese en abonnementsstatus vi FAKTISK har fått svar på. Har
      // ikke siden det ennå, hentes den her — et kjøp som starter på
      // antakelsen «gratisbruker» er nettopp det som koster kunden dobbelt.
      const current = status ?? (await loadStatus());
      if (!current) {
        setStatusError(t('errorLoadStatus'));
        return;
      }
      // Samme fasit som 409-en i /api/billing/checkout: har kunden allerede
      // en betalt plan, stoppes kjøpet før Apple-arket rekker å åpne seg.
      const view = getPlanViewState(current.capabilities);
      const outcome = await purchaseIapOffer(offer, view);
      if (outcome === 'blocked-active-plan') {
        // Navnet på planen som sperrer, fra samme visningstilstand vakten leste.
        const blocking = getBlockingPaidPlan(view) ?? view.activeTier;
        setStatusError(t('iapPlanChangeBlocked', { plan: TIER_LABELS[blocking] }));
        return;
      }
      if (outcome === 'success') {
        setIapNotice(t('iapPurchaseSuccess'));
        void refreshStatusUntilPaid();
      }
    } catch {
      // Raw plugin error messages are untranslated/technical — show ours.
      setStatusError(t('iapPurchaseError'));
    } finally {
      setIapBusy(null);
    }
  };

  const startIapRestore = async () => {
    try {
      setIapBusy('restore');
      setIapNotice(null);
      const restored = await restoreIapPurchases();
      if (restored) {
        setIapNotice(t('iapRestoreSuccess'));
        void refreshStatusUntilPaid();
      } else {
        setIapNotice(t('iapRestoreNone'));
      }
    } catch {
      setStatusError(t('iapPurchaseError'));
    } finally {
      setIapBusy(null);
    }
  };

  const checkoutState = searchParams.get('checkout');
  const infoMessage = useMemo(() => {
    if (checkoutState === 'success') return t('checkoutSuccess');
    if (checkoutState === 'cancel') return t('checkoutCancel');
    return null;
  }, [checkoutState, t]);

  const loadStatus = async (): Promise<BillingStatusResponse | null> => {
    try {
      setStatusError(null);
      const response = await fetch('/api/billing/status', { cache: 'no-store' });
      const data = await response.json();

      if (response.status === 401) {
        const anonymous: BillingStatusResponse = {
          subscription: null,
          capabilities: {
            tier: 'free',
            status: 'inactive',
            paid: false,
            aiDailyLimit: 5
          }
        };
        setStatus(anonymous);
        return anonymous;
      }

      if (!response.ok) {
        setStatusError(data?.error ?? t('errorLoadStatus'));
        return null;
      }

      const parsed = data as BillingStatusResponse;
      setStatus(parsed);
      return parsed;
    } catch {
      // Transient network error (e.g. mid-poll on mobile) — leave state as-is.
      return null;
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const startCheckout = async (plan: 'premium' | 'season_pass') => {
    try {
      setLoadingPlan(plan);
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The consent is sent and recorded server-side; without it the route
        // refuses the purchase (angrerettloven — see /kjopsvilkar punkt 4).
        body: JSON.stringify({ plan, immediateDeliveryConsent: true, consentVersion: PURCHASE_CONSENT_VERSION })
      });
      const data = await response.json();
      // Ta med `details` når den finnes. Ruta legger forklaringen der — for
      // eksempel hvorfor et planbytte er sperret og hva brukeren skal gjøre —
      // og uten dette så brukeren bare overskriften.
      if (!response.ok) {
        throw new Error([data?.error, data?.details].filter(Boolean).join(' ') || t('errorCheckout'));
      }
      if (data?.url) {
        const value = plan === 'premium' ? PREMIUM_MONTHLY : SEASON_YEARLY;
        trackEvent('begin_checkout', {
          currency: 'NOK',
          value,
          items: [
            {
              item_id: plan,
              item_name: plan,
              price: value,
              quantity: 1
            }
          ]
        });
        window.location.href = data.url;
      }
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : t('errorCheckout'));
    } finally {
      setLoadingPlan(null);
    }
  };

  const openPortal = async () => {
    try {
      setOpeningPortal(true);
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? t('errorOpenPortal'));
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : t('errorOpenPortal'));
    } finally {
      setOpeningPortal(false);
    }
  };

  // Hva kunden FAKTISK har tilgang til nå — ikke bare hvilken rad som finnes.
  // En 'canceled'/'past_due'/'unpaid'-rad har fortsatt tier 'premium', og ble
  // tidligere vist som «Aktiv plan» samtidig som kjøpsknappen forsvant.
  const planView = getPlanViewState(status?.capabilities);
  const currentTier = planView.activeTier;
  // Ved betalingsproblem er «oppdater kortet» den korteste veien tilbake; da
  // finnes det allerede en Stripe-kunde å sende dem til.
  const canOpenPortal =
    !native && (status?.capabilities.paid || (planView.lapsed && Boolean(status?.subscription?.stripe_customer_id)));

  return (
    <PageWrapper>
      <section className="space-y-5">
        <header className="pt-2 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">
            {t('heading')}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-700">
            {t('subheading')}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
            {/* "Sikker betaling med Stripe" må ikke vises i den native appen —
                der går kjøp via Apple (3.1.1), og Stripe-omtale kan flagges i review. */}
            {!native ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-forest-700" /> {t('securePayment')}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Undo2 className="h-3.5 w-3.5 text-forest-700" /> {t('cancelAnytimeBadge')}
            </span>
          </div>
        </header>

        {infoMessage ? <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">{infoMessage}</p> : null}
        {statusError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{statusError}</p> : null}
        {native && iapNeedsLogin ? (
          <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">
            <Link href="/auth/login?redirect=/pricing" className="font-semibold underline">
              {t('iapLoginToBuy')}
            </Link>
          </p>
        ) : null}
        {/* Bare når forsøket faktisk er ferdig (iapChecked) — ellers meldte
            siden «ikke tilgjengelig» mens den fortsatt hentet tilbudet. */}
        {native && iapChecked && !iapReady && !iapNeedsLogin ? (
          <div className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">
            <p>{t('nativePurchaseUnavailable')}</p>
            <button
              type="button"
              onClick={() => setIapAttempt((n) => n + 1)}
              className="mt-1 font-semibold underline"
            >
              {t('iapRetry')}
            </button>
          </div>
        ) : null}
        {iapNotice ? <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">{iapNotice}</p> : null}

        {status ? (
          <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">{t('yourPlan')}</p>
            <p className="mt-1 text-lg font-semibold text-forest-900">{TIER_LABELS[planView.activeTier]}</p>
            <p className="text-sm text-gray-700">
              {statusLabel(status.capabilities.status, t)}
              {status.subscription?.current_period_end
                ? ` • ${t('renewsEnds', { date: new Date(status.subscription.current_period_end).toLocaleDateString(intlLocale(locale)) })}`
                : ''}
            </p>
            {/* Abonnementet finnes, men gir ikke tilgang. Si det rett ut og pek
                på veien tilbake — ellers leser kunden «Premium» som at alt er i
                orden helt til en betalt funksjon nekter dem adgang. */}
            {planView.lapsed && planView.lapsedTier ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {/* «Oppdater kortet» nevnes bare når knappen faktisk står der —
                    ellers peker teksten på noe kunden ikke finner. */}
                {planView.needsPayment && canOpenPortal
                  ? t('planNeedsPayment', { plan: TIER_LABELS[planView.lapsedTier] })
                  : t('planLapsed', { plan: TIER_LABELS[planView.lapsedTier] })}
              </p>
            ) : null}
            {!status.capabilities.paid ? (
              <p className="mt-1 text-sm text-gray-700">{t('aiQuota', { limit: status.capabilities.aiDailyLimit ?? 0 })}</p>
            ) : null}
            {canOpenPortal ? (
              <button
                type="button"
                onClick={openPortal}
                disabled={openingPortal}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-forest-800 px-3 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50 disabled:opacity-60"
              >
                {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                {t('manageSubscription')}
              </button>
            ) : null}
          </article>
        ) : (
          <p className="text-sm text-gray-600">{t('loadingStatus')}</p>
        )}

        {!native ? (
          <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={agreedToPurchaseTerms}
              onChange={(e) => setAgreedToPurchaseTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              {t('purchaseConsentPrefix')}{' '}
              <Link href="/kjopsvilkar" className="font-medium text-forest-800 underline">{t('purchaseTermsLink')}</Link>.
            </span>
          </label>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          {planCards.map((plan) => {
            const isCurrent = currentTier === plan.id;
            // Planen kunden hadde, men som ikke lenger gjelder. Får «Ikke aktiv
            // lenger» i stedet for «Aktiv plan» — og beholder kjøpsknappen.
            const isLapsed = planView.lapsedTier === plan.id;
            const checkoutPlan = plan.id === 'premium' || plan.id === 'season_pass' ? plan.id : null;
            const isLoading = loadingPlan === plan.id;
            // Per-plan IAP offer: the buy button renders ONLY when this plan's
            // package actually exists in the RevenueCat offering (a global
            // "some offer exists" check would give the other card a dead button).
            const planOffer = native ? iapOffers?.find((offer) => offer.plan === plan.id) ?? null : null;
            // In the native shell the App Store price is what Apple charges —
            // show it instead of the Stripe NOK constant when they differ.
            const displayPrice = planOffer ? planOffer.priceString : plan.price;
            const displayPeriod = planOffer ? (plan.id === 'premium' ? t('perMonth') : t('perYear')) : plan.period;

            return (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-4 ${
                  plan.highlight
                    ? 'border-forest-700 bg-white shadow-card ring-2 ring-forest-700'
                    : isCurrent
                      ? 'border-forest-700 bg-forest-50'
                      : 'border-gray-200 bg-white'
                }`}
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-forest-900 shadow-sm">
                    {t('bestValue')}
                  </span>
                ) : null}
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-xl font-semibold text-forest-900">{plan.title}</h2>
                  {plan.id === 'premium' ? <Crown className="h-4 w-4 text-forest-800" /> : null}
                  {plan.id === 'season_pass' ? <Leaf className="h-4 w-4 text-forest-800" /> : null}
                </div>
                <p className="text-xs text-gray-600">{plan.tagline}</p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-forest-900">
                  {displayPrice}
                  <span className="text-sm font-medium text-gray-600">{displayPeriod}</span>
                </p>
                {plan.lead ? <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{plan.lead}</p> : null}
                <ul className={`${plan.lead ? 'mt-1.5' : 'mt-3'} flex-1 space-y-1.5 text-sm text-gray-700`}>
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="mt-4 rounded-lg bg-forest-100 px-3 py-2 text-center text-sm font-medium text-forest-900">{t('activePlan')}</p>
                ) : null}
                {isLapsed ? (
                  <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-900">{t('lapsedPlan')}</p>
                ) : null}

                {/* One shared CTA: web → Stripe checkout (consent-gated),
                    native → Apple IAP for THIS plan's package (if offered).
                    canPurchasePlan er fasiten: en plan uten faktisk tilgang kan
                    alltid kjøpes på nytt, også den kunden nettopp mistet. */}
                {canPurchasePlan(planView, plan.id) && (!native ? true : planOffer !== null) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (native && planOffer) void startIapPurchase(planOffer);
                      else if (!native && checkoutPlan) void startCheckout(checkoutPlan);
                    }}
                    disabled={native ? iapBusy !== null : isLoading || !agreedToPurchaseTerms}
                    className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      plan.highlight
                        ? 'bg-forest-800 text-white shadow-sm hover:bg-forest-700'
                        : 'border border-forest-800 text-forest-800 hover:bg-forest-50'
                    } disabled:opacity-60`}
                  >
                    {(native ? iapBusy === 'purchase' : isLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t('choosePlan', { plan: plan.title })}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        {/* Apple-krav (3.1.2): «Gjenopprett kjøp» skal være tilgjengelig i
            appen. Sto tidligere bak `iapReady` — altså bak at TILBUDENE var
            hentet. En kunde som allerede har betalt trenger ikke noe tilbud;
            hen trenger restore, og trenger den nettopp når noe har gått galt.
            Nå henger den bare på at RevenueCat er satt opp for brukeren. */}
        {native && iapConfigured ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => void startIapRestore()}
              disabled={iapBusy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {iapBusy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              {t('iapRestore')}
            </button>
            <a
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-forest-800 underline"
            >
              {t('iapManageOnApple')}
            </a>
          </div>
        ) : null}

        <p className="text-center text-xs text-gray-500">
          {storePrices ? t('priceNoteNative') : t('priceNote')}
        </p>

        {/*
          Apple-krav 3.1.2: der et abonnement selges, må BÅDE bruksvilkår (EULA)
          og personvernerklæring være lenket i selve appen. Bare kjøpsvilkårene
          sto her, og manglende personvernlenke er en av de vanligste
          avvisningsgrunnene for abonnementsapper.

          Lenkene står UTENFOR `native && iapReady`-blokken med vilje. Feiler
          RevenueCat-initieringen — f.eks. hvis SDK-nøkkelen mangler — forsvinner
          hele den blokken, og da ville en reviewer sett en prisside uten
          juridiske lenker i det hele tatt. Her koster de ingenting og står alltid.
        */}
        <nav aria-label={t('legalLinksLabel')} className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/kjopsvilkar" className="text-xs text-gray-600 underline">
            {t('purchaseTermsLink')}
          </Link>
          <Link href="/vilkar" className="text-xs text-gray-600 underline">
            {t('termsLink')}
          </Link>
          <Link href="/personvern" className="text-xs text-gray-600 underline">
            {t('privacyLink')}
          </Link>
        </nav>

        <article className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="font-serif text-xl font-semibold text-forest-900">{t('faqHeading')}</h2>
          <div className="mt-2 divide-y divide-gray-100">
            {faqItems.map((item) => (
              <details key={item.q} className="group py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-gray-900">
                  {item.q}
                  <span aria-hidden="true" className="text-gray-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-700">{item.a}</p>
              </details>
            ))}
          </div>
        </article>

        <p className="text-center text-sm">
          <Link href="/profile" className="font-medium text-forest-800 hover:underline">
            {t('goToProfile')}
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}

function PricingFallback() {
  const t = useTranslations('Pricing');
  return (
    <PageWrapper>
      <p className="text-sm text-gray-700">{t('loading')}</p>
    </PageWrapper>
  );
}


export default function PricingPage() {
  return (
    <Suspense fallback={<PricingFallback />}>
      <PricingInner />
    </Suspense>
  );
}
