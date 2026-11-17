// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { BottomNav } from '../BottomNav';
import nb from '../../../../messages/nb.json';

/**
 * Hjem-fanen i iOS-skallet for en som ikke er logget inn: den pekte på «/»,
 * som der er en full sidelasting via landingssiden og tilbake til /soppforhold
 * — og ingen fane lyste. Mellomvaren kjører ikke i Turbopack-dev, så dette kan
 * ikke prøves med `npm run qa`; reglene står i src/lib/nav/hjem.ts, og her
 * sjekkes at menyen faktisk bruker dem.
 */

const tilstand = {
  auth: { user: null as { id: string } | null, loading: false },
  native: false,
  pathname: '/',
  pending: false
};

vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: () => tilstand.auth }));
vi.mock('@/lib/hooks/useIsNative', () => ({ useIsNative: () => tilstand.native }));
vi.mock('next/navigation', () => ({ usePathname: () => tilstand.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: tilstand.pending })
}));

function tegn() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <BottomNav />
    </NextIntlClientProvider>
  );
}

const fane = (navn: string) => screen.getByRole('link', { name: navn });
const aktive = () =>
  screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent);

beforeEach(() => {
  tilstand.auth = { user: null, loading: false };
  tilstand.native = false;
  tilstand.pathname = '/';
  tilstand.pending = false;
});

afterEach(cleanup);

describe('BottomNav — Hjem', () => {
  it('utlogget i appen: Hjem er /soppforhold, og lyser der', () => {
    tilstand.native = true;
    tilstand.pathname = '/soppforhold';
    tegn();
    expect(fane('Hjem').getAttribute('href')).toBe('/soppforhold');
    expect(aktive()).toEqual(['Hjem']);
  });

  it('…og på områdesidene under', () => {
    tilstand.native = true;
    tilstand.pathname = '/soppforhold/oslo';
    tegn();
    expect(aktive()).toEqual(['Hjem']);
  });

  it('utlogget på nett: Hjem er fortsatt «/» — landingssiden — og lyser ikke på /soppforhold', () => {
    tilstand.pathname = '/soppforhold';
    tegn();
    expect(fane('Hjem').getAttribute('href')).toBe('/');
    expect(aktive()).toEqual([]);
  });

  it('innlogget i appen: Hjem er «/», som før', () => {
    tilstand.native = true;
    tilstand.auth = { user: { id: 'u1' }, loading: false };
    tegn();
    expect(fane('Hjem').getAttribute('href')).toBe('/');
    expect(aktive()).toEqual(['Hjem']);
  });

  it('mens innloggingen er ukjent står «/» — en innlogget bruker får aldri /soppforhold i et øyeblikk', () => {
    tilstand.native = true;
    tilstand.auth = { user: null, loading: true };
    tegn();
    expect(fane('Hjem').getAttribute('href')).toBe('/');
  });
});

describe('BottomNav — de andre fanene', () => {
  it('peker dit de alltid har pekt, uansett innlogging og plattform', () => {
    tilstand.native = true;
    tegn();
    expect(fane('Bibliotek').getAttribute('href')).toBe('/species');
    expect(fane('Kart').getAttribute('href')).toBe('/map');
    expect(fane('Kalender').getAttribute('href')).toBe('/calendar');
  });

  it('lyser på siden sin og alt under den', () => {
    tilstand.pathname = '/species/12';
    tegn();
    expect(aktive()).toEqual(['Bibliotek']);
  });

  it('markeres med en gang et trykk er registrert (useLinkStatus), før siden har svart', () => {
    tilstand.pathname = '/species';
    tilstand.pending = true;
    tegn();
    // Etiketten får den aktive fargen selv om adressen ikke er byttet ennå.
    expect(screen.getByText('Kart').className).toContain('text-forest-900');
    // …men aria-current følger adressen, ikke trykket.
    expect(aktive()).toEqual(['Bibliotek']);
  });
});
