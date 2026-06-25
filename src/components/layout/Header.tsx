'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/hooks/useAuth';
import { useBillingStatus } from '@/lib/hooks/useBilling';
import { useIsNative } from '@/lib/hooks/useIsNative';

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
  const tier = billingQuery.data?.capabilities.tier ?? 'free';
  const native = useIsNative();

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-b from-forest-900 to-forest-800 pt-[env(safe-area-inset-top)] text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
          <MushroomMark className="h-5 w-5 text-amber-400" />
          Mycelet
        </Link>
        <div className="flex items-center gap-2">
          {!loading && user ? (
            native ? (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  tier === 'free' ? 'bg-white/15 text-white' : 'bg-amber-400 text-forest-900'
                }`}
              >
                {getTierLabel(tier, t)}
              </span>
            ) : (
              <Link
                href="/pricing"
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90 ${
                  tier === 'free' ? 'bg-white/15 text-white' : 'bg-amber-400 text-forest-900'
                }`}
              >
                {getTierLabel(tier, t)}
              </Link>
            )
          ) : null}

          <Link href="/profile" aria-label={t('profileAriaLabel')} className="rounded-full p-2 hover:bg-white/10">
            <User className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
