import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RevenueCatEvent,
  mapRevenueCatEvent,
  resolveSupabaseUserId,
  resolveTierByRcProductId
} from '../revenuecat';

const USER_UUID = '3f2f8665-f190-45dd-97af-238fced3a7c7';
const ANON_ID = '$RCAnonymousID:87c157a8b3f94d0ea2f0ba2c53d2a4e1';

const PURCHASED_MS = 1784400000000; // 2026-07-18T...
const EXPIRES_MS = 1787078400000; // ~én måned senere

function baseEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    id: 'evt-123',
    app_user_id: USER_UUID,
    original_app_user_id: USER_UUID,
    aliases: [USER_UUID],
    product_id: 'no.mycelet.premium.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: PURCHASED_MS,
    expiration_at_ms: EXPIRES_MS,
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    ...overrides
  };
}

describe('resolveSupabaseUserId', () => {
  it('uses app_user_id when it is a UUID', () => {
    expect(resolveSupabaseUserId(baseEvent())).toBe(USER_UUID);
  });

  it('falls back to original_app_user_id when app_user_id is anonymous', () => {
    const event = baseEvent({ app_user_id: ANON_ID, original_app_user_id: USER_UUID, aliases: [ANON_ID] });
    expect(resolveSupabaseUserId(event)).toBe(USER_UUID);
  });

  it('finds the UUID in aliases when both primary ids are anonymous', () => {
    const event = baseEvent({ app_user_id: ANON_ID, original_app_user_id: ANON_ID, aliases: [ANON_ID, USER_UUID] });
    expect(resolveSupabaseUserId(event)).toBe(USER_UUID);
  });

  it('returns null when no UUID exists anywhere (pure anonymous purchase)', () => {
    const event = baseEvent({ app_user_id: ANON_ID, original_app_user_id: ANON_ID, aliases: [ANON_ID] });
    expect(resolveSupabaseUserId(event)).toBeNull();
  });
});

describe('resolveTierByRcProductId', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('maps the default product ids', () => {
    expect(resolveTierByRcProductId('no.mycelet.premium.monthly')).toBe('premium');
    expect(resolveTierByRcProductId('no.mycelet.seasonpass.yearly')).toBe('season_pass');
  });

  it('honours env overrides', () => {
    vi.stubEnv('REVENUECAT_PRODUCT_PREMIUM_MONTHLY', 'custom.monthly.79');
    expect(resolveTierByRcProductId('custom.monthly.79')).toBe('premium');
  });

  it('falls back to substring heuristics for near-miss ids', () => {
    expect(resolveTierByRcProductId('no.mycelet.app.premium_monthly_79')).toBe('premium');
    expect(resolveTierByRcProductId('no.mycelet.app.sesongpass249')).toBe('season_pass');
  });

  it('returns free for null/unknown', () => {
    expect(resolveTierByRcProductId(null)).toBe('free');
    expect(resolveTierByRcProductId('com.other.app.widget')).toBe('free');
  });
});

describe('mapRevenueCatEvent — grants', () => {
  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED'])(
    '%s grants active access with period end from expiration_at_ms',
    (type) => {
      const decision = mapRevenueCatEvent(baseEvent({ type }));
      expect(decision.action).toBe('apply');
      if (decision.action !== 'apply') return;
      expect(decision.revokes).toBe(false);
      expect(decision.update.status).toBe('active');
      expect(decision.update.tier).toBe('premium');
      expect(decision.update.currentPeriodEnd).toBe(new Date(EXPIRES_MS).toISOString());
      expect(decision.update.cancelAtPeriodEnd).toBe(false);
    }
  );

  it('trial purchases map to trialing (hasPaidAccess treats trialing as paid)', () => {
    const decision = mapRevenueCatEvent(baseEvent({ period_type: 'TRIAL' }));
    expect(decision.action === 'apply' && decision.update.status).toBe('trialing');
  });

  it('season pass product grants season_pass tier', () => {
    const decision = mapRevenueCatEvent(baseEvent({ product_id: 'no.mycelet.seasonpass.yearly' }));
    expect(decision.action === 'apply' && decision.update.tier).toBe('season_pass');
  });

  it('NON_RENEWING_PURCHASE without expiration keeps a null period end (no auto-cutoff)', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null }));
    expect(decision.action === 'apply' && decision.update.currentPeriodEnd).toBeNull();
  });

  it('acks (does not grant) when the product id maps to no tier', () => {
    const decision = mapRevenueCatEvent(baseEvent({ product_id: 'com.other.unknown' }));
    expect(decision).toEqual({ action: 'ack', reason: 'unknown_product' });
  });
});

describe('mapRevenueCatEvent — cancellation vs expiration (the critical distinction)', () => {
  it('CANCELLATION (unsubscribe) keeps access until period end', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }));
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    // Access must CONTINUE: status active + period end untouched.
    expect(decision.revokes).toBe(false);
    expect(decision.update.status).toBe('active');
    expect(decision.update.cancelAtPeriodEnd).toBe(true);
    expect(decision.update.currentPeriodEnd).toBe(new Date(EXPIRES_MS).toISOString());
  });

  it('CANCELLATION (CUSTOMER_SUPPORT = refund) revokes immediately', () => {
    const now = 1784500000000;
    const decision = mapRevenueCatEvent(
      baseEvent({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: now })
    );
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    expect(decision.revokes).toBe(true);
    expect(decision.update.status).toBe('canceled');
    expect(decision.update.currentPeriodEnd).toBe(new Date(now).toISOString());
  });

  it('EXPIRATION revokes access', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: 'EXPIRATION', expiration_reason: 'UNSUBSCRIBE' }));
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    expect(decision.revokes).toBe(true);
    expect(decision.update.status).toBe('canceled');
  });
});

describe('mapRevenueCatEvent — billing issues', () => {
  it('BILLING_ISSUE with grace period extends access to grace end', () => {
    const graceEnd = EXPIRES_MS + 16 * 24 * 60 * 60 * 1000;
    const decision = mapRevenueCatEvent(
      baseEvent({ type: 'BILLING_ISSUE', grace_period_expiration_at_ms: graceEnd })
    );
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    expect(decision.revokes).toBe(false);
    expect(decision.update.status).toBe('active');
    expect(decision.update.currentPeriodEnd).toBe(new Date(graceEnd).toISOString());
  });

  it('BILLING_ISSUE without grace period marks past_due (access off)', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: 'BILLING_ISSUE' }));
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    expect(decision.revokes).toBe(true);
    expect(decision.update.status).toBe('past_due');
  });
});

describe('mapRevenueCatEvent — informational events are ACKed, never retried', () => {
  it.each(['TEST', 'PRODUCT_CHANGE', 'TRANSFER', 'SUBSCRIBER_ALIAS', 'SUBSCRIPTION_PAUSED', 'INVOICE_ISSUANCE', 'SOME_FUTURE_TYPE'])(
    '%s → ack',
    (type) => {
      const decision = mapRevenueCatEvent(baseEvent({ type }));
      expect(decision.action).toBe('ack');
    }
  );

  it('event with no type at all is still acked', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: undefined }));
    expect(decision.action).toBe('ack');
  });
});
