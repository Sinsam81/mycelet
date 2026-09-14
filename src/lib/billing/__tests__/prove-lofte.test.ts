import { describe, expect, it } from 'vitest';
import { STRIPE_PROVEDAGER } from '../plans';
import { PROVE_LOFTE_INGEN, PROVE_LOFTE_UKJENT, PROVE_LOFTE_WEB, harProveLofte, lofteFraTilbud } from '../prove-lofte';

/**
 * Arket selger Premium. Løftet om gratisuke og prisen det viser skal komme
 * fra Premium-tilbudet i butikken — aldri fra sesongpasset, uansett om det
 * har en gratisuke eller er det eneste tilbudet.
 */
const premium = { plan: 'premium', harProve: true, proveDager: 7, priceString: 'kr 79,00' };
const premiumUtenProve = { plan: 'premium', harProve: false, proveDager: null, priceString: 'kr 79,00' };
const sesongpassMedProve = { plan: 'season_pass', harProve: true, proveDager: 14, priceString: 'kr 249,00' };

describe('lofteFraTilbud', () => {
  it('leser gratisuke, lengde og pris fra Premium-tilbudet', () => {
    expect(lofteFraTilbud([sesongpassMedProve, premium])).toEqual({ kjent: true, harProve: true, proveDager: 7, pris: 'kr 79,00' });
  });

  it('Premium uten gratisuke gir pris uten løfte — selv om sesongpasset har en', () => {
    expect(lofteFraTilbud([premiumUtenProve, sesongpassMedProve])).toEqual({ kjent: true, harProve: false, proveDager: null, pris: 'kr 79,00' });
  });

  it('uten Premium i tilbudet loves ingenting, og sesongpasset brukes aldri som reserve', () => {
    expect(lofteFraTilbud([sesongpassMedProve])).toBe(PROVE_LOFTE_INGEN);
    expect(lofteFraTilbud([])).toBe(PROVE_LOFTE_INGEN);
  });
});

describe('harProveLofte', () => {
  it('sant bare når butikken har svart og gratisuka finnes', () => {
    expect(harProveLofte(PROVE_LOFTE_WEB)).toBe(true);
    expect(harProveLofte(PROVE_LOFTE_UKJENT)).toBe(false);
    expect(harProveLofte(PROVE_LOFTE_INGEN)).toBe(false);
    expect(harProveLofte(lofteFraTilbud([premiumUtenProve]))).toBe(false);
  });

  it('nett lover Stripe-prøveperioden fra én kilde', () => {
    expect(PROVE_LOFTE_WEB).toEqual({ kjent: true, harProve: true, proveDager: STRIPE_PROVEDAGER, pris: null });
  });
});
