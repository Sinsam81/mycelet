import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCALE_COOKIE } from '@/i18n/config';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * §8 i personvernerklæringen er den delen som skal være uttømmende: her står
 * det hva som faktisk lagres på brukerens enhet. Den listet tre cookies —
 * Supabase-sesjon, Stripe og Google Analytics — mens nettleseren i tillegg
 * fikk MYCELET_LOCALE, og mens Stripe.js aldri lastes fra vårt domene i det
 * hele tatt (betaling skjer på checkout.stripe.com).
 *
 * Testene under kobler teksten til koden, så neste lagring som legges til
 * ikke kan gli inn uten at erklæringen følger med.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const ALL_SOURCE = sourceFiles(SRC)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

const cookieSection = (catalog: typeof nb) => {
  const p = catalog.Personvern as unknown as Record<string, string>;
  return Object.entries(p)
    .filter(([key]) => key.startsWith('cookies'))
    .map(([, value]) => value)
    .join(' ');
};

describe('cookie-erklæringen (§8)', () => {
  it('navngir språk-cookien appen faktisk setter', () => {
    // Settes i src/lib/supabase/middleware.ts og src/i18n/actions.ts.
    expect(LOCALE_COOKIE).toBe('MYCELET_LOCALE');
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      expect(cookieSection(catalog), locale).toContain(LOCALE_COOKIE);
    }
  });

  it('lover ikke en Stripe-cookie på vårt eget domene', () => {
    // Stripe.js lastes ikke noe sted i src/ — checkout-ruten lager en
    // Checkout-sesjon på serveren og redirecter til session.url.
    expect(ALL_SOURCE).not.toMatch(/loadStripe|@stripe\/stripe-js|js\.stripe\.com/);
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      expect(cookieSection(catalog), locale).toContain('checkout.stripe.com');
    }
  });

  it('nevner at appen også lagrer valg i nettleserens lokale lagring', () => {
    // Alle mycelet:-nøklene under lagres med localStorage, ikke som cookies.
    expect(ALL_SOURCE).toContain('mycelet:analytics-consent-v1');
    expect(ALL_SOURCE).toContain('mycelet.offline-areas.v1');
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const localStorageText = (catalog.Personvern as unknown as Record<string, string>)
        .cookiesLocalStorage;
      expect(localStorageText, locale).toBeTruthy();
      expect(localStorageText.length, locale).toBeGreaterThan(80);
    }
  });
});
