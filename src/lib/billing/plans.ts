export type BillingTier = 'free' | 'premium' | 'season_pass';
/** The purchasable tiers (IAP + Stripe both sell exactly these two). */
export type IapPlan = Exclude<BillingTier, 'free'>;
export type BillingStatus = 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

export const FREE_DAILY_AI_LIMIT = 5;

export const BILLING_PLANS: Record<
  Exclude<BillingTier, 'free'>,
  {
    tier: Exclude<BillingTier, 'free'>;
    label: string;
    monthlyNok?: number;
    yearlyNok?: number;
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
    yearlyNok: 249,
    description: 'Alle premium-funksjoner, fornyes årlig.',
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

/**
 * Substring fallback for IAP product ids that aren't in the exact env map.
 * Shared by the RevenueCat webhook (server) and the native purchase UI
 * (client) — ONE copy, so the app can never sell a package the webhook then
 * fails to recognize. Env-free and pure by design (client-safe).
 * Season is checked first: an id containing both words is priced as the
 * yearly pass, the safer (longer-entitlement) interpretation.
 */
export function guessTierFromProductId(productId: string | null | undefined): BillingTier {
  if (!productId) return 'free';
  const normalized = productId.toLowerCase();
  if (normalized.includes('season') || normalized.includes('sesong') || normalized.includes('säsong')) {
    return 'season_pass';
  }
  if (normalized.includes('premium') || normalized.includes('month')) return 'premium';
  return 'free';
}

