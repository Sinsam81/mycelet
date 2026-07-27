import { BillingTier, guessTierFromProductId } from './plans';

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
 *   dedup key, and deliveries can arrive OUT OF ORDER — the route enforces
 *   ordering via the stored rc_event_timestamp_ms.
 * - `environment: 'SANDBOX'` events come from sandbox/TestFlight purchases —
 *   only honored when REVENUECAT_ALLOW_SANDBOX=1 (keep ON through App Review,
 *   turn OFF after launch so sandbox buys can't grant free premium).
 *
 * Decision kinds drive the route's cross-provider ownership rules:
 * - 'grant'  = new money/entitlement → always applies (takes ownership).
 * - 'modify' = changes renewal state of an EXISTING Apple sub → only applies
 *              when the row is RevenueCat-owned (or unpaid).
 * - 'revoke' = removes access → same ownership requirement, so an old Apple
 *              event can never kill a subscription the user pays via Stripe.
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
  | { action: 'apply'; kind: 'grant' | 'modify' | 'revoke'; update: BillingUpdate }
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
 * the shared substring fallback keeps an unmapped-but-obvious id working (and
 * keeps client + server interpreting the catalog identically).
 */
export function resolveTierByRcProductId(productId: string | null | undefined): BillingTier {
  if (!productId) return 'free';
  if (productId === (process.env.REVENUECAT_PRODUCT_PREMIUM_MONTHLY ?? 'no.mycelet.premium.monthly')) {
    return 'premium';
  }
  if (productId === (process.env.REVENUECAT_PRODUCT_SEASON_PASS ?? 'no.mycelet.seasonpass.yearly')) {
    return 'season_pass';
  }
  return guessTierFromProductId(productId);
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

/** Event types this integration acts on; everything else is ACKed untouched. */
const HANDLED_TYPES = new Set([...GRANT_TYPES, 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE']);

/**
 * Map one webhook event to a billing decision. Everything unknown or
 * informational is ACKed (RevenueCat retries non-200s up to 5 times — an
 * unhandled-but-harmless event must never turn into a retry storm).
 */
export function mapRevenueCatEvent(event: RevenueCatEvent): RevenueCatDecision {
  const type = event.type ?? 'UNKNOWN';

  if (!HANDLED_TYPES.has(type)) {
    // TEST, PRODUCT_CHANGE (real switch arrives as RENEWAL/INITIAL_PURCHASE),
    // TRANSFER (route logs loudly for manual follow-up), SUBSCRIBER_ALIAS,
    // SUBSCRIPTION_PAUSED, PAYWALL_*, future types.
    return { action: 'ack', reason: type === 'TEST' ? 'test_event' : `unhandled_type:${type}` };
  }

  const tier = resolveTierByRcProductId(event.product_id);
  if (tier === 'free') return { action: 'ack', reason: 'unknown_product' };

  const periodStart = toIsoFromMs(event.purchased_at_ms);
  const periodEnd = toIsoFromMs(event.expiration_at_ms);

  if (GRANT_TYPES.has(type)) {
    return {
      action: 'apply',
      kind: 'grant',
      update: {
        tier,
        status: event.period_type === 'TRIAL' ? 'trialing' : 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      }
    };
  }

  if (type === 'CANCELLATION') {
    if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
      // Refund → access off now (an EXPIRATION usually follows; this is the
      // belt-and-braces path so a refunded user never keeps premium).
      return {
        action: 'apply',
        kind: 'revoke',
        update: {
          tier,
          status: 'canceled',
          currentPeriodStart: periodStart,
          currentPeriodEnd: toIsoFromMs(event.event_timestamp_ms),
          cancelAtPeriodEnd: true
        }
      };
    }
    // Auto-renew off: access continues until expiration (Stripe-paritet:
    // status stays active + cancel_at_period_end).
    return {
      action: 'apply',
      kind: 'modify',
      update: {
        tier,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true
      }
    };
  }

  if (type === 'EXPIRATION') {
    return {
      action: 'apply',
      kind: 'revoke',
      update: {
        tier,
        status: 'canceled',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true
      }
    };
  }

  // BILLING_ISSUE
  const graceEnd = toIsoFromMs(event.grace_period_expiration_at_ms);
  if (graceEnd) {
    // Store grace period keeps access alive; extend to its end. RENEWAL
    // (recovered) or EXPIRATION (lost) arrives later and settles it.
    return {
      action: 'apply',
      kind: 'modify',
      update: {
        tier,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: graceEnd,
        cancelAtPeriodEnd: true
      }
    };
  }
  return {
    action: 'apply',
    kind: 'revoke',
    update: {
      tier,
      status: 'past_due',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true
    }
  };
}
