// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProvGratisArk, type TilbudUtloser } from '../ProvGratisArk';
import nb from '../../../../messages/nb.json';
import type { ProveLofte } from '@/lib/hooks/useProveLofte';

/**
 * Arket skal (1) si «3 av 12» bare når det er det brukeren ser, (2) love
 * «7 dager gratis» bare når butikken faktisk gir den, og (3) melde utløseren
 * på bruksdag-raden, så trakten ark → pris kan leses per utløser.
 */

let lofte: ProveLofte = { kjent: true, harProve: true, proveDager: 7, pris: null };

vi.mock('@/lib/hooks/useProveLofte', () => ({
  hentProveLofte: vi.fn(() => Promise.resolve(lofte)),
  useProveLofte: () => lofte,
  glemProveLofte: vi.fn()
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  )
}));

const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));

function rendrer(utloser: TilbudUtloser) {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <ProvGratisArk utloser={utloser} onIkkeNaa={() => {}} onStart={() => {}} />
    </NextIntlClientProvider>
  );
}

function sendtUtloser(): string {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)).omrade;
}

beforeEach(() => {
  lofte = { kjent: true, harProve: true, proveDager: 7, pris: null };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProvGratisArk', () => {
  it('«3 av 12» bare ved utløseren «begrenset»', () => {
    rendrer('begrenset');
    expect(screen.getByText(nb.ProvGratisArk.tittel)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.tekst)).toBeTruthy();
    expect(sendtUtloser()).toBe('begrenset');
  });

  it('kartets andre utløsere snakker om områdeprognosen, ikke om «3 av 12»', () => {
    rendrer('forste-okt');
    expect(screen.queryByText(nb.ProvGratisArk.tekst)).toBeNull();
    expect(screen.getByText(nb.ProvGratisArk.tekstStart)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.ikkeNaa)).toBeTruthy();
    expect(sendtUtloser()).toBe('forste-okt');
  });

  it('start-arket: områdene med begrunnelse først, offline-kart, AI sist — og gratisuka når den finnes', () => {
    rendrer('start');
    const tekst = nb.ProvGratisArk.tekstStart;
    expect(tekst.indexOf('begrunnelse')).toBeLessThan(tekst.indexOf('Offline-kart'));
    expect(tekst.indexOf('Offline-kart')).toBeLessThan(tekst.indexOf('AI-soppkjenner'));
    expect(screen.getByText(nb.ProvGratisArk.tittelStart.replace('{dager}', '7'))).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.vilkaar.replace('{dager}', '7'))).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.start)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.fortsettGratis)).toBeTruthy();
    expect(sendtUtloser()).toBe('start');
  });

  it('uten gratisuke i butikken: pris uten løfte, og knappen lover ingen gratis uke', () => {
    lofte = { kjent: true, harProve: false, proveDager: null, pris: 'kr 79,00' };
    rendrer('start');
    expect(screen.getByText(nb.ProvGratisArk.tittelStartUtenProve)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.vilkaarPris.replace('{pris}', 'kr 79,00'))).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.startUtenProve)).toBeTruthy();
    expect(screen.queryByText(/gratis i 7 dager|gratis uke/i)).toBeNull();
  });

  it('før butikken har svart loves ingenting', () => {
    lofte = { kjent: false };
    rendrer('andre-dag');
    expect(screen.getByText(nb.ProvGratisArk.tittelStartUtenProve)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.vilkaarUtenProve)).toBeTruthy();
  });

  it('gratisuke med ukjent lengde sier «gratis» uten tall', () => {
    lofte = { kjent: true, harProve: true, proveDager: null, pris: null };
    rendrer('start');
    expect(screen.getByText(nb.ProvGratisArk.tittelStartUkjentLengde)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.vilkaarUkjentLengde)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.startProve)).toBeTruthy();
  });
});
