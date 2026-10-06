import { describe, expect, it } from 'vitest';
import { perMaanedAvAarspris, seasonPriceComesFromStore, showsStorePrices } from '../store-pricing';

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

describe('perMaanedAvAarspris', () => {
  // Intl setter hardt mellomrom (U+00A0) mellom tall og valuta — riktig på skjerm, usynlig i en test.
  const vanlig = (s: string | null) => s?.replace(/ /g, ' ') ?? null;

  it('deler butikkens årspris på tolv i kontoens valuta, avrundet til hele kroner', () => {
    expect(vanlig(perMaanedAvAarspris(249, 'NOK', 'nb'))).toBe('21 kr');
    expect(vanlig(perMaanedAvAarspris(279, 'SEK', 'sv'))).toBe('23 kr');
  });

  it('en fremmed valuta beholder koden, så en svensk konto aldri leser SEK som norske kroner', () => {
    expect(vanlig(perMaanedAvAarspris(279, 'SEK', 'nb'))).toBe('23 SEK');
    expect(vanlig(perMaanedAvAarspris(249, 'NOK', 'sv'))).toBe('21 Nkr');
  });

  it('null uten et brukbart tall eller en gyldig valutakode — da står kortet uten beløp', () => {
    expect(perMaanedAvAarspris(null, 'NOK', 'nb')).toBeNull();
    expect(perMaanedAvAarspris(0, 'NOK', 'nb')).toBeNull();
    expect(perMaanedAvAarspris(249, null, 'nb')).toBeNull();
    expect(perMaanedAvAarspris(249, 'ikke-en-valuta', 'nb')).toBeNull();
  });
});
