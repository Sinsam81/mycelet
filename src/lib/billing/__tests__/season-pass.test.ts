import { describe, expect, it } from 'vitest';
import { seasonPassEndDateIso } from '../season-pass';

describe('seasonPassEndDateIso', () => {
  it('gir ett år fra kjøpsdatoen, ikke 30. november', () => {
    const purchased = new Date('2026-10-01T09:00:00.000Z');
    expect(seasonPassEndDateIso(purchased)).toBe('2027-10-01T09:00:00.000Z');
  });

  it('gir ett år også for et kjøp tidlig i sesongen', () => {
    expect(seasonPassEndDateIso(new Date('2026-06-12T16:42:49.000Z'))).toBe('2027-06-12T16:42:49.000Z');
  });

  it('varer alltid minst 300 dager', () => {
    for (const month of ['01', '04', '08', '10', '12']) {
      const purchased = new Date(`2026-${month}-15T00:00:00.000Z`);
      const days = (Date.parse(seasonPassEndDateIso(purchased)) - purchased.getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(300);
    }
  });

  it('takler skuddårsdatoen uten å kaste', () => {
    expect(seasonPassEndDateIso(new Date('2028-02-29T12:00:00.000Z'))).toBe('2029-03-01T12:00:00.000Z');
  });
});
