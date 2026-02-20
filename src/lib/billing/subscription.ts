import { SupabaseClient } from '@supabase/supabase-js';
import { BillingStatus, BillingTier, FREE_DAILY_AI_LIMIT, hasPaidAccess } from './plans';

export interface BillingSubscription {
  user_id: string;
  tier: BillingTier;
  status: BillingStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export async function getUserBillingSubscription(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('user_id,tier,status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as BillingSubscription | null) ?? null;
}

export function getBillingCapabilities(subscription: BillingSubscription | null) {
  const tier = subscription?.tier ?? 'free';
  const status = subscription?.status ?? 'inactive';
  const paid = hasPaidAccess(status, tier, subscription?.current_period_end ?? null);

  return {
    tier,
    status,
    paid,
    aiDailyLimit: paid ? null : FREE_DAILY_AI_LIMIT
  };
}

