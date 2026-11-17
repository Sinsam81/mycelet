// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { fornyelsesTekst, forsteBelastningsTekst } from '@/lib/billing/fornyelse';

/**
 * Prissiden — det kortene lover før kjøpet: punktet om lovende områder (følger
 * sesongen, sesongtekst.ts) og datolinja under prisen (Stripe på nett, Apples
 * frist i appen).
 *
 * Datoen er LÅST før noe lastes (bare Date fakes; tidtakere og løfter går som
 * vanlig), så både punktet og datoene er de samme hver gang testen kjøres.
 */
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
});

const tilstand = vi.hoisted(() => ({
  /** Står siden i iOS-skallet? Styrer useIsNative, og dermed NativeOnly/NonNativeOnly. */
  native: false,
  /** App Store-tilbudene skallet får fra RevenueCat. */
  tilbud: [] as unknown[],
  /** Svaret fra /api/billing/status: en ny gratisbruker som får gratisuka. */
  status: {
    subscription: null,
    capabilities: { tier: 'free', status: 'inactive', paid: false, aiDailyLimit: 5 },
    kanFaaProve: true
  } as Record<string, unknown>
}));

vi.mock('@/lib/hooks/useIsNative', () => ({ useIsNative: () => tilstand.native }));
vi.mock('@/lib/native/purchases', () => ({
  isIapAvailable: () => tilstand.native,
  configurePurchases: vi.fn(async () => true),
  getIapOffers: vi.fn(async () => tilstand.tilbud),
  purchaseIapOffer: vi.fn(),
  restoreIapPurchases: vi.fn()
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } } }) } })
}));
// Toppmeny, bunnmeny og bruksmåling har egne tester og egne avhengigheter.
vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));
vi.mock('@/components/bruk/RegistrerBruksdag', () => ({ RegistrerBruksdag: () => null }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>
}));

const { default: PricingPage } = await import('../page');

const STATUS_GRATIS = tilstand.status;

async function rendrer(locale: 'nb' | 'sv' = 'nb') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale={locale} messages={locale === 'sv' ? sv : nb} timeZone="Europe/Oslo">
        <PricingPage />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  // Statuskortet kommer når /api/billing/status har svart — først da vet
  // kortene om kunden kan kjøpe, og om gratisuka gjelder.
  await screen.findByText((locale === 'sv' ? sv : nb).Pricing.yourPlan);
}

/** Planens kort, slik det står på siden. */
function kort(plan: 'premium' | 'season_pass'): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-plan="${plan}"]`);
  if (!el) throw new Error(`fant ikke kortet for ${plan}`);
  return el;
}

/** Punktene i kortets liste. */
function punkter(plan: 'premium' | 'season_pass'): string[] {
  return Array.from(kort(plan).querySelectorAll('li')).map((li) => (li.textContent ?? '').trim());
}

const fyll = (mal: string, verdier: Record<string, string | number>) =>
  Object.entries(verdier).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), mal);

/** Et App Store-tilbud slik getIapOffers gir det (RevenueCat). */
function tilbud(plan: 'premium' | 'season_pass', proveDager: number | null, harProve = true) {
  return {
    plan,
    productId: `mycelet.${plan}`,
    priceString: plan === 'premium' ? 'kr 99,00' : 'kr 249,00',
    price: plan === 'premium' ? 99 : 249,
    currencyCode: 'NOK',
    packageIdentifier: plan === 'premium' ? '$rc_monthly' : '$rc_annual',
    harProve,
    proveDager: harProve ? proveDager : null,
    rcPackage: { identifier: plan, packageType: 'CUSTOM', product: { identifier: `mycelet.${plan}`, priceString: '' } }
  };
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  tilstand.native = false;
  tilstand.tilbud = [];
  tilstand.status = STATUS_GRATIS;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => tilstand.status }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('prissiden — Premium-punktet om lovende områder følger sesongen', () => {
  it.each([
    ['september', '2026-09-15T10:00:00Z', 'premiumFeature2'],
    ['november', '2026-11-16T10:00:00Z', 'premiumFeature2Betinget'],
    ['januar', '2027-01-15T10:00:00Z', 'premiumFeature2Betinget'],
    ['mai', '2027-05-15T10:00:00Z', 'premiumFeature2Betinget'],
    ['juni', '2027-06-15T10:00:00Z', 'premiumFeature2Betinget'],
    ['juli', '2027-07-15T10:00:00Z', 'premiumFeature2']
  ] as const)('%s (nb og sv)', async (_maaned, naa, nokkel) => {
    vi.setSystemTime(new Date(naa));
    for (const [locale, katalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      await rendrer(locale);
      expect(punkter('premium')).toEqual([
        katalog.Pricing.premiumFeature1,
        katalog.Pricing[nokkel],
        katalog.Pricing.premiumFeature3
      ]);
      cleanup();
    }
  });
});

/**
 * Datolinja på kortet før kjøpet. Stripe belaster ved prøveslutt, så på nett
 * er «Første belastning {prøveslutt}» riktig. Apple forsøker trekket i løpet
 * av det siste døgnet FØR prøven slutter (kanal.ts / avslutningsfrist): i
 * appen sier linja det samme som statuskortet sier etter kjøpet — «Prøven
 * varer til … – avslutt senest …».
 */
describe('prissiden — datolinja før kjøpet: Stripe på nett, Apples frist i appen', () => {
  it('nett: «Første belastning {prøveslutt}» — uendret, uten 24-timersfrist', async () => {
    await rendrer();
    for (const plan of ['season_pass', 'premium'] as const) {
      const linje = fyll(nb.Pricing.renewsOnEtterProve, {
        forsteBelastning: forsteBelastningsTekst(7, 'nb'),
        dato: fornyelsesTekst(plan, 'nb', 7)
      });
      expect(kort(plan).textContent).toContain(linje);
      expect(kort(plan).textContent).not.toMatch(/24 timer/);
    }
  });

  it('app med sju gratisdager: «Prøven varer til … – avslutt senest 24 timer før», aldri «Første belastning {prøveslutt}»', async () => {
    tilstand.native = true;
    tilstand.tilbud = [tilbud('season_pass', 7), tilbud('premium', 7)];
    await rendrer();
    for (const plan of ['season_pass', 'premium'] as const) {
      const linje = fyll(nb.Pricing.renewsOnEtterProveApp, {
        forsteBelastning: forsteBelastningsTekst(7, 'nb'),
        dato: fornyelsesTekst(plan, 'nb', 7)
      });
      expect(await screen.findByText(linje)).toBeTruthy();
      expect(linje).toContain(`Prøven varer til ${forsteBelastningsTekst(7, 'nb')} – avslutt senest 24 timer før`);
      expect(kort(plan).textContent).not.toContain('Første belastning');
    }
  });

  it('app med prøve av ukjent lengde: ingen dato, men samme frist', async () => {
    tilstand.native = true;
    tilstand.tilbud = [tilbud('season_pass', null), tilbud('premium', null)];
    await rendrer();
    expect(await screen.findAllByText(nb.Pricing.renewsOnProveUkjentLengdeApp)).toHaveLength(2);
    expect(nb.Pricing.renewsOnProveUkjentLengdeApp).toMatch(/^Avslutt senest 24 timer før prøven slutter/);
    expect(screen.queryByText(nb.Pricing.renewsOnProveUkjentLengde)).toBeNull();
  });

  it('app uten introtilbud: «Fornyes {dato}» som før — det finnes ingen prøve å avslutte', async () => {
    tilstand.native = true;
    tilstand.tilbud = [tilbud('season_pass', null, false), tilbud('premium', null, false)];
    await rendrer();
    const linje = fyll(nb.Pricing.renewsOn, { dato: fornyelsesTekst('season_pass', 'nb') });
    expect(await screen.findByText(linje)).toBeTruthy();
    expect(kort('season_pass').textContent).not.toMatch(/24 timer|Prøven varer/);
  });

  it('svensk i appen: «Provperioden gäller till … – avsluta senast 24 timmar innan»', async () => {
    tilstand.native = true;
    tilstand.tilbud = [tilbud('season_pass', 7), tilbud('premium', 7)];
    await rendrer('sv');
    const linje = fyll(sv.Pricing.renewsOnEtterProveApp, {
      forsteBelastning: forsteBelastningsTekst(7, 'sv'),
      dato: fornyelsesTekst('season_pass', 'sv', 7)
    });
    expect(await screen.findByText(linje)).toBeTruthy();
    expect(linje).toContain(`Provperioden gäller till ${forsteBelastningsTekst(7, 'sv')} – avsluta senast 24 timmar innan`);
    expect(kort('season_pass').textContent).not.toContain('Första debiteringen');
  });

  it('app-linja følger statuskortets ordlyd etter kjøpet', () => {
    // periodTrialCancelBy: «Prøven varer til {date} – avslutt senest {deadline} for å unngå belastning».
    expect(nb.Pricing.periodTrialCancelBy.startsWith('Prøven varer til {date} – avslutt senest')).toBe(true);
    expect(nb.Pricing.renewsOnEtterProveApp.startsWith('Prøven varer til {forsteBelastning} – avslutt senest')).toBe(true);
    expect(sv.Pricing.periodTrialCancelBy.startsWith('Provperioden gäller till {date} – avsluta senast')).toBe(true);
    expect(sv.Pricing.renewsOnEtterProveApp.startsWith('Provperioden gäller till {forsteBelastning} – avsluta senast')).toBe(true);
    for (const katalog of [nb, sv]) {
      expect(katalog.Pricing.renewsOnEtterProveApp).toMatch(/for å unngå belastning|för att undvika debitering/);
      expect(katalog.Pricing.renewsOnProveUkjentLengdeApp).toMatch(/for å unngå belastning|för att undvika debitering/);
    }
  });
});
