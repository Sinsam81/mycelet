import { describe, expect, it } from 'vitest';
import { BillingStatus, BillingTier } from '../plans';
import { getBillingCapabilities, BillingSubscription } from '../subscription';
import { canPurchasePlan, getBlockingPaidPlan, getPlanViewState } from '../plan-state';

const ALL_STATUSES: BillingStatus[] = [
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired'
];

const PAID_TIERS: Exclude<BillingTier, 'free'>[] = ['premium', 'season_pass'];

const IN_A_YEAR = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
const LAST_MONTH = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

/** En ekte billing_subscriptions-rad, slik /api/billing/status leser den. */
function row(
  tier: BillingTier,
  status: BillingStatus,
  currentPeriodEnd: string | null = IN_A_YEAR
): BillingSubscription {
  return {
    user_id: 'user-1',
    tier,
    status,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: false,
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1'
  };
}

/** Hele kjeden prisesiden går gjennom: rad → capabilities → visningstilstand. */
function viewFor(subscription: BillingSubscription | null) {
  return getPlanViewState(getBillingCapabilities(subscription));
}

describe('getPlanViewState', () => {
  it('viser betalt plan som aktiv når abonnementet faktisk gir tilgang', () => {
    for (const tier of PAID_TIERS) {
      for (const status of ['active', 'trialing'] as BillingStatus[]) {
        const view = viewFor(row(tier, status));
        expect(view, `${tier}/${status}`).toEqual({
          activeTier: tier,
          lapsedTier: null,
          lapsed: false,
          needsPayment: false
        });
      }
    }
  });

  it('regner enhver status uten tilgang som bortfalt, ikke som aktiv plan', () => {
    const withoutAccess = ALL_STATUSES.filter((status) => status !== 'active' && status !== 'trialing');

    for (const tier of PAID_TIERS) {
      for (const status of withoutAccess) {
        const view = viewFor(row(tier, status));
        expect(view.activeTier, `${tier}/${status} skal ikke vises som aktiv plan`).toBe('free');
        expect(view.lapsed, `${tier}/${status}`).toBe(true);
        expect(view.lapsedTier, `${tier}/${status}`).toBe(tier);
      }
    }
  });

  it('behandler en aktiv rad med utløpt periode som bortfalt', () => {
    const view = viewFor(row('premium', 'active', LAST_MONTH));
    expect(view.activeTier).toBe('free');
    expect(view.lapsed).toBe(true);
    expect(view.lapsedTier).toBe('premium');
  });

  it('markerer bare betalingsproblem-statusene som needsPayment', () => {
    const expectNeedsPayment: BillingStatus[] = ['past_due', 'unpaid', 'incomplete'];

    for (const status of ALL_STATUSES) {
      const view = viewFor(row('premium', status));
      expect(view.needsPayment, `premium/${status}`).toBe(expectNeedsPayment.includes(status));
    }
  });

  it('gir gratisplan uten bortfall når det ikke finnes noen rad', () => {
    expect(viewFor(null)).toEqual({
      activeTier: 'free',
      lapsedTier: null,
      lapsed: false,
      needsPayment: false
    });
  });

  it('gir aldri gullmerke til en free-rad, uansett status', () => {
    for (const status of ALL_STATUSES) {
      const view = viewFor(row('free', status));
      expect(view.activeTier, `free/${status}`).toBe('free');
      expect(view.lapsed, `free/${status}`).toBe(false);
    }
  });
});

describe('canPurchasePlan', () => {
  it('skjuler ALDRI kjøpsknappen for et abonnement som ikke lenger gir tilgang', () => {
    const withoutAccess = ALL_STATUSES.filter((status) => status !== 'active' && status !== 'trialing');

    for (const tier of PAID_TIERS) {
      for (const status of withoutAccess) {
        const view = viewFor(row(tier, status));
        // Særlig for tier-ens EGEN plan: det var den knappen som forsvant.
        expect(canPurchasePlan(view, tier), `${tier}/${status} må kunne kjøpes på nytt`).toBe(true);
        for (const other of PAID_TIERS) {
          expect(canPurchasePlan(view, other), `${tier}/${status} → ${other}`).toBe(true);
        }
      }
    }
  });

  it('skjuler kjøpsknappen bare for planen kunden faktisk har tilgang til', () => {
    const view = viewFor(row('premium', 'active'));
    expect(canPurchasePlan(view, 'premium')).toBe(false);
    expect(canPurchasePlan(view, 'season_pass')).toBe(true);
  });

  it('viser begge kjøpsknappene for en gratisbruker', () => {
    const view = viewFor(null);
    expect(canPurchasePlan(view, 'premium')).toBe(true);
    expect(canPurchasePlan(view, 'season_pass')).toBe(true);
  });

  it('tilbyr aldri gratisplanen som et kjøp', () => {
    expect(canPurchasePlan(viewFor(null), 'free')).toBe(false);
    expect(canPurchasePlan(viewFor(row('premium', 'canceled')), 'free')).toBe(false);
  });
});

describe('getBlockingPaidPlan', () => {
  it('navngir planen som sperrer for et nytt kjøp — samme regel som 409-en i checkout', () => {
    for (const tier of PAID_TIERS) {
      for (const status of ['active', 'trialing'] as BillingStatus[]) {
        expect(getBlockingPaidPlan(viewFor(row(tier, status))), `${tier}/${status}`).toBe(tier);
      }
    }
  });

  it('sperrer ikke når abonnementet ikke lenger gir tilgang', () => {
    const withoutAccess = ALL_STATUSES.filter((status) => status !== 'active' && status !== 'trialing');

    for (const tier of PAID_TIERS) {
      for (const status of withoutAccess) {
        expect(getBlockingPaidPlan(viewFor(row(tier, status))), `${tier}/${status}`).toBeNull();
      }
    }
    expect(getBlockingPaidPlan(viewFor(row('premium', 'active', LAST_MONTH)))).toBeNull();
  });

  it('sperrer ikke for en gratisbruker', () => {
    expect(getBlockingPaidPlan(viewFor(null))).toBeNull();
    expect(getBlockingPaidPlan(viewFor(row('free', 'active')))).toBeNull();
  });
});
