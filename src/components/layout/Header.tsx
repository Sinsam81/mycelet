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

export function Header() {
  const { user, loading } = useAuth();
  const billingQuery = useBillingStatus(Boolean(user));
  const tier = billingQuery.data?.capabilities.tier ?? 'free';

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-forest-900 text-white">
      <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          SoppJakt
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
