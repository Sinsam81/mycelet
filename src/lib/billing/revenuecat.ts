import { BillingTier } from './plans';

/**
 * RevenueCat webhook event mapping — pure logic, no I/O.
 *
 * RevenueCat is the IAP layer for the native apps (Apple App Store now, Google
 * Play later). Its webhook drives the SAME `billing_subscriptions` row that
 * Stripe writes on web, so `getBillingCapabilities` stays the single source of
 * truth for paid access regardless of where the user bought.
 *
 * Event semantics (docs.revenuecat.com/docs/integrations/webhooks):
 * - CANCELLATION means "auto-renew turned off" — access CONTINUES until the
 *   period ends. EXPIRATION is the event that actually removes access. The one
 *   exception: cancel_reason CUSTOMER_SUPPORT is a refund → revoke immediately.
 * - RevenueCat retries deliveries (at-least-once); `event.id` is the official
 *   dedup key.
 * - `environment: 'SANDBOX'` events come from sandbox/TestFlight purchases —
 *   only honored when REVENUECAT_ALLOW_SANDBOX=1 (on during pre-launch
 *   testing, OFF after launch so sandbox buys can't grant free premium).
 */

export interface RevenueCatEvent {
  type?: string;
  id?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  entitlement_ids?: string[] | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  store?: string | null;
  environment?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
}

export interface RevenueCatWebhookBody {
  api_version?: string;
  event?: RevenueCatEvent;
}

/** Update to apply to the user's billing_subscriptions row. */
export interface BillingUpdate {
  tier: BillingTier;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export type RevenueCatDecision =
  | { action: 'apply'; update: BillingUpdate; revokes: boolean }
  | { action: 'ack'; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The RC app user id is set to the Supabase user UUID at SDK configure time,
 * so `app_user_id` is normally our user id directly. But anonymous-ID merges
 * mean the UUID can also hide in `original_app_user_id` or `aliases`
 * (anonymous ids look like `$RCAnonymousID:...`). Scan all of them.
 */
export function resolveSupabaseUserId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  for (const candidate of candidates) {
    if (candidate && UUID_RE.test(candidate)) return candidate;
  }
  return null;
}

/**
 * Product-id → tier, mirroring `resolveTierByPriceId` for Stripe. The ids are
 * env-configurable so App Store Connect naming can change without a deploy;
 * the substring fallback keeps an unmapped-but-obvious id working.
 */
export function resolveTierByRcProductId(productId: string | null | undefined): BillingTier {
  if (!productId) return 'free';
  if (productId === (process.env.REVENUECAT_PRODUCT_PREMIUM_MONTHLY ?? 'no.mycelet.premium.monthly')) {
    return 'premium';
  }
  if (productId === (process.env.REVENUECAT_PRODUCT_SEASON_PASS ?? 'no.mycelet.seasonpass.yearly')) {
    return 'season_pass';
  }
  const normalized = productId.toLowerCase();
  if (normalized.includes('season') || normalized.includes('sesong')) return 'season_pass';
  if (normalized.includes('premium') || normalized.includes('month')) return 'premium';
  return 'free';
}

function toIsoFromMs(ms: number | null | undefined): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

const GRANT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED'
]);

/**
 * Map one webhook event to a billing decision. Everything unknown or
 * informational is ACKed (RevenueCat retries non-200s up to 5 times — an
 * unhandled-but-harmless event must never turn into a retry storm).
 */
export function mapRevenueCatEvent(event: RevenueCatEvent): RevenueCatDecision {
  const type = event.type ?? 'UNKNOWN';

  if (type === 'TEST') return { action: 'ack', reason: 'test_event' };

  if (GRANT_TYPES.has(type)) {
    const tier = resolveTierByRcProductId(event.product_id);
    if (tier === 'free') return { action: 'ack', reason: 'unknown_product' };
    return {
      action: 'apply',
      revokes: false,
      update: {
        tier,
        status: event.period_type === 'TRIAL' ? 'trialing' : 'active',
        currentPeriodStart: toIsoFromMs(event.purchased_at_ms),
        currentPeriodEnd: toIsoFromMs(event.expiration_at_ms),
        cancelAtPeriodEnd: false
      }
    };
  }

  if (type === 'CANCELLATION') {
    const tier = resolveTierByRcProductId(event.product_id);
    if (tier === 'free') return { action: 'ack', reason: 'unknown_product' };
    if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
      // Refund → access off now (an EXPIRATION usually follows; this is the
      // belt-and-braces path so a refunded user never keeps premium).
      return {
        action: 'apply',
        revokes: true,
        update: {
          tier,
          status: 'canceled',
          currentPeriodStart: toIsoFromMs(event.purchased_at_ms),
          currentPeriodEnd: toIsoFromMs(event.event_timestamp_ms),
          cancelAtPeriodEnd: true
        }
      };
    }
    // Auto-renew off: access continues until expiration (Stripe-paritet:
    // status stays active + cancel_at_period_end).
    return {
      action: 'apply',
      revokes: false,
      update: {
        tier,
        status: 'active',
        currentPeriodStart: toIsoFromMs(event.purchased_at_ms),
        currentPeriodEnd: toIsoFromMs(event.expiration_at_ms),
        cancelAtPeriodEnd: true
      }
    };
  }

  if (type === 'EXPIRATION') {
    const tier = resolveTierByRcProductId(event.product_id);
    if (tier === 'free') return { action: 'ack', reason: 'unknown_product' };
    return {
      action: 'apply',
      revokes: true,
      update: {
        tier,
        status: 'canceled',
        currentPeriodStart: toIsoFromMs(event.purchased_at_ms),
        currentPeriodEnd: toIsoFromMs(event.expiration_at_ms),
        cancelAtPeriodEnd: true
      }
    };
  }

  if (type === 'BILLING_ISSUE') {
    const tier = resolveTierByRcProductId(event.product_id);
    if (tier === 'free') return { action: 'ack', reason: 'unknown_product' };
    const graceEnd = toIsoFromMs(event.grace_period_expiration_at_ms);
    if (graceEnd) {
      // Store grace period keeps access alive; extend to its end. RENEWAL
      // (recovered) or EXPIRATION (lost) arrives later and settles it.
      return {
        action: 'apply',
        revokes: false,
        update: {
          tier,
          status: 'active',
          currentPeriodStart: toIsoFromMs(event.purchased_at_ms),
          currentPeriodEnd: graceEnd,
          cancelAtPeriodEnd: true
        }
      };
    }
    return {
      action: 'apply',
      revokes: true,
      update: {
        tier,
        status: 'past_due',
        currentPeriodStart: toIsoFromMs(event.purchased_at_ms),
        currentPeriodEnd: toIsoFromMs(event.expiration_at_ms),
        cancelAtPeriodEnd: true
      }
    };
  }

  // PRODUCT_CHANGE: the real switch arrives as RENEWAL/INITIAL_PURCHASE.
  // TRANSFER: rare cross-account move — ack + rely on the follow-up events for
  // the destination user (the route logs it loudly for manual follow-up).
  // SUBSCRIBER_ALIAS, SUBSCRIPTION_PAUSED, PAYWALL_*, etc.: informational.
  return { action: 'ack', reason: `unhandled_type:${type}` };
}
