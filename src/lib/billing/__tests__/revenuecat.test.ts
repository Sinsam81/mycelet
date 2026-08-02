import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingUpdate,
  ManualGrant,
  RevenueCatEvent,
  applyManualGrantFloor,
  isManualGrantActive,
  mapRevenueCatEvent,
  readManualGrant,
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
      expect(decision.kind).toBe('grant');
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
    expect(decision.kind).toBe('modify');
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
    expect(decision.kind).toBe('revoke');
    expect(decision.update.status).toBe('canceled');
    expect(decision.update.currentPeriodEnd).toBe(new Date(now).toISOString());
  });

  it('EXPIRATION revokes access', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: 'EXPIRATION', expiration_reason: 'UNSUBSCRIBE' }));
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    expect(decision.kind).toBe('revoke');
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
    expect(decision.kind).toBe('modify');
    expect(decision.update.status).toBe('active');
    expect(decision.update.currentPeriodEnd).toBe(new Date(graceEnd).toISOString());
  });

  it('BILLING_ISSUE without grace period marks past_due (access off)', () => {
    const decision = mapRevenueCatEvent(baseEvent({ type: 'BILLING_ISSUE' }));
    expect(decision.action).toBe('apply');
    if (decision.action !== 'apply') return;
    expect(decision.kind).toBe('revoke');
    expect(decision.update.status).toBe('past_due');
  });
});

describe('guessTierFromProductId — shared client/server heuristic', () => {
  it('season wins when an id contains both season and month words', async () => {
    const { guessTierFromProductId } = await import('../plans');
    // "seasonal intro on the monthly plan" must resolve to the LONGER
    // entitlement deterministically, not depend on branch order drift.
    expect(guessTierFromProductId('no.mycelet.premium.monthly.season2027intro')).toBe('season_pass');
    expect(guessTierFromProductId('no.mycelet.sasong.arlig')).toBe('free'); // 'sasong' without ä/e is unknown → free
    expect(guessTierFromProductId('no.mycelet.säsong.årlig')).toBe('season_pass');
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

describe('manuelt tildelt pass — gulvet', () => {
  const inYears = (n: number) => new Date(Date.now() + n * 365 * 24 * 60 * 60 * 1000).toISOString();
  const agoYears = (n: number) => new Date(Date.now() - n * 365 * 24 * 60 * 60 * 1000).toISOString();

  const purchase = (overrides: Partial<BillingUpdate> = {}): BillingUpdate => ({
    tier: 'premium',
    status: 'active',
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    ...overrides
  });

  it('leser passet fra radens egne kolonner når metadata.source er satt', () => {
    const grant = readManualGrant({
      tier: 'season_pass',
      status: 'active',
      current_period_start: agoYears(1),
      current_period_end: inYears(2),
      cancel_at_period_end: false,
      metadata: { source: 'manual_grant', note: 'Apple App Review demo account' }
    });
    expect(grant).toMatchObject({ tier: 'season_pass', note: 'Apple App Review demo account' });
    expect(isManualGrantActive(grant)).toBe(true);
  });

  it('leser passet fra metadata.manual_grant når et kjøp eier raden', () => {
    const grant = readManualGrant({
      tier: 'premium',
      status: 'active',
      current_period_end: inYears(1),
      metadata: {
        provider: 'revenuecat',
        manual_grant: { tier: 'season_pass', status: 'active', current_period_end: inYears(2) }
      }
    });
    expect(grant?.tier).toBe('season_pass');
  });

  it('finner ikke noe pass på en vanlig kjøpsrad', () => {
    expect(readManualGrant({ tier: 'premium', status: 'active', metadata: { provider: 'revenuecat' } })).toBeNull();
    expect(readManualGrant(null)).toBeNull();
  });

  it('leser ikke et pass uten lesbar tier eller status — tvil gir intet gulv', () => {
    expect(readManualGrant({ tier: 'free', status: 'active', metadata: { source: 'manual_grant' } })).toBeNull();
    expect(readManualGrant({ tier: 'premium', metadata: { source: 'manual_grant' } })).toBeNull();
    expect(readManualGrant({ metadata: { source: 'manual_grant', manual_grant: 'ikke et objekt' } })).toBeNull();
  });

  it('et utløpt eller kansellert pass er ikke noe gulv', () => {
    const utlopt = readManualGrant({
      tier: 'season_pass',
      status: 'active',
      current_period_end: agoYears(1),
      metadata: { source: 'manual_grant' }
    });
    const kansellert = readManualGrant({
      tier: 'season_pass',
      status: 'canceled',
      current_period_end: inYears(1),
      metadata: { source: 'manual_grant' }
    });
    expect(isManualGrantActive(utlopt)).toBe(false);
    expect(isManualGrantActive(kansellert)).toBe(false);
  });

  const activeGrant: ManualGrant = {
    tier: 'season_pass',
    status: 'active',
    currentPeriodStart: agoYears(1),
    currentPeriodEnd: inYears(2),
    cancelAtPeriodEnd: false,
    note: 'Apple App Review demo account'
  };

  it('et kortere sandkassekjøp faller til gulvet', () => {
    const { update, floorApplied } = applyManualGrantFloor(purchase(), activeGrant);
    expect(floorApplied).toBe(true);
    expect(update).toMatchObject({
      tier: 'season_pass',
      status: 'active',
      currentPeriodEnd: activeGrant.currentPeriodEnd
    });
  });

  it('en revoke faller til gulvet', () => {
    const { update, floorApplied } = applyManualGrantFloor(
      purchase({ status: 'canceled', currentPeriodEnd: new Date().toISOString(), cancelAtPeriodEnd: true }),
      activeGrant
    );
    expect(floorApplied).toBe(true);
    expect(update.status).toBe('active');
    expect(update.tier).toBe('season_pass');
  });

  it('et kjøp som varer lenger enn passet får eie raden', () => {
    const longer = purchase({ tier: 'season_pass', currentPeriodEnd: inYears(3) });
    const { update, floorApplied } = applyManualGrantFloor(longer, activeGrant);
    expect(floorApplied).toBe(false);
    expect(update).toBe(longer);
  });

  it('et pass uten sluttdato slår selv et kjøp uten sluttdato', () => {
    const evig = { ...activeGrant, currentPeriodEnd: null };
    expect(applyManualGrantFloor(purchase({ currentPeriodEnd: null }), evig).floorApplied).toBe(true);
  });

  it('uten pass, eller med utløpt pass, endres ingenting', () => {
    const rc = purchase({ status: 'canceled' });
    expect(applyManualGrantFloor(rc, null)).toEqual({ update: rc, floorApplied: false });
    expect(applyManualGrantFloor(rc, { ...activeGrant, currentPeriodEnd: agoYears(1) })).toEqual({
      update: rc,
      floorApplied: false
    });
  });
});
