import { describe, expect, it } from 'vitest';
import { hasPaidAccess, type BillingStatus, type BillingTier } from '@/lib/billing/plans';
import { betalingskilde, erInternKonto, klassifiserAbonnement, tellAbonnement, type AbonnementRad } from '../abonnement';

/**
 * Referansen er produksjonsbildet 15. september 2026, der /admin viste
 * «Betalende: 8» og fasit var én. Feilen testene vokter mot er den samme som i
 * dagsrapporten: et for høyt tall. Et for lavt får deg til å jobbe hardere, et
 * for høyt får deg til å slutte.
 */

const NAA = new Date('2026-09-15T08:00:00Z');

function rad(over: Partial<AbonnementRad> = {}): AbonnementRad {
  return {
    user_id: `u-${Math.random().toString(36).slice(2, 8)}`,
    tier: 'premium',
    status: 'active',
    current_period_end: '2026-10-15T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    metadata: { provider: 'stripe' },
    ...over
  };
}

const PRODUKSJON_15_SEP: AbonnementRad[] = [
  // Tre løpende prøver.
  rad({ status: 'trialing', current_period_end: '2026-09-19T00:00:00Z', metadata: { provider: 'stripe', prove_start: '2026-09-12T00:00:00Z' } }),
  rad({ status: 'trialing', current_period_end: '2026-09-20T00:00:00Z', metadata: { provider: 'revenuecat', prove_start: '2026-09-13T00:00:00Z' } }),
  rad({ status: 'trialing', current_period_end: '2026-09-21T00:00:00Z', metadata: { provider: 'revenuecat' } }),
  // Tre gavepass: grunnleggerpasset, et gavepass og Apples demokonto.
  rad({ tier: 'season_pass', current_period_end: '2036-06-12T00:00:00Z', metadata: { source: 'manual_grant' } }),
  rad({ tier: 'season_pass', current_period_end: '2027-06-04T00:00:00Z', metadata: { source: 'manual_grant' } }),
  rad({ current_period_end: '2028-01-01T00:00:00Z', metadata: { source: 'manual_grant', note: 'App Review' } }),
  // Ekte App Store-kunde: sagt opp, betalt til 30. september.
  rad({ cancel_at_period_end: true, current_period_end: '2026-09-30T00:00:00Z', metadata: { provider: 'revenuecat' } }),
  // Stripe-rad som sier active, men perioden gikk ut 2. juli.
  rad({ current_period_end: '2026-07-02T00:00:00Z', metadata: { provider: 'stripe' } })
];

describe('tellAbonnement — produksjonsbildet 15. september 2026', () => {
  it('den gamle admin-regelen (tier ≠ free, active eller trialing) ga 8 på disse radene', () => {
    const gammel = PRODUKSJON_15_SEP.filter((r) => r.tier !== 'free' && (r.status === 'active' || r.status === 'trialing'));
    expect(gammel).toHaveLength(8);
  });

  it('én betalende, tre prøver, tre gratis tildelt, én utløpt — og åtte rader', () => {
    expect(tellAbonnement(PRODUKSJON_15_SEP, NAA)).toEqual({
      rader: 8,
      betalende: 1,
      betalendePerButikk: { stripe: 0, revenuecat: 1 },
      prover: 3,
      gratisTildelt: 3,
      utloptMenMarkertAktiv: 1
    });
  });

  it('hver rad havner i nøyaktig én bøtte', () => {
    const rader = [...PRODUKSJON_15_SEP, rad({ status: 'canceled' }), rad({ tier: 'free' })];
    const t = tellAbonnement(rader, NAA);
    const inaktive = rader.filter((r) => klassifiserAbonnement(r, NAA) === 'inaktiv').length;
    expect(inaktive).toBe(2);
    expect(t.betalende + t.prover + t.gratisTildelt + t.utloptMenMarkertAktiv + inaktive).toBe(t.rader);
  });
});

describe('klassifiserAbonnement', () => {
  it('en oppsagt kunde er betalende til perioden er ute, deretter utløpt', () => {
    const r = rad({ cancel_at_period_end: true, current_period_end: '2026-09-30T00:00:00Z', metadata: { provider: 'revenuecat' } });
    expect(klassifiserAbonnement(r, NAA)).toBe('betalende');
    expect(klassifiserAbonnement(r, new Date('2026-10-01T00:00:00Z'))).toBe('utlopt');
  });

  it('en rad uten sluttdato løper', () => {
    expect(klassifiserAbonnement(rad({ current_period_end: null }), NAA)).toBe('betalende');
  });

  it('avsluttede rader og gratisplanen er inaktive', () => {
    for (const status of ['canceled', 'past_due', 'unpaid', 'incomplete', 'inactive']) {
      expect(klassifiserAbonnement(rad({ status }), NAA)).toBe('inaktiv');
    }
    expect(klassifiserAbonnement(rad({ tier: 'free' }), NAA)).toBe('inaktiv');
  });

  it('en utløpt prøve er utløpt, ikke en prøve', () => {
    expect(klassifiserAbonnement(rad({ status: 'trialing', current_period_end: '2026-09-14T00:00:00Z' }), NAA)).toBe('utlopt');
  });

  it('gavepass er gratis tildelt i alle formene webhookene og SQL-editoren skriver', () => {
    for (const metadata of [
      { source: 'manual_grant' },
      // Stripe-webhooken når passet er gulvet (stripe-webhook-decision.ts).
      { provider: 'manual_grant', source: 'manual_grant' },
      // I tvil: merket manual_grant vinner over en provider.
      { provider: 'stripe', source: 'manual_grant' },
      {},
      null
    ]) {
      expect(klassifiserAbonnement(rad({ metadata }), NAA)).toBe('gratisTildelt');
    }
  });

  it('et gavepass med status trialing er fortsatt gratis tildelt, ikke en prøve', () => {
    expect(klassifiserAbonnement(rad({ status: 'trialing', metadata: { source: 'manual_grant' } }), NAA)).toBe('gratisTildelt');
  });

  it('et kjøp som har overtatt et gavepass er et ekte kjøp', () => {
    const r = rad({ metadata: { provider: 'revenuecat', manual_grant: { tier: 'season_pass', status: 'active' } } });
    expect(klassifiserAbonnement(r, NAA)).toBe('betalende');
  });

  it('interne kontoer er aldri betalende eller prøve, heller ikke med ekte App Store-kjøp', () => {
    const interne = new Set(['qa']);
    const kjop = rad({ user_id: 'qa', metadata: { provider: 'revenuecat', rc_environment: 'PRODUCTION' } });
    const prove = rad({ user_id: 'qa', status: 'trialing', metadata: { provider: 'revenuecat' } });
    expect(betalingskilde(kjop, interne)).toBe('manuell');
    expect(klassifiserAbonnement(kjop, NAA, interne)).toBe('gratisTildelt');
    expect(klassifiserAbonnement(prove, NAA, interne)).toBe('gratisTildelt');
  });
});

describe('rapportering, ikke tilgang', () => {
  it('prøver og gavepass gir fortsatt Premium — hasPaidAccess er uendret', () => {
    const langt = '2099-01-01T00:00:00Z';
    for (const r of [
      rad({ status: 'trialing', current_period_end: langt }),
      rad({ tier: 'season_pass', current_period_end: langt, metadata: { source: 'manual_grant' } })
    ]) {
      expect(klassifiserAbonnement(r, NAA)).not.toBe('betalende');
      expect(hasPaidAccess(r.status as BillingStatus, r.tier as BillingTier, r.current_period_end)).toBe(true);
    }
  });
});

describe('erInternKonto', () => {
  it('kjenner igjen eget domene uansett store bokstaver', () => {
    expect(erInternKonto('qa@mycelet.com')).toBe(true);
    expect(erInternKonto('Post@Mycelet.COM')).toBe(true);
  });

  it('slipper ikke gjennom lookalike-domener eller manglende e-post', () => {
    expect(erInternKonto('x@notmycelet.com')).toBe(false);
    expect(erInternKonto('x@mycelet.com.example.no')).toBe(false);
    expect(erInternKonto(null)).toBe(false);
    expect(erInternKonto(undefined)).toBe(false);
  });
});
