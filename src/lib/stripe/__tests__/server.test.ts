import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stripe-klienten har en frist for hvert kall, satt ett sted.
 *
 * SDK-ens standard er 80 s per forsøk og ett nytt forsøk. Fristene sto først
 * bare på enkeltkall (Stripe-webhooken, statusruta), så alle andre arvet
 * standarden: checkout og kundeportalen, der kunden ser på en spinner, og
 * oppsigelsen i /api/me/delete. Testen bruker den ekte SDK-en (ingen kall
 * går ut — klienten bare opprettes) og leser hva den faktisk har fått, så et
 * feilstavet valg ikke kan passere stille.
 */

interface KlientInnsyn {
  getApiField(felt: string): unknown;
  getMaxNetworkRetries(): number;
}

async function lastModul() {
  vi.resetModules();
  return import('../server');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getStripeServerClient', () => {
  it('hvert kall har 10 s og ett nytt forsøk — ikke SDK-ens 80 s', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ikke_en_ekte_nokkel');
    const { getStripeServerClient, STRIPE_KLIENT_FRIST } = await lastModul();

    expect(STRIPE_KLIENT_FRIST).toEqual({ timeout: 10_000, maxNetworkRetries: 1 });

    const klient = getStripeServerClient() as unknown as KlientInnsyn;
    expect(klient.getApiField('timeout')).toBe(10_000);
    expect(klient.getMaxNetworkRetries()).toBe(1);
    // API-versjonen er låst som før — fristen skal ikke ha flyttet på den.
    expect(klient.getApiField('version')).toBe('2024-06-20');
  });

  it('samme klient gjenbrukes', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ikke_en_ekte_nokkel');
    const { getStripeServerClient } = await lastModul();
    expect(getStripeServerClient()).toBe(getStripeServerClient());
  });

  it('uten nøkkel kaster den — kallstedene som er best effort fanger det', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getStripeServerClient } = await lastModul();
    expect(() => getStripeServerClient()).toThrow('STRIPE_SECRET_KEY mangler');
  });
});
