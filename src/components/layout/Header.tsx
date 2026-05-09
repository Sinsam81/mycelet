'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useBillingStatus } from '@/lib/hooks/useBilling';

function getTierLabel(tier: 'free' | 'premium' | 'season_pass') {
  if (tier === 'premium') return 'Premium';
  if (tier === 'season_pass') return 'Sesongpass';
  return 'Gratis';
}

function MushroomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3C7.03 3 3 6.58 3 11c0 .55.45 1 1 1h16c.55 0 1-.45 1-1 0-4.42-4.03-8-9-8z" />
      <path d="M9.5 13v6a2 2 0 002 2h1a2 2 0 002-2v-6h-5z" />
    </svg>
  );
}

export function Header() {
  const { user, loading } = useAuth();
  const billingQuery = useBillingStatus(Boolean(user));
  const tier = billingQuery.data?.capabilities.tier ?? 'free';

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-forest-900 text-white">
      <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MushroomMark className="h-5 w-5 text-forest-100" />
          Mycelet
        </Link>
        <div className="flex items-center gap-2">
          {!loading && user ? (
            <Link
              href="/pricing"
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-90 ${
                tier === 'free' ? 'bg-white/15 text-white' : 'bg-forest-100 text-forest-900'
              }`}
            >
              {getTierLabel(tier)}
            </Link>
          ) : null}

          <Link href="/profile" aria-label="Profil" className="rounded-full p-2 hover:bg-white/10">
            <User className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
