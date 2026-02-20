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

  it('resolves free when price id is unknown', () => {
    expect(resolveTierByPriceId('price_unknown')).toBe('free');
  });
});
