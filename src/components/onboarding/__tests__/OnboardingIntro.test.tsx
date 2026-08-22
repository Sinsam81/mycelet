// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingIntro } from '../OnboardingIntro';
import nb from '../../../../messages/nb.json';

/**
 * App Review-avvisningen 21.08.2026 (2.1a «Logg inn button is unresponsive»):
 * introen monterte sløret sitt mens tastaturet fortsatt holdt WKWebViews
 * viewport sammenpresset, kortet havnet under skjermkanten, og sløret spiste
 * alle trykk — appen fremsto død rett etter en VELLYKKET innlogging.
 *
 * Testene låser de tre garantiene som hindrer gjentakelse:
 *  1. Introen monteres IKKE mens viewporten er tastatur-forstyrret; den kommer
 *     når flaten er stabil igjen.
 *  2. Et trykk på sløret lukker introen (den er skippbar av design).
 *  3. Uteblir resize-hendelsen, viser sikkerhetsnettet introen til slutt.
 */

const bruker = { id: 'test-user' };
let mockUser: { id: string } | null = bruker;

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false })
}));

function rendrer() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <OnboardingIntro />
    </NextIntlClientProvider>
  );
}

type Lytter = () => void;

function fakeViewport(hoyde: number) {
  const lyttere = new Set<Lytter>();
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      height: hoyde,
      addEventListener: (_t: string, fn: Lytter) => lyttere.add(fn),
      removeEventListener: (_t: string, fn: Lytter) => lyttere.delete(fn)
    }
  });
  return {
    settHoyde(h: number) {
      (window.visualViewport as unknown as { height: number }).height = h;
      lyttere.forEach((fn) => fn());
    }
  };
}

beforeEach(() => {
  mockUser = bruker;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  vi.useRealTimers();
});

describe('OnboardingIntro', () => {
  it('vises for innlogget bruker uten tastatur i veien', () => {
    rendrer();
    expect(screen.getByText(nb.OnboardingIntro.step1Title)).toBeTruthy();
  });

  it('vises ikke for utlogget besøkende', () => {
    mockUser = null;
    rendrer();
    expect(screen.queryByText(nb.OnboardingIntro.step1Title)).toBeNull();
  });

  it('venter når tastaturet forstyrrer, og kommer når flaten er stabil', () => {
    const vv = fakeViewport(window.innerHeight - 300); // tastatur oppe
    rendrer();
    expect(screen.queryByText(nb.OnboardingIntro.step1Title)).toBeNull();

    act(() => vv.settHoyde(window.innerHeight)); // tastaturet la seg
    expect(screen.getByText(nb.OnboardingIntro.step1Title)).toBeTruthy();
  });

  it('sikkerhetsnettet viser introen selv om resize aldri kommer', () => {
    vi.useFakeTimers();
    fakeViewport(window.innerHeight - 300);
    rendrer();
    expect(screen.queryByText(nb.OnboardingIntro.step1Title)).toBeNull();

    act(() => void vi.advanceTimersByTime(2600));
    expect(screen.getByText(nb.OnboardingIntro.step1Title)).toBeTruthy();
  });

  it('trykk på sløret lukker introen og markerer den som ferdig', () => {
    rendrer();
    const kort = screen.getByText(nb.OnboardingIntro.step1Title);
    const sloer = kort.closest('div.fixed');
    expect(sloer).not.toBeNull();

    fireEvent.click(sloer!);
    expect(screen.queryByText(nb.OnboardingIntro.step1Title)).toBeNull();
    expect(window.localStorage.getItem('mycelet:onboarding-v1')).toBe('1');
  });

  it('trykk INNE i kortet lukker ikke', () => {
    rendrer();
    fireEvent.click(screen.getByText(nb.OnboardingIntro.step1Title));
    expect(screen.getByText(nb.OnboardingIntro.step1Title)).toBeTruthy();
  });
});
