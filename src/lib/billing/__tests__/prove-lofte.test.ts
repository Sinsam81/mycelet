import { describe, expect, it } from 'vitest';
import { BILLING_PLANS, STRIPE_PROVEDAGER } from '../plans';
import {
  PROVE_LOFTE_INGEN,
  PROVE_LOFTE_UKJENT,
  PROVE_LOFTE_WEB,
  harProveLofte,
  lofteFraTilbud,
  planLofte
} from '../prove-lofte';

/**
 * Arket leder med sesongpasset og viser Premium som «heller måned for
 * måned». Hver plans gratisuke og pris skal komme fra DENS tilbud i
 * butikken — aldri fra den andre, uansett hvilken som mangler.
 */
const premium = { plan: 'premium', harProve: true, proveDager: 7, priceString: 'kr 99,00' };
const premiumUtenProve = { plan: 'premium', harProve: false, proveDager: null, priceString: 'kr 99,00' };
const pass = { plan: 'season_pass', harProve: true, proveDager: 7, priceString: 'kr 249,00' };
const passUtenProve = { plan: 'season_pass', harProve: false, proveDager: null, priceString: 'kr 249,00' };

describe('lofteFraTilbud', () => {
  it('leser gratisuke, lengde og pris for hver plan fra dens eget tilbud', () => {
    expect(lofteFraTilbud([premium, pass])).toEqual({
      kjent: true,
      season_pass: { plan: 'season_pass', harProve: true, proveDager: 7, pris: 'kr 249,00' },
      premium: { plan: 'premium', harProve: true, proveDager: 7, pris: 'kr 99,00' }
    });
  });

  it('passet uten gratisuke gir pris uten løfte — selv om Premium har en (det som er bevist i App Store i dag)', () => {
    const lofte = lofteFraTilbud([premium, passUtenProve]);
    expect(planLofte(lofte, 'season_pass')).toEqual({ plan: 'season_pass', harProve: false, proveDager: null, pris: 'kr 249,00' });
    expect(harProveLofte(lofte)).toBe(false);
    expect(harProveLofte(lofte, 'premium')).toBe(true);
  });

  it('en plan som mangler i butikken står som null, og den andre svarer aldri for den', () => {
    const barePremium = lofteFraTilbud([premiumUtenProve]);
    expect(planLofte(barePremium, 'season_pass')).toBeNull();
    expect(planLofte(barePremium, 'premium')?.pris).toBe('kr 99,00');
    expect(harProveLofte(barePremium)).toBe(false);

    const barePass = lofteFraTilbud([pass]);
    expect(planLofte(barePass, 'premium')).toBeNull();
    expect(harProveLofte(barePass)).toBe(true);
  });

  it('uten noe tilbud loves ingenting', () => {
    expect(lofteFraTilbud([])).toBe(PROVE_LOFTE_INGEN);
    expect(lofteFraTilbud([{ plan: 'ukjent', harProve: true, proveDager: 7, priceString: 'kr 1,00' }])).toBe(PROVE_LOFTE_INGEN);
  });
});

describe('harProveLofte', () => {
  it('sant bare når butikken har svart og gratisuka finnes på planen', () => {
    expect(harProveLofte(PROVE_LOFTE_WEB)).toBe(true);
    expect(harProveLofte(PROVE_LOFTE_WEB, 'premium')).toBe(true);
    expect(harProveLofte(PROVE_LOFTE_UKJENT)).toBe(false);
    expect(harProveLofte(PROVE_LOFTE_INGEN)).toBe(false);
    expect(harProveLofte(lofteFraTilbud([passUtenProve, premiumUtenProve]))).toBe(false);
  });

  it('nett lover Stripe-prøveperioden på begge planene, med Stripe-prisene — én kilde', () => {
    expect(PROVE_LOFTE_WEB).toEqual({
      kjent: true,
      season_pass: { plan: 'season_pass', harProve: true, proveDager: STRIPE_PROVEDAGER, pris: `${BILLING_PLANS.season_pass.yearlyNok} kr` },
      premium: { plan: 'premium', harProve: true, proveDager: STRIPE_PROVEDAGER, pris: `${BILLING_PLANS.premium.monthlyNok} kr` }
    });
    expect(planLofte(PROVE_LOFTE_UKJENT, 'season_pass')).toBeNull();
  });
});
