import { describe, expect, it } from 'vitest';
import { STATUS_LABEL_KEYS, TIER_LABEL_KEYS, statusLabel, tierLabel } from '../labels';
import type { BillingStatus } from '../plans';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Profilsiden skrev tidligere ut råverdien fra databasen: «Season pass ·
 * past_due». Nå går begge sider gjennom de samme nøklene, og de nøklene må
 * finnes på begge språk — ellers bytter vi bare én stygg tekst mot en
 * manglende.
 */
const nbPricing = nb.Pricing as Record<string, string>;
const svPricing = sv.Pricing as Record<string, string>;

/** Oppslag rett i det norske katalogen — samme jobb som next-intl gjør. */
const tNb = (key: string) => nbPricing[key];

describe('etiketter for abonnement', () => {
  it('oversetter statusen brukeren faktisk trenger å forstå', () => {
    expect(statusLabel('past_due', tNb)).toBe('Forfalt betaling');
    expect(statusLabel('active', tNb)).toBe('Aktiv');
    expect(statusLabel('canceled', tNb)).toBe('Avsluttet');
    // Ingen råverdi skal slippe gjennom.
    expect(statusLabel('past_due', tNb)).not.toContain('_');
  });

  it('oversetter nivået', () => {
    expect(tierLabel('season_pass', tNb)).toBe('Sesongpass');
    expect(tierLabel('free', tNb)).toBe('Gratis');
    expect(tierLabel('season_pass', tNb)).not.toContain('_');
  });

  it('har tekst på både norsk og svensk for hver nøkkel', () => {
    for (const key of [...Object.values(TIER_LABEL_KEYS), ...Object.values(STATUS_LABEL_KEYS)]) {
      expect(nbPricing[key], `nb.json mangler Pricing.${key}`).toBeTruthy();
      expect(svPricing[key], `sv.json mangler Pricing.${key}`).toBeTruthy();
    }
  });

  it('dekker alle statusverdiene typen tillater', () => {
    const alle: BillingStatus[] = [
      'inactive',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired'
    ];
    for (const status of alle) {
      expect(STATUS_LABEL_KEYS[status], `mangler nøkkel for ${status}`).toBeTruthy();
    }
  });

  it('viser råverdien framfor å kaste hvis Stripe finner på en ny status', () => {
    expect(statusLabel('paused', tNb)).toBe('paused');
    expect(statusLabel(null, tNb)).toBe('');
  });
});
