'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
const SEASON_YEARLY = BILLING_PLANS.season_pass.yearlyNok ?? 199;
const SEASON_PER_MONTH = Math.round(SEASON_YEARLY / 12);

const TIER_LABELS: Record<'free' | 'premium' | 'season_pass', string> = {
  free: 'Gratis',
  premium: 'Premium',
  season_pass: 'Sesongpass'
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  trialing: 'Prøveperiode',
  past_due: 'Forfalt betaling',
  canceled: 'Avsluttet',
  unpaid: 'Ubetalt',
  incomplete: 'Venter på betaling',
  incomplete_expired: 'Utløpt',
  inactive: 'Inaktiv'
};

const planCards = [
  {
    id: 'free',
    title: 'Gratis',
    tagline: 'Kom trygt i gang',
    price: '0 kr',
    period: '',
    lead: null,
    features: [
      '5 AI-identifikasjoner per døgn',
      'Artsbibliotek med forvekslingsadvarsler',
      'Soppkart, soppvarsel, kalender og forum'
    ],
    highlight: false
  },
  {
    id: 'premium',
    title: 'Premium',
    tagline: 'Fleksibelt måned for måned',
    price: `${PREMIUM_MONTHLY} kr`,
    period: '/mnd',
    lead: 'Alt i Gratis, pluss:',
    features: [
      'Ubegrenset AI-identifikasjon',
      'Full prediksjon — de beste stedene nær deg',
      'Offline-kart (lagre områder lokalt)',
      'Prioritert eksperthjelp (kommer)'
    ],
    highlight: false
  },
  {
    id: 'season_pass',
    title: 'Sesongpass',
    tagline: 'Alt i Premium — hele året',
    price: `${SEASON_YEARLY} kr`,
    period: '/år',
    lead: 'Alt i Premium, pluss:',
    features: [
      `Tilsvarer ${SEASON_PER_MONTH} kr/mnd`,
      'Billigere enn én soppsesong med Premium',
      'Fornyes årlig — avslutt når som helst'
    ],
    highlight: true
  }
] as const;

const faqItems = [
  {
    q: 'Hva er forskjellen på Premium og Sesongpass?',
    a: `Funksjonene er de samme. Premium betales månedlig og kan stoppes etter en måned. Sesongpass er ett beløp i året (${SEASON_YEARLY} kr) — billigere enn å betale Premium gjennom hele soppsesongen, og du slipper å tenke på det resten av året.`
  },
  {
    q: 'Kan jeg avslutte når som helst?',
    a: 'Ja. Du administrerer abonnementet selv fra denne siden («Administrer abonnement»). Tilgangen varer ut perioden du allerede har betalt for, og du belastes ikke videre.'
  },
  {
    q: 'Hva får jeg gratis?',
    a: 'Kjernen i Mycelet er gratis: artsbiblioteket med forvekslingsadvarsler, soppkartet, soppvarselet, kalenderen, forumet — og 5 AI-identifikasjoner per døgn.'
  },
  {
    q: 'Fungerer Mycelet i Sverige?',
    a: 'Ja. Kart, værdata, funn og prediksjon dekker både Norge og Sverige.'
  }
];

// Next 15+ requires useSearchParams() inside a Suspense boundary; default
// export at the bottom wraps PricingInner.
function PricingInner() {
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<'premium' | 'season_pass' | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // On iOS, digital subscriptions must go through Apple IAP, not Stripe (App
  // Store rule 3.1.1). Until IAP is wired, hide all purchase/manage actions in
  // the native shell. The web keeps the full Stripe flow.
  const native = useIsNative();

  const checkoutState = searchParams.get('checkout');
  const infoMessage = useMemo(() => {
    if (checkoutState === 'success') return 'Betaling fullført. Oppdaterer abonnement...';
    if (checkoutState === 'cancel') return 'Betalingen ble avbrutt.';
    return null;
  }, [checkoutState]);

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
      setStatusError(data?.error ?? 'Kunne ikke hente abonnementsstatus');
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
      if (!response.ok) throw new Error(data?.error ?? 'Checkout feilet');
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Checkout feilet');
    } finally {
      setLoadingPlan(null);
    }
  };

  const openPortal = async () => {
    try {
      setOpeningPortal(true);
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Kunne ikke åpne kundeside');
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Kunne ikke åpne kundeside');
    } finally {
      setOpeningPortal(false);
    }
  };

  const currentTier = status?.capabilities.tier ?? 'free';

  return (
    <PageWrapper>
      <section className="space-y-5">
        <header className="pt-2 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">Priser</p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-forest-900">
            Få mer ut av soppsesongen
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-700">
            Ubegrenset AI-identifikasjon, full prediksjon og offline-kart — for mindre enn én kurv kantareller.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-forest-700" /> Sikker betaling med Stripe
            </span>
            <span className="inline-flex items-center gap-1">
              <Undo2 className="h-3.5 w-3.5 text-forest-700" /> Avslutt når som helst — ingen binding
            </span>
          </div>
        </header>

        {infoMessage ? <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">{infoMessage}</p> : null}
        {statusError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{statusError}</p> : null}
        {native ? (
          <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">
            Kjøp i appen er ikke tilgjengelig ennå — abonnement kommer snart.
          </p>
        ) : null}

        {status ? (
          <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">Din plan</p>
            <p className="mt-1 text-lg font-semibold text-forest-900">{TIER_LABELS[status.capabilities.tier]}</p>
            <p className="text-sm text-gray-700">
              {STATUS_LABELS[status.capabilities.status] ?? status.capabilities.status}
              {status.subscription?.current_period_end
                ? ` • Fornyes/slutter: ${new Date(status.subscription.current_period_end).toLocaleDateString('nb-NO')}`
                : ''}
            </p>
            {!status.capabilities.paid ? (
              <p className="mt-1 text-sm text-gray-700">AI-kvote: {status.capabilities.aiDailyLimit} per døgn</p>
            ) : null}
            {status.capabilities.paid && !native ? (
              <button
                type="button"
                onClick={openPortal}
                disabled={openingPortal}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-forest-800 px-3 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50 disabled:opacity-60"
              >
                {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                Administrer abonnement
              </button>
            ) : null}
          </article>
        ) : (
          <p className="text-sm text-gray-600">Laster abonnementsstatus...</p>
        )}

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
                    Best verdi
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
                  <p className="mt-4 rounded-lg bg-forest-100 px-3 py-2 text-center text-sm font-medium text-forest-900">Aktiv plan</p>
                ) : null}

                {!isCurrent && isPaidOption && !native ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutPlan) void startCheckout(checkoutPlan);
                    }}
                    disabled={isLoading}
                    className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      plan.highlight
                        ? 'bg-forest-800 text-white shadow-sm hover:bg-forest-700'
                        : 'border border-forest-800 text-forest-800 hover:bg-forest-50'
                    } disabled:opacity-60`}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Velg {plan.title}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-500">
          Prisene er i norske kroner og inkluderer mva. Du kan bytte eller avslutte når som helst.
        </p>

        <article className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="font-serif text-xl font-semibold text-forest-900">Vanlige spørsmål</h2>
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
            Gå til profilen din →
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PageWrapper><p className="text-sm text-gray-700">Laster...</p></PageWrapper>}>
      <PricingInner />
    </Suspense>
  );
}
