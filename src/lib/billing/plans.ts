export type BillingTier = 'free' | 'premium' | 'season_pass';
export type BillingStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

export const FREE_DAILY_AI_LIMIT = 5;

export const BILLING_PLANS: Record<
  Exclude<BillingTier, 'free'>,
  {
    tier: Exclude<BillingTier, 'free'>;
    label: string;
    monthlyNok?: number;
    oneTimeNok?: number;
    description: string;
    priceEnvKey: 'STRIPE_PRICE_PREMIUM_MONTHLY' | 'STRIPE_PRICE_SEASON_PASS';
  }
> = {
  premium: {
    tier: 'premium',
    label: 'Premium',
    monthlyNok: 79,
    description: 'Ubegrenset AI-identifikasjon, prediksjon og premium-funksjoner.',
    priceEnvKey: 'STRIPE_PRICE_PREMIUM_MONTHLY'
  },
  season_pass: {
    tier: 'season_pass',
    label: 'Sesongpass',
    oneTimeNok: 199,
    description: 'Premium-tilgang for soppsesongen.',
    priceEnvKey: 'STRIPE_PRICE_SEASON_PASS'
  }
};

export function isPaidTier(tier: BillingTier | null | undefined): tier is Exclude<BillingTier, 'free'> {
  return tier === 'premium' || tier === 'season_pass';
}

export function hasPaidAccess(status: BillingStatus | null | undefined, tier: BillingTier | null | undefined, currentPeriodEnd?: string | null) {
  if (!status || !tier || !isPaidTier(tier)) return false;
  if (!(status === 'active' || status === 'trialing')) return false;
  if (!currentPeriodEnd) return true;
  return new Date(currentPeriodEnd).getTime() > Date.now();
}

export function resolveTierByPriceId(priceId: string | null | undefined): BillingTier {
  if (!priceId) return 'free';
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY) return 'premium';
  if (priceId === process.env.STRIPE_PRICE_SEASON_PASS) return 'season_pass';
  return 'free';
}

