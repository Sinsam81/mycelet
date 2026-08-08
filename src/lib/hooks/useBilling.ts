'use client';

import { useQuery } from '@tanstack/react-query';

export interface BillingStatusResult {
  capabilities: {
    tier: 'free' | 'premium' | 'season_pass';
    status: string;
    paid: boolean;
    aiDailyLimit: number | null;
  };
}

/**
 * Nøkkelen til den DELTE betalingsstatusen.
 *
 * Eksportert med vilje: den leses av headerens plan-merke og må kunne
 * ugyldiggjøres av /pricing etter et kjøp. Da nøkkelen sto som en løs streng
 * her og prissiden hentet sin egen status ved siden av, kunne headeren si
 * «Gratis» i opptil fem minutter etter at kunden hadde betalt.
 */
export const BILLING_STATUS_KEY = ['billing-status'] as const;

export function useBillingStatus(enabled: boolean) {
  return useQuery<BillingStatusResult | null>({
    queryKey: BILLING_STATUS_KEY,
    enabled,
    queryFn: async () => {
      const response = await fetch('/api/billing/status', { cache: 'no-store' });
      if (response.status === 401) return null;
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Kunne ikke hente betalingsstatus');
      }
      return data as BillingStatusResult;
    },
    staleTime: 1000 * 60 * 5
  });
}

