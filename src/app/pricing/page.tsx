'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Crown, Leaf, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { useIsNative } from '@/lib/hooks/useIsNative';

type BillingStatusResponse = {
  subscription: {
    tier: 'free' | 'premium' | 'season_pass';
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
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
const SEASON_PER_MONTH = Math.round(SEASON_YEARLY / 12);

// Next 15+ requires useSearchParams() inside a Suspense boundary; default
// export at the bottom wraps PricingInner.
function PricingInner() {
  const t = useTranslations('Pricing');
  const searchParams = useSearchParams();

  const TIER_LABELS: Record<'free' | 'premium' | 'season_pass', string> = {
    free: t('tierFree'),
    premium: t('tierPremium'),
    season_pass: t('tierSeasonPass')
  };

  const STATUS_LABELS: Record<string, string> = {
    active: t('statusActive'),
    trialing: t('statusTrialing'),
    past_due: t('statusPastDue'),
    canceled: t('statusCanceled'),
    unpaid: t('statusUnpaid'),
    incomplete: t('statusIncomplete'),
    incomplete_expired: t('statusIncompleteExpired'),
    inactive: t('statusInactive')
  };

  const planCards = [
    {
      id: 'free',
      title: t('tierFree'),
      tagline: t('freeTagline'),
      price: '0 kr',
      period: '',
      lead: null,
      features: [
        t('freeFeature1'),
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
      features: [
        t('premiumFeature1'),
        t('premiumFeature2'),
        t('premiumFeature3'),
        t('premiumFeature4')
      ],
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
        t('seasonFeature1', { perMonth: SEASON_PER_MONTH }),
        t('seasonFeature2'),
        t('seasonFeature3')
      ],
      highlight: true
    }
  ] as const;

  const faqItems = [
    {
      q: t('faq1Q'),
      a: t('faq1A', { yearly: SEASON_YEARLY })
    },
    {
      q: t('faq2Q'),
      a: t('faq2A')
    },
    {
      q: t('faq3Q'),
      a: t('faq3A')
    },
    {
      q: t('faq4Q'),
      a: t('faq4A')
    }
  ];

  const [loadingPlan, setLoadingPlan] = useState<'premium' | 'season_pass' | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Distance-selling consent: the customer must accept immediate delivery + that
  // the 14-day withdrawal right then lapses, before checkout (angrerettloven /
  // distansavtalslagen digital-content exception). Without it, the right extends.
  const [agreedToPurchaseTerms, setAgreedToPurchaseTerms] = useState(false);
  // On iOS, digital subscriptions must go through Apple IAP, not Stripe (App
  // Store rule 3.1.1). Until IAP is wired, hide all purchase/manage actions in
  // the native shell. The web keeps the full Stripe flow.
  const native = useIsNative();

  const checkoutState = searchParams.get('checkout');
  const infoMessage = useMemo(() => {
    if (checkoutState === 'success') return t('checkoutSuccess');
    if (checkoutState === 'cancel') return t('checkoutCancel');
    return null;
  }, [checkoutState, t]);

  const loadStatus = async () => {
    setStatusError(null);
    const response = await fetch('/api/billing/status', { cache: 'no-store' });
    const data = await response.json();

    if (response.status === 401) {
      setStatus({
        subscription: null,
        capabilities: {
          tier: 'free',
          status: 'inactive',
          paid: false,
          aiDailyLimit: 5
        }
      });
      return;
    }

    if (!response.ok) {
      setStatusError(data?.error ?? t('errorLoadStatus'));
      return;
    }

    setStatus(data as BillingStatusResponse);
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
        body: JSON.stringify({ plan })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? t('errorCheckout'));
      if (data?.url) window.location.href = data.url;
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

  const currentTier = status?.capabilities.tier ?? 'free';

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
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-forest-700" /> {t('securePayment')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Undo2 className="h-3.5 w-3.5 text-forest-700" /> {t('cancelAnytimeBadge')}
            </span>
          </div>
        </header>

        {infoMessage ? <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">{infoMessage}</p> : null}
        {statusError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{statusError}</p> : null}
        {native ? (
          <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">
            {t('nativePurchaseUnavailable')}
          </p>
        ) : null}

        {status ? (
          <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">{t('yourPlan')}</p>
            <p className="mt-1 text-lg font-semibold text-forest-900">{TIER_LABELS[status.capabilities.tier]}</p>
            <p className="text-sm text-gray-700">
              {STATUS_LABELS[status.capabilities.status] ?? status.capabilities.status}
              {status.subscription?.current_period_end
                ? ` • ${t('renewsEnds', { date: new Date(status.subscription.current_period_end).toLocaleDateString('nb-NO') })}`
                : ''}
            </p>
            {!status.capabilities.paid ? (
              <p className="mt-1 text-sm text-gray-700">{t('aiQuota', { limit: status.capabilities.aiDailyLimit ?? 0 })}</p>
            ) : null}
            {status.capabilities.paid && !native ? (
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
            const checkoutPlan = plan.id === 'premium' || plan.id === 'season_pass' ? plan.id : null;
            const isPaidOption = checkoutPlan !== null;
            const isLoading = loadingPlan === plan.id;

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
                  {plan.price}
                  <span className="text-sm font-medium text-gray-600">{plan.period}</span>
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

                {!isCurrent && isPaidOption && !native ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutPlan) void startCheckout(checkoutPlan);
                    }}
                    disabled={isLoading || !agreedToPurchaseTerms}
                    className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      plan.highlight
                        ? 'bg-forest-800 text-white shadow-sm hover:bg-forest-700'
                        : 'border border-forest-800 text-forest-800 hover:bg-forest-50'
                    } disabled:opacity-60`}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t('choosePlan', { plan: plan.title })}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-500">
          {t('priceNote')}
        </p>

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
