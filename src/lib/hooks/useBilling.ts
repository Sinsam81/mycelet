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

export function useBillingStatus(enabled: boolean) {
  return useQuery<BillingStatusResult | null>({
    queryKey: ['billing-status'],
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

