import { describe, expect, it } from 'vitest';
import { seasonPriceComesFromStore, showsStorePrices } from '../store-pricing';

const BOTH = [{ plan: 'premium' as const }, { plan: 'season_pass' as const }];
const ONLY_PREMIUM = [{ plan: 'premium' as const }];

describe('showsStorePrices', () => {
  it('er usann på web — der er Stripe-prisen i NOK den ekte', () => {
    expect(showsStorePrices({ native: false, offers: BOTH })).toBe(false);
  });

  it('er usann i appen før tilbudene er lastet', () => {
    expect(showsStorePrices({ native: true, offers: null })).toBe(false);
    expect(showsStorePrices({ native: true, offers: [] })).toBe(false);
  });

  it('er sann så snart App Store-priser vises', () => {
    expect(showsStorePrices({ native: true, offers: ONLY_PREMIUM })).toBe(true);
  });
});

describe('seasonPriceComesFromStore', () => {
  it('er usann når bare Premium har et butikktilbud', () => {
    expect(seasonPriceComesFromStore({ native: true, offers: ONLY_PREMIUM })).toBe(false);
  });

  it('er sann når sesongpasset har et butikktilbud', () => {
    expect(seasonPriceComesFromStore({ native: true, offers: BOTH })).toBe(true);
  });

  it('er alltid usann på web', () => {
    expect(seasonPriceComesFromStore({ native: false, offers: BOTH })).toBe(false);
  });
});
