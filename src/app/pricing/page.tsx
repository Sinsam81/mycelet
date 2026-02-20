'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, Crown, Leaf, Loader2 } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

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

const planCards = [
  {
    id: 'free',
    title: 'Gratis',
    price: '0 kr',
    period: '',
    features: ['5 AI-identifikasjoner per døgn', 'Kart + kalender + forum', 'Forenklet vegetasjons-heatmap']
  },
  {
    id: 'premium',
    title: 'Premium',
    price: '79 kr',
    period: '/mnd',
    features: [
      'Ubegrenset AI-identifikasjon',
      'Full vegetasjonsanalyse (heatmap-detalj)',
      'Offline-kart (lagre områder lokalt)',
      'Eksperthjelp i prioritert kø (kommer)'
    ]
  },
  {
    id: 'season_pass',
    title: 'Sesongpass',
    price: '199 kr',
    period: '/sesong',
    features: ['Premium-funksjoner i sesong', 'Offline-kart (lagre områder lokalt)', 'Én betaling', 'Perfekt for august-november']
  }
] as const;

export default function PricingPage() {
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<'premium' | 'season_pass' | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

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
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Priser og abonnement</h1>
            <p className="text-sm text-gray-700">Velg planen som passer soppsesongen din.</p>
          </div>
          <Link href="/profile" className="text-sm font-medium text-forest-800 hover:underline">
            Profil
          </Link>
        </div>

        {infoMessage ? <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-900">{infoMessage}</p> : null}
        {statusError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{statusError}</p> : null}

        {status ? (
          <article className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Din plan</p>
            <p className="mt-1 text-lg font-semibold capitalize">{status.capabilities.tier.replace('_', ' ')}</p>
            <p className="text-sm text-gray-700">
              Status: {status.capabilities.status}
              {status.subscription?.current_period_end ? ` • Fornyes/slutter: ${new Date(status.subscription.current_period_end).toLocaleDateString('nb-NO')}` : ''}
            </p>
            {!status.capabilities.paid ? (
              <p className="mt-1 text-sm text-gray-700">AI-kvote: {status.capabilities.aiDailyLimit} per døgn</p>
            ) : null}
            {status.capabilities.paid ? (
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
              <article key={plan.id} className={`rounded-xl border p-4 ${isCurrent ? 'border-forest-700 bg-forest-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{plan.title}</h2>
                  {plan.id === 'premium' ? <Crown className="h-4 w-4 text-forest-800" /> : null}
                  {plan.id === 'season_pass' ? <Leaf className="h-4 w-4 text-forest-800" /> : null}
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {plan.price}
                  <span className="text-sm font-medium text-gray-600">{plan.period}</span>
                </p>
                <ul className="mt-3 space-y-1 text-sm text-gray-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-forest-700" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="mt-4 rounded-lg bg-forest-100 px-3 py-2 text-center text-sm font-medium text-forest-900">Aktiv plan</p>
                ) : null}

                {!isCurrent && isPaidOption ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutPlan) void startCheckout(checkoutPlan);
                    }}
                    disabled={isLoading}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-forest-800 px-3 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Velg {plan.title}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </PageWrapper>
  );
}
