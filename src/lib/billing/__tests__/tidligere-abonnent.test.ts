import { describe, expect, it, vi } from 'vitest';
import { harHattStripeAbonnementFor, harHattTilgangFor, harHattTilgangIRaden, type StripeKundeoppslag } from '../tidligere-abonnent';

/**
 * Samme fasit for checkout (gir Stripe-prøven eller ikke), /api/billing/status
 * (kanFaaProve) og forsiden — så arket aldri lover en gratisuke kjøpet nekter.
 */
function stripeMed(abonnementPerKunde: Record<string, number>): StripeKundeoppslag & { kall: string[] } {
  const kall: string[] = [];
  return {
    kall,
    customers: {
      list: async ({ email }) => {
        kall.push(`customers:${email}`);
        return { data: Object.keys(abonnementPerKunde).map((id) => ({ id })) };
      }
    },
    subscriptions: {
      list: async ({ customer }) => {
        kall.push(`subscriptions:${customer}`);
        return { data: new Array(abonnementPerKunde[customer] ?? 0).fill({}) };
      }
    }
  };
}

describe('harHattTilgangIRaden', () => {
  it('rad som har pekt på Stripe-abonnement eller eies av en IAP-leverandør: ja — ellers nei', () => {
    expect(harHattTilgangIRaden({ stripe_subscription_id: 'sub_1', metadata: null })).toBe(true);
    expect(harHattTilgangIRaden({ stripe_subscription_id: null, metadata: { provider: 'revenuecat' } })).toBe(true);
    // Påbegynt, aldri betalt Checkout-sesjon (planCheckoutWrite) er ikke tidligere tilgang.
    expect(harHattTilgangIRaden({ stripe_subscription_id: null, metadata: { checkout_session_id: 'cs_1' } })).toBe(false);
    expect(harHattTilgangIRaden(null)).toBe(false);
    expect(harHattTilgangIRaden(undefined)).toBe(false);
  });
});

describe('harHattStripeAbonnementFor', () => {
  it('e-posten har en Stripe-kunde med abonnement (uansett status): ja', async () => {
    expect(await harHattStripeAbonnementFor(stripeMed({ cus_a: 0, cus_b: 1 }), 'x@example.com')).toBe(true);
  });

  it('kunder uten abonnement, eller ingen kunde: nei', async () => {
    expect(await harHattStripeAbonnementFor(stripeMed({ cus_a: 0 }), 'x@example.com')).toBe(false);
    expect(await harHattStripeAbonnementFor(stripeMed({}), 'x@example.com')).toBe(false);
  });

  it('feiler Stripe, er prøven default', async () => {
    const stripe: StripeKundeoppslag = {
      customers: { list: () => Promise.reject(new Error('nede')) },
      subscriptions: { list: () => Promise.resolve({ data: [] }) }
    };
    expect(await harHattStripeAbonnementFor(stripe, 'x@example.com')).toBe(false);
  });
});

describe('harHattTilgangFor', () => {
  it('raden svarer først — Stripe spørres ikke når den allerede sier ja', async () => {
    const stripe = vi.fn(() => stripeMed({ cus_a: 1 }));
    expect(await harHattTilgangFor({ subscription: { stripe_subscription_id: 'sub_1', metadata: null }, email: 'x@example.com', stripe })).toBe(true);
    expect(stripe).not.toHaveBeenCalled();
  });

  it('uten rad: slettet konto med samme e-post og gammelt Stripe-abonnement teller', async () => {
    const s = stripeMed({ cus_a: 1 });
    expect(await harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => s })).toBe(true);
    expect(s.kall).toEqual(['customers:x@example.com', 'subscriptions:cus_a']);
  });

  it('uten rad og uten Stripe-historikk: ny kunde, får prøven', async () => {
    expect(await harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripeMed({}) })).toBe(false);
  });

  it('uten e-post kan ingen Stripe-kunde slås opp: ny kunde', async () => {
    const stripe = vi.fn(() => stripeMed({ cus_a: 1 }));
    expect(await harHattTilgangFor({ subscription: null, email: null, stripe })).toBe(false);
    expect(stripe).not.toHaveBeenCalled();
  });

  it('kaster Stripe-klienten (nøkkel mangler), er prøven default — som i checkout', async () => {
    expect(
      await harHattTilgangFor({
        subscription: null,
        email: 'x@example.com',
        stripe: () => {
          throw new Error('STRIPE_SECRET_KEY mangler');
        }
      })
    ).toBe(false);
  });
});
