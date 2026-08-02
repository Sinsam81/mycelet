import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingStatus, BillingTier } from '@/lib/billing/plans';
import { getPlanViewState } from '@/lib/billing/plan-state';
import { getBillingCapabilities, BillingSubscription } from '@/lib/billing/subscription';
import { IapOffer, purchaseIapOffer } from '../purchases';

/**
 * Vakten mot dobbeltbetaling i den native kjøpsflyten.
 *
 * Web er beskyttet av 409-en i /api/billing/checkout. Apple-kjøpet går aldri
 * via den ruta, så uten denne vakten kunne en kunde med aktivt Stripe-
 * abonnement kjøpe den andre planen hos Apple og betale to steder samtidig.
 *
 * Testen sjekker det som faktisk koster penger: at plugin-en — og dermed
 * Apples betalingsark — aldri blir rørt når kunden allerede har en betalt plan.
 */

const purchasePackage = vi.fn();

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    purchasePackage,
    configure: vi.fn(),
    isConfigured: vi.fn(),
    logIn: vi.fn(),
    getOfferings: vi.fn(),
    restorePurchases: vi.fn()
  }
}));

const IN_A_YEAR = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

/** En ekte billing_subscriptions-rad, slik /api/billing/status leser den. */
function row(tier: BillingTier, status: BillingStatus): BillingSubscription {
  return {
    user_id: 'user-1',
    tier,
    status,
    current_period_end: IN_A_YEAR,
    cancel_at_period_end: false,
    // Stripe-kunden fra web: kolonnene er satt, men vakten skal ikke bry seg
    // om HVOR abonnementet ble kjøpt — bare om kunden har tilgang nå.
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1'
  };
}

/** Samme kjede som prisesiden: rad → capabilities → visningstilstand. */
function viewFor(subscription: BillingSubscription | null) {
  return getPlanViewState(getBillingCapabilities(subscription));
}

const seasonPassOffer: IapOffer = {
  plan: 'season_pass',
  productId: 'no.mycelet.app.seasonpass.yearly',
  priceString: 'kr 249,00',
  packageIdentifier: '$rc_annual',
  rcPackage: {
    identifier: '$rc_annual',
    packageType: 'ANNUAL',
    product: { identifier: 'no.mycelet.app.seasonpass.yearly', priceString: 'kr 249,00' }
  }
};

describe('purchaseIapOffer', () => {
  beforeEach(() => {
    purchasePackage.mockReset();
    purchasePackage.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
  });

  it('åpner ikke Apples betalingsark når kunden har et aktivt Stripe-abonnement', async () => {
    const outcome = await purchaseIapOffer(seasonPassOffer, viewFor(row('premium', 'active')));

    expect(outcome).toBe('blocked-active-plan');
    expect(purchasePackage).not.toHaveBeenCalled();
  });

  it('sperrer uansett hvilken betalt plan kunden har, og hvilken de prøver å kjøpe', async () => {
    const paidStatuses: BillingStatus[] = ['active', 'trialing'];
    const paidTiers: Exclude<BillingTier, 'free'>[] = ['premium', 'season_pass'];
    const premiumOffer: IapOffer = {
      ...seasonPassOffer,
      plan: 'premium',
      packageIdentifier: '$rc_monthly',
      rcPackage: { ...seasonPassOffer.rcPackage, identifier: '$rc_monthly', packageType: 'MONTHLY' }
    };

    for (const tier of paidTiers) {
      for (const status of paidStatuses) {
        for (const offer of [seasonPassOffer, premiumOffer]) {
          const outcome = await purchaseIapOffer(offer, viewFor(row(tier, status)));
          expect(outcome, `${tier}/${status} → ${offer.plan}`).toBe('blocked-active-plan');
        }
      }
    }
    expect(purchasePackage).not.toHaveBeenCalled();
  });

  it('slipper gratisbrukeren gjennom til kjøp', async () => {
    const outcome = await purchaseIapOffer(seasonPassOffer, viewFor(null));

    expect(outcome).toBe('success');
    expect(purchasePackage).toHaveBeenCalledTimes(1);
  });

  it('slipper gjennom en kunde hvis abonnement ikke lenger gir tilgang', async () => {
    // Oppsagt/utløpt plan er ikke dobbeltbetaling — den kunden SKAL kunne kjøpe.
    const outcome = await purchaseIapOffer(seasonPassOffer, viewFor(row('premium', 'canceled')));

    expect(outcome).toBe('success');
    expect(purchasePackage).toHaveBeenCalledTimes(1);
  });
});
