// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProvGratisVedStart } from '../ProvGratisVedStart';
import nb from '../../../../messages/nb.json';
import { ONBOARDING_DONE_EVENT, ONBOARDING_STORAGE_KEY } from '@/components/onboarding/OnboardingIntro';
import { FORSIDEKORT_FRIST_MS, FORSIDEKORT_KLAR_EVENT, PROVETILBUD_PUSTEROM_MS } from '@/lib/billing/provetilbud-venting';
import { PROVETILBUD_NOKKEL, PROVETILBUD_START_NOKKEL } from '@/lib/billing/provetilbud';

/**
 * Arket ved første innlogging la seg tidligere 800 ms etter forsiden — oppå
 * velkomstintroen, før forsidekortet hadde data. Testene låser den nye
 * rekkefølgen: intro ferdig OG kort klart (i hvilken som helst rekkefølge),
 * så et pusterom, så arket. Og fristen som gjør at et kort uten data ikke
 * holder tilbudet tilbake for alltid.
 */

vi.mock('@/lib/hooks/useProveLofte', () => ({
  hentProveLofte: vi.fn(() => Promise.resolve({ kjent: true, harProve: true, proveDager: 7, pris: null })),
  useProveLofte: () => ({ kjent: true, harProve: true, proveDager: 7, pris: null }),
  glemProveLofte: vi.fn()
}));

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, loading: false })
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  )
}));

const TITTEL = nb.ProvGratisArk.tittelStart.replace('{dager}', '7');
const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));

function rendrer() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <ProvGratisVedStart />
    </NextIntlClientProvider>
  );
}

function send(hendelse: string) {
  act(() => {
    window.dispatchEvent(new Event(hendelse));
  });
}

function vent(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const arkVises = () => screen.queryByText(TITTEL) !== null;

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ProvGratisVedStart', () => {
  it('kommer ikke før både introen er ferdig og kortet har data — så et pusterom', () => {
    rendrer();
    vent(800);
    expect(arkVises()).toBe(false);

    send(ONBOARDING_DONE_EVENT);
    vent(PROVETILBUD_PUSTEROM_MS + 50);
    expect(arkVises()).toBe(false);

    send(FORSIDEKORT_KLAR_EVENT);
    expect(arkVises()).toBe(false); // pusterommet
    vent(PROVETILBUD_PUSTEROM_MS - 10);
    expect(arkVises()).toBe(false);
    vent(20);
    expect(arkVises()).toBe(true);
  });

  it('samme resultat når kortet er klart før introen', () => {
    rendrer();
    send(FORSIDEKORT_KLAR_EVENT);
    vent(2000);
    expect(arkVises()).toBe(false);

    send(ONBOARDING_DONE_EVENT);
    vent(PROVETILBUD_PUSTEROM_MS + 10);
    expect(arkVises()).toBe(true);
  });

  it('introen som alt er sett teller som ferdig (samme nøkkel som introen selv)', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    rendrer();
    send(FORSIDEKORT_KLAR_EVENT);
    vent(PROVETILBUD_PUSTEROM_MS + 10);
    expect(arkVises()).toBe(true);
  });

  it('fristen: et kort som aldri melder data holder ikke tilbudet tilbake for alltid', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    rendrer();
    vent(FORSIDEKORT_FRIST_MS - 10);
    expect(arkVises()).toBe(false);
    vent(10 + PROVETILBUD_PUSTEROM_MS + 10);
    expect(arkVises()).toBe(true);
  });

  it('melder visningen som bruksflate «tilbud» med utløser «start», og husker at den er vist', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    rendrer();
    send(FORSIDEKORT_KLAR_EVENT);
    vent(PROVETILBUD_PUSTEROM_MS + 10);
    expect(arkVises()).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/me/bruksdag');
    expect(JSON.parse(String(init.body))).toEqual({ flate: 'tilbud', omrade: 'start' });

    expect(window.localStorage.getItem(PROVETILBUD_START_NOKKEL)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(PROVETILBUD_NOKKEL) ?? '{}').visninger).toBe(1);
  });

  it('vises aldri to ganger', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    window.localStorage.setItem(PROVETILBUD_START_NOKKEL, '2026-09-14T18:00:00.000Z');
    rendrer();
    send(FORSIDEKORT_KLAR_EVENT);
    vent(FORSIDEKORT_FRIST_MS + PROVETILBUD_PUSTEROM_MS + 100);
    expect(arkVises()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('teller ikke automatiserte nettlesere (QA-løpet mot prod-databasen)', () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    rendrer();
    send(FORSIDEKORT_KLAR_EVENT);
    vent(FORSIDEKORT_FRIST_MS + PROVETILBUD_PUSTEROM_MS + 100);
    expect(arkVises()).toBe(false);
  });
});
