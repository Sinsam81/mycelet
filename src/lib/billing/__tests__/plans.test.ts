import { describe, expect, it } from 'vitest';
import { hasPaidAccess, resolveTierByPriceId } from '../plans';

describe('billing plans', () => {
  it('returns false for free tier', () => {
    expect(hasPaidAccess('active', 'free', null)).toBe(false);
  });

  it('returns true for active premium before period end', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    expect(hasPaidAccess('active', 'premium', future)).toBe(true);
  });

  it('returns false for expired period', () => {
    const past = new Date(Date.now() - 1000 * 60).toISOString();
    expect(hasPaidAccess('active', 'season_pass', past)).toBe(false);
  });

  // Oppslaget er bare et oppslag: kjenner vi ikke pris-ID-en, kjenner vi ikke
  // planen. Det betyr IKKE at kunden skal settes til gratis — den avgjørelsen
  // ligger i decideStripeWrite, som beholder plannavnet raden allerede har når
  // et løpende abonnement kommer med en ukjent pris (se
  // stripe-webhook-decision.test.ts, «ukjent pris-ID»).
  it('resolves free when price id is unknown', () => {
    expect(resolveTierByPriceId('price_unknown')).toBe('free');
  });
});
