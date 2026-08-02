import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n/config';
import { alreadyOnPlanMessage, billingCopy, billingTierLabel } from '../copy';

const KEYS = [
  'unauthenticated',
  'invalidPlan',
  'missingConsent',
  'checkoutUnavailable',
  'checkoutFailed',
  'saveFailed',
  'planChangeBlocked',
  'planChangeBlockedDetails',
  'portalNoCustomer',
  'portalFailed'
] as const;

describe('billingCopy', () => {
  it('har tekst på begge språk for alle nøkler', () => {
    for (const key of KEYS) {
      for (const locale of LOCALES) {
        expect(billingCopy(key, locale).length).toBeGreaterThan(0);
      }
    }
  });

  it('gir svensk tekst til en svensk kunde midt i kjøpsflyten', () => {
    expect(billingCopy('planChangeBlocked', 'sv')).toBe('Du måste avsluta den nuvarande planen först');
    expect(billingCopy('planChangeBlockedDetails', 'sv')).toContain('prenumeration');
  });

  it('bruker aldri samme streng på nb og sv der språkene faktisk skiller seg', () => {
    for (const key of KEYS) {
      expect(billingCopy(key, 'sv')).not.toBe(billingCopy(key, 'nb'));
    }
  });

  it('kaller sesongpasset Säsongspass på svensk', () => {
    expect(billingTierLabel('season_pass', 'sv')).toBe('Säsongspass');
    expect(billingTierLabel('season_pass', 'nb')).toBe('Sesongpass');
    expect(alreadyOnPlanMessage('season_pass', 'sv')).toContain('Säsongspass');
    expect(alreadyOnPlanMessage('season_pass', 'nb')).toContain('Sesongpass');
  });
});
