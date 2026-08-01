import { describe, it, expect } from 'vitest';
import { planCheckoutWrite } from '../checkout-write';
import { hasPaidAccess } from '../plans';

const base = {
  userId: 'bruker-1',
  plan: 'season_pass' as const,
  customerId: 'cus_123',
  priceId: 'price_season',
  sessionId: 'cs_test_1'
};

describe('mekanismen bak feilen', () => {
  const inAYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  it('en aktiv plan gir tilgang', () => {
    expect(hasPaidAccess('active', 'premium', inAYear)).toBe(true);
  });

  it('«incomplete» fjerner tilgangen umiddelbart', () => {
    // Derfor var den ubetingede skrivingen så skadelig: ett felt, og kunden
    // står utenfor — midt i en betaling de ikke har fullført ennå.
    expect(hasPaidAccess('incomplete', 'season_pass', inAYear)).toBe(false);
    expect(hasPaidAccess('incomplete', 'premium', inAYear)).toBe(false);
  });
});

describe('planCheckoutWrite — bruker uten betalt plan', () => {
  const write = planCheckoutWrite({ ...base, hasPaidPlan: false });

  it('skriver plassholderraden', () => {
    expect(write.kind).toBe('placeholder-row');
  });

  it('setter tier, status og pris', () => {
    if (write.kind !== 'placeholder-row') throw new Error('feil gren');
    expect(write.values).toMatchObject({
      user_id: 'bruker-1',
      tier: 'season_pass',
      status: 'incomplete',
      stripe_customer_id: 'cus_123',
      stripe_price_id: 'price_season'
    });
  });
});

describe('planCheckoutWrite — bruker som allerede betaler', () => {
  const write = planCheckoutWrite({ ...base, hasPaidPlan: true });

  it('oppdaterer bare kundekoblingen', () => {
    expect(write.kind).toBe('link-customer-only');
  });

  it('rører ikke status — dette er hele poenget', () => {
    expect(Object.keys(write.values)).toEqual(['stripe_customer_id']);
    expect(write.values).not.toHaveProperty('status');
  });

  it('rører ikke tier', () => {
    expect(write.values).not.toHaveProperty('tier');
  });

  it('rører ikke metadata — provider-flagget må overleve', () => {
    // metadata.provider skiller Stripe- fra RevenueCat-abonnement i webhooken.
    // Skrives det over her, kan en Stripe-hendelse overkjøre et aktivt
    // Apple-abonnement.
    expect(write.values).not.toHaveProperty('metadata');
  });

  it('treffer riktig rad', () => {
    if (write.kind !== 'link-customer-only') throw new Error('feil gren');
    expect(write.userId).toBe('bruker-1');
  });
});

describe('alle planbytter, begge veier', () => {
  // Bytte i begge retninger, for en som betaler og en som ikke gjør det.
  it.each([
    ['premium', true],
    ['season_pass', true],
    ['premium', false],
    ['season_pass', false]
  ] as const)('plan=%s hasPaidPlan=%s forringer aldri en betalt plan', (plan, hasPaidPlan) => {
    const write = planCheckoutWrite({ ...base, plan, hasPaidPlan });
    if (hasPaidPlan) {
      // Ingenting som kan ta tilgang fra noen.
      expect(write.values).not.toHaveProperty('status');
      expect(write.values).not.toHaveProperty('tier');
    } else {
      // Uten betalt plan er det ingenting å miste.
      expect(write.kind).toBe('placeholder-row');
    }
  });
});
