// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { Header } from '../Header';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Toppen for en som IKKE er logget inn. Den hadde ingen synlig vei til
 * innlogging (bare et umerket personikon til /profile), og logoen pekte på «/»
 * — som i appen er en full sidelasting tilbake dit brukeren alt står.
 */

const tilstand = {
  auth: { user: null as { id: string } | null, loading: false },
  native: false,
  pathname: '/',
  betaling: { data: undefined as unknown, isLoading: false }
};

vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: () => tilstand.auth }));
vi.mock('@/lib/hooks/useIsNative', () => ({ useIsNative: () => tilstand.native }));
vi.mock('@/lib/hooks/useBilling', () => ({ useBillingStatus: () => tilstand.betaling }));
vi.mock('next/navigation', () => ({ usePathname: () => tilstand.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

function tegn(sprak: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <Header />
    </NextIntlClientProvider>
  );
}

const href = (navn: string | RegExp) => screen.getByRole('link', { name: navn }).getAttribute('href');
const logo = () => screen.getByRole('link', { name: /Mycelet/ }).getAttribute('href');

beforeEach(() => {
  tilstand.auth = { user: null, loading: false };
  tilstand.native = false;
  tilstand.pathname = '/';
  tilstand.betaling = { data: undefined, isLoading: false };
});

afterEach(cleanup);

describe('Header — utlogget', () => {
  it('viser «Logg inn», med veien tilbake til siden brukeren står på', () => {
    tilstand.pathname = '/species/12';
    tegn();
    expect(href('Logg inn')).toBe('/auth/login?next=%2Fspecies%2F12');
    // Personikonet står som før.
    expect(href('Profil')).toBe('/profile');
  });

  it('på nett peker logoen fortsatt på «/» — landingssiden', () => {
    tilstand.pathname = '/soppforhold';
    tegn();
    expect(logo()).toBe('/');
    expect(href('Logg inn')).toBe('/auth/login?next=%2Fsoppforhold');
  });

  it('i appen peker logoen på /soppforhold, og innloggingen derfra lander på hjem', () => {
    tilstand.native = true;
    tilstand.pathname = '/soppforhold';
    tegn();
    expect(logo()).toBe('/soppforhold');
    expect(href('Logg inn')).toBe('/auth/login');
  });

  it('svensk: «Logga in»', () => {
    tegn('sv');
    expect(href('Logga in')).toBe('/auth/login');
  });

  it('viser ikke plan-merket — det er for innloggede', () => {
    tegn();
    expect(screen.queryByText('Gratis')).toBe(null);
    expect(screen.queryByText('Prøv gratis')).toBe(null);
  });
});

describe('Header — innlogging ukjent eller innlogget', () => {
  it('mens innloggingen er ukjent: verken «Logg inn» eller merke, og logoen på «/»', () => {
    tilstand.auth = { user: null, loading: true };
    tilstand.native = true;
    tilstand.pathname = '/soppforhold';
    tegn();
    expect(screen.queryByRole('link', { name: 'Logg inn' })).toBe(null);
    expect(logo()).toBe('/');
  });

  it('innlogget: plan-merket i stedet for «Logg inn», og logoen på «/» også i appen', () => {
    tilstand.auth = { user: { id: 'u1' }, loading: false };
    tilstand.native = true;
    tilstand.betaling = {
      data: { capabilities: { tier: 'free', status: 'inactive', paid: false, aiDailyLimit: 5 }, kanFaaProve: false },
      isLoading: false
    };
    tegn();
    expect(screen.queryByRole('link', { name: 'Logg inn' })).toBe(null);
    expect(href('Gratis')).toBe('/pricing');
    expect(logo()).toBe('/');
  });
});
