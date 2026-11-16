'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { kanFaaProveperiode } from '@/lib/billing/provetilbud';
import { getPlanViewState } from '@/lib/billing/plan-state';
import { useAuth } from '@/lib/hooks/useAuth';
import { useBillingStatus } from '@/lib/hooks/useBilling';
import { useIsNative } from '@/lib/hooks/useIsNative';
import { HJEM, hjemHref, innloggingHref } from '@/lib/nav/hjem';

function getTierLabel(
  tier: 'free' | 'premium' | 'season_pass',
  t: ReturnType<typeof useTranslations>,
) {
  if (tier === 'premium') return t('tierPremium');
  if (tier === 'season_pass') return t('tierSeasonPass');
  return t('tierFree');
}

function MushroomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3a9 8 0 0 0-9 8h18a9 8 0 0 0-9-8z" />
      <path d="M9 11v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-8z" />
    </svg>
  );
}

export function Header() {
  const t = useTranslations('Header');
  const { user, loading } = useAuth();
  const billingQuery = useBillingStatus(Boolean(user));
  // Gullmerket skal si hva kunden faktisk har tilgang til nå. Leste vi `tier`
  // rett fra raden, fikk et avsluttet eller ubetalt abonnement fortsatt
  // «Premium» i gull — merket ville da vært en tilgangserklæring appen ikke
  // holder.
  const tier = getPlanViewState(billingQuery.data?.capabilities).activeTier;
  const native = useIsNative();
  const pathname = usePathname();
  // Samme regel som Hjem-fanen (src/lib/nav/hjem.ts): i appen er /soppforhold
  // hjem for en som ikke er logget inn. Logoen pekte på «/» og hadde samme
  // løkke som fanen — full sidelasting, og tilbake dit brukeren sto.
  const hjem = loading ? HJEM : hjemHref({ native, innlogget: Boolean(user) });

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-b from-forest-900 to-forest-800 pt-[env(safe-area-inset-top)] text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4">
        <Link href={hjem} className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
          <MushroomMark className="h-5 w-5 text-amber-400" />
          Mycelet
        </Link>
        <div className="flex items-center gap-1">
          {/* The badge links to /pricing on BOTH web and native. It used to be
              a dead span in the shell (App Store 3.1.1-era gating, when pricing
              only offered Stripe) — with IAP live, natives need the path too. */}
          {/* Merket venter til betalingsstatusen er kjent: før svaret er tier «free»,
              og et «Prøv gratis» som blinker for en betalende kunde er feil løfte. */}
          {!loading && user && !billingQuery.isLoading ? (
            // Lenken er 44 px høy (treffflaten); selve merket er den indre
            // spennen og ser ut som før. Merket alene var ~24 px høyt, rett
            // ved siden av profilknappen.
            <Link href="/pricing" className="inline-flex min-h-[44px] items-center transition-opacity hover:opacity-90">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  tier === 'free' ? 'bg-white/15 text-white' : 'bg-amber-400 text-forest-900'
                }`}
              >
                {tier === 'free' && kanFaaProveperiode(billingQuery.data) ? t('tryFree') : getTierLabel(tier, t)}
              </span>
            </Link>
          ) : null}

          {/* Utlogget var personikonet under eneste vei til innlogging — umerket,
              og via /profile som bare sender deg videre. På /soppforhold, appens
              første skjerm, sto det «Prøv gratis» og ingenting om å logge inn:
              den som hadde konto fra før (ny telefon, utløpt økt) fant ikke
              døra. Samme plass og form som plan-merket, som aldri vises
              samtidig. Veien tilbake hit følger med (innloggingHref). */}
          {!loading && !user ? (
            <Link
              href={innloggingHref({ pathname, native })}
              className="inline-flex min-h-[44px] items-center transition-opacity hover:opacity-90"
            >
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
                {t('login')}
              </span>
            </Link>
          ) : null}

          {/* 44 × 44 px treffflate (var 36). -mr-1 og gap-1 holder ikonet der det sto. */}
          <Link
            href="/profile"
            aria-label={t('profileAriaLabel')}
            className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <User className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
