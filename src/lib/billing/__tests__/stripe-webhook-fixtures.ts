/**
 * Ekte-formede Stripe-webhookhendelser, i de to rendringene kontoen vår kan
 * levere.
 *
 * «dahlia» er kontoens standardversjon i dag (2026-05-27.dahlia). Der ligger
 * current_period_start/end på linjeelementet, og topnivåfeltene svarer null.
 * «2024-06-20» er versjonen SDK-en er pinnet til; der ligger de på topnivå og
 * linjeelementet har dem ikke i det hele tatt.
 *
 * Tallene er hentet fra revisjonens lesning av det ekte abonnementet
 * (sub_1ThYAQ…): 1781282569 og 1783874569 — én månedsperiode.
 */

export const PERIOD_START_UNIX = 1781282569;
export const PERIOD_END_UNIX = 1783874569;
export const PERIOD_START_ISO = '2026-06-12T16:42:49.000Z';
export const PERIOD_END_ISO = '2026-07-12T16:42:49.000Z';

export const TEST_USER_ID = '50d3c496-8842-4dc5-8719-613e023458e9';
export const TEST_CUSTOMER_ID = 'cus_TZ8QhV1kX2mNbA';
export const TEST_SUBSCRIPTION_ID = 'sub_1ThYAQPvIc25pUd2xpXqQhwp';
export const TEST_PRICE_PREMIUM = 'price_1PremiumMonthlyTest';

type SubscriptionEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted';

interface FixtureOptions {
  type?: SubscriptionEventType;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  /** Sett null for å etterligne et abonnement uten user_id i metadata. */
  userId?: string | null;
  priceId?: string;
}

function subscriptionItem(extra: Record<string, unknown>) {
  return {
    id: 'si_TZ8Qab12CdEf',
    object: 'subscription_item',
    created: PERIOD_START_UNIX,
    metadata: {},
    quantity: 1,
    subscription: TEST_SUBSCRIPTION_ID,
    ...extra
  };
}

function wrapEvent(apiVersion: string, type: SubscriptionEventType, subscription: unknown) {
  return {
    id: 'evt_1ThYARPvIc25pUd2QwErTyUi',
    object: 'event',
    api_version: apiVersion,
    created: PERIOD_START_UNIX + 1,
    livemode: true,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: {
      object: subscription,
      previous_attributes: { status: 'incomplete' }
    }
  };
}

/**
 * Slik hendelsen faktisk ser ut i dag: periodefeltene er FLYTTET ned på
 * items.data[0], og topnivåfeltene står igjen som null.
 */
export function dahliaSubscriptionEvent(options: FixtureOptions = {}) {
  const {
    type = 'customer.subscription.updated',
    status = 'active',
    cancelAtPeriodEnd = false,
    userId = TEST_USER_ID,
    priceId = TEST_PRICE_PREMIUM
  } = options;

  return wrapEvent('2026-05-27.dahlia', type, {
    id: TEST_SUBSCRIPTION_ID,
    object: 'subscription',
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: type === 'customer.subscription.deleted' ? PERIOD_END_UNIX : null,
    collection_method: 'charge_automatically',
    created: PERIOD_START_UNIX,
    currency: 'nok',
    current_period_end: null,
    current_period_start: null,
    customer: TEST_CUSTOMER_ID,
    livemode: true,
    metadata: userId ? { user_id: userId, tier: 'premium' } : {},
    status,
    items: {
      object: 'list',
      has_more: false,
      total_count: 1,
      url: `/v1/subscription_items?subscription=${TEST_SUBSCRIPTION_ID}`,
      data: [
        subscriptionItem({
          current_period_start: PERIOD_START_UNIX,
          current_period_end: PERIOD_END_UNIX,
          price: { id: priceId, object: 'price', currency: 'nok', unit_amount: 7900, recurring: { interval: 'month' } }
        })
      ]
    }
  });
}

/** Samme hendelse rendret i den gamle versjonen SDK-en er pinnet til. */
export function legacySubscriptionEvent(options: FixtureOptions = {}) {
  const {
    type = 'customer.subscription.updated',
    status = 'active',
    cancelAtPeriodEnd = false,
    userId = TEST_USER_ID,
    priceId = TEST_PRICE_PREMIUM
  } = options;

  return wrapEvent('2024-06-20', type, {
    id: TEST_SUBSCRIPTION_ID,
    object: 'subscription',
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: type === 'customer.subscription.deleted' ? PERIOD_END_UNIX : null,
    collection_method: 'charge_automatically',
    created: PERIOD_START_UNIX,
    currency: 'nok',
    current_period_start: PERIOD_START_UNIX,
    current_period_end: PERIOD_END_UNIX,
    customer: TEST_CUSTOMER_ID,
    livemode: true,
    metadata: userId ? { user_id: userId, tier: 'premium' } : {},
    status,
    items: {
      object: 'list',
      has_more: false,
      total_count: 1,
      url: `/v1/subscription_items?subscription=${TEST_SUBSCRIPTION_ID}`,
      data: [
        subscriptionItem({
          price: { id: priceId, object: 'price', currency: 'nok', unit_amount: 7900, recurring: { interval: 'month' } }
        })
      ]
    }
  });
}

/**
 * Verstefallet: ingen periode noe sted. Kan oppstå hvis Stripe igjen flytter
 * feltene, eller ved en hendelsestype vi ikke har sett formen på.
 */
export function periodlessSubscriptionEvent(options: FixtureOptions = {}) {
  const event = dahliaSubscriptionEvent(options);
  const subscription = event.data.object as Record<string, unknown>;
  const items = subscription.items as { data: Record<string, unknown>[] };
  delete items.data[0].current_period_start;
  delete items.data[0].current_period_end;
  return event;
}
