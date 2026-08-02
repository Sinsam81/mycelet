import { describe, expect, it } from 'vitest';
import { reusableCheckoutUrl, type CheckoutSessionLike } from '../checkout-reuse';

const REQUEST = {
  userId: '50d3c496-8842-4dc5-8719-613e023458e9',
  plan: 'premium' as const,
  priceId: 'price_1PremiumMonthly',
  consentVersion: 'v2-2026-07-30'
};

function session(overrides: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike {
  return {
    id: 'cs_test_abc',
    status: 'open',
    mode: 'subscription',
    url: 'https://checkout.stripe.com/c/pay/cs_test_abc',
    metadata: {
      user_id: REQUEST.userId,
      tier: REQUEST.plan,
      price_id: REQUEST.priceId,
      delivery_consent_at: '2026-08-02T10:00:00.000Z',
      delivery_consent_version: REQUEST.consentVersion
    },
    ...overrides
  };
}

describe('reusableCheckoutUrl', () => {
  it('gjenbruker en åpen sesjon for nøyaktig samme kjøp', () => {
    expect(reusableCheckoutUrl(session(), REQUEST)).toBe('https://checkout.stripe.com/c/pay/cs_test_abc');
  });

  it('gjenbruker ikke en betalt sesjon', () => {
    expect(reusableCheckoutUrl(session({ status: 'complete', url: null }), REQUEST)).toBeNull();
  });

  it('gjenbruker ikke en utløpt sesjon', () => {
    expect(reusableCheckoutUrl(session({ status: 'expired' }), REQUEST)).toBeNull();
  });

  it('sender aldri kunden til en annen plan enn den de trykket på', () => {
    const other = session({ metadata: { ...session().metadata, tier: 'season_pass' } });
    expect(reusableCheckoutUrl(other, REQUEST)).toBeNull();
  });

  it('gjenbruker ikke en sesjon med en annen pris', () => {
    const other = session({ metadata: { ...session().metadata, price_id: 'price_gammel' } });
    expect(reusableCheckoutUrl(other, REQUEST)).toBeNull();
  });

  it('gjenbruker ikke en sesjon som tilhører en annen bruker', () => {
    const other = session({ metadata: { ...session().metadata, user_id: 'noen-andre' } });
    expect(reusableCheckoutUrl(other, REQUEST)).toBeNull();
  });

  it('gjenbruker ikke en sesjon med utdatert samtykketekst', () => {
    const other = session({ metadata: { ...session().metadata, delivery_consent_version: 'v1' } });
    expect(reusableCheckoutUrl(other, REQUEST)).toBeNull();
  });

  it('takler manglende sesjon og manglende url', () => {
    expect(reusableCheckoutUrl(null, REQUEST)).toBeNull();
    expect(reusableCheckoutUrl(session({ url: null }), REQUEST)).toBeNull();
    expect(reusableCheckoutUrl(session({ metadata: null }), REQUEST)).toBeNull();
  });
});
