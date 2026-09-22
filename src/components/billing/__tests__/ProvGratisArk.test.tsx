// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProvGratisArk, type TilbudUtloser } from '../ProvGratisArk';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { fornyelsesTekst } from '@/lib/billing/fornyelse';
import type { ProveLofte } from '@/lib/hooks/useProveLofte';

/**
 * Arket skal (1) lede med sesongpasset og vise måneden som et synlig, like
 * tydelig alternativ, (2) love «7 dager gratis» bare når butikken faktisk gir
 * den PÅ DEN PLANEN, (3) si «3 av 12» bare når det er det brukeren ser, og
 * (4) melde utløseren på bruksdag-raden, så trakten ark → pris kan leses per
 * utløser.
 */

const PASS = { plan: 'season_pass' as const, harProve: true, proveDager: 7, pris: '249 kr' };
const PASS_UTEN_PROVE = { plan: 'season_pass' as const, harProve: false, proveDager: null, pris: 'kr 249,00' };
const MAANED = { plan: 'premium' as const, harProve: true, proveDager: 7, pris: '99 kr' };
const MAANED_UTEN_PROVE = { plan: 'premium' as const, harProve: false, proveDager: null, pris: 'kr 99,00' };

let lofte: ProveLofte = { kjent: true, season_pass: PASS, premium: MAANED };

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
const onStart = vi.fn();

function rendrer(utloser: TilbudUtloser, locale: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <ProvGratisArk utloser={utloser} onIkkeNaa={() => {}} onStart={onStart} />
    </NextIntlClientProvider>
  );
}

function sendtUtloser(): string {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)).omrade;
}

/** Lenkene i arket, i DOM-rekkefølge — passet skal alltid stå først. */
function lenker(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll('[role="dialog"] a'));
}

const fyll = (mal: string, verdier: Record<string, string | number>) =>
  Object.entries(verdier).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), mal);

const DATO = fornyelsesTekst('season_pass', 'nb');

beforeEach(() => {
  lofte = { kjent: true, season_pass: PASS, premium: MAANED };
  fetchMock.mockClear();
  onStart.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProvGratisArk — sesongpasset først', () => {
  it('start-arket: passet med gratisuke i tittel, vilkår med dato og pris, passknappen først og måneden som synlig alternativ', () => {
    rendrer('start');
    expect(screen.getByRole('heading').textContent).toBe(fyll(nb.ProvGratisArk.tittelPassProve, { dager: 7 }));
    expect(screen.getByText(fyll(nb.ProvGratisArk.passVilkaarProve, { dato: DATO, pris: '249 kr' }))).toBeTruthy();
    expect(DATO).toMatch(/^ca\. \d{1,2}\. [a-zæøå]+ \d{4}$/);

    const [pass, maaned] = lenker();
    expect(pass.textContent).toBe(nb.ProvGratisArk.provPass);
    expect(pass.getAttribute('href')).toBe('/pricing?plan=season_pass');
    expect(maaned.textContent).toBe(fyll(nb.ProvGratisArk.maanedValgProve, { pris: '99 kr', dager: 7 }));
    expect(maaned.getAttribute('href')).toBe('/pricing?plan=premium');
    expect(lenker()).toHaveLength(2);

    expect(screen.getByText(nb.ProvGratisArk.fortsettGratis)).toBeTruthy();
    expect(sendtUtloser()).toBe('start');
  });

  it('begge knappene melder onStart, så arket lukkes uansett hvilken plan som velges', () => {
    rendrer('andre-dag');
    const [pass, maaned] = lenker();
    pass.click();
    maaned.click();
    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it('punktrekkefølgen: områdene med begrunnelse først, offline-kart, AI sist', () => {
    rendrer('start');
    const tekst = nb.ProvGratisArk.tekstStart;
    expect(screen.getByText(tekst)).toBeTruthy();
    expect(tekst.indexOf('begrunnelse')).toBeLessThan(tekst.indexOf('Offline-kart'));
    expect(tekst.indexOf('Offline-kart')).toBeLessThan(tekst.indexOf('AI-soppkjenner'));
  });

  it('passet uten gratisuke i butikken: pris i tittelen, vilkår uten «prøveuka», og «Kjøp Sesongpass» — mens måneden beholder sin', () => {
    lofte = { kjent: true, season_pass: PASS_UTEN_PROVE, premium: MAANED };
    rendrer('start');
    expect(screen.getByRole('heading').textContent).toBe(fyll(nb.ProvGratisArk.tittelPassUtenProve, { pris: 'kr 249,00' }));
    expect(screen.getByText(fyll(nb.ProvGratisArk.passVilkaar, { dato: DATO }))).toBeTruthy();
    const [pass, maaned] = lenker();
    expect(pass.textContent).toBe(nb.ProvGratisArk.kjopPass);
    expect(maaned.textContent).toBe(fyll(nb.ProvGratisArk.maanedValgProve, { pris: '99 kr', dager: 7 }));
    // Ingen gratisuke lovet på passet — verken i tittel, vilkår eller knapp.
    expect(pass.textContent).not.toMatch(/gratis/i);
    expect(screen.queryByText(/prøveuka|Prøv Sesongpass gratis/)).toBeNull();
  });

  it('månedslinja lover gratisuke bare når Premium har den', () => {
    lofte = { kjent: true, season_pass: PASS, premium: MAANED_UTEN_PROVE };
    rendrer('start');
    const [, maaned] = lenker();
    expect(maaned.textContent).toBe(fyll(nb.ProvGratisArk.maanedValg, { pris: 'kr 99,00' }));
    expect(maaned.textContent).not.toMatch(/gratis/i);
  });

  it('mangler Premium i butikken, står passet alene', () => {
    lofte = { kjent: true, season_pass: PASS, premium: null };
    rendrer('start');
    expect(lenker()).toHaveLength(1);
    expect(lenker()[0].textContent).toBe(nb.ProvGratisArk.provPass);
  });

  it('«3 av 12» bare ved utløseren «begrenset» — og også der leder passknappen', () => {
    rendrer('begrenset');
    expect(screen.getByText(nb.ProvGratisArk.tittel)).toBeTruthy();
    expect(screen.getByText(nb.ProvGratisArk.tekst)).toBeTruthy();
    expect(screen.queryByText(nb.ProvGratisArk.tekstStart)).toBeNull();
    expect(lenker()[0].textContent).toBe(nb.ProvGratisArk.provPass);
    expect(screen.getByText(nb.ProvGratisArk.ikkeNaa)).toBeTruthy();
    expect(sendtUtloser()).toBe('begrenset');
  });

  it('kartets andre utløsere snakker om områdeprognosen, ikke om «3 av 12»', () => {
    rendrer('forste-okt');
    expect(screen.queryByText(nb.ProvGratisArk.tekst)).toBeNull();
    expect(screen.getByText(nb.ProvGratisArk.tekstStart)).toBeTruthy();
    expect(sendtUtloser()).toBe('forste-okt');
  });

  it('før butikken har svart loves ingenting — ingen pris, ingen gratisuke, ingen månedslinje', () => {
    lofte = { kjent: false };
    rendrer('andre-dag');
    expect(screen.getByRole('heading').textContent).toBe(nb.ProvGratisArk.tittelUkjent);
    expect(screen.getByText(nb.ProvGratisArk.vilkaarUtenProve)).toBeTruthy();
    expect(lenker()).toHaveLength(1);
    expect(lenker()[0].textContent).toBe(nb.ProvGratisArk.sePass);
    expect(lenker()[0].getAttribute('href')).toBe('/pricing?plan=season_pass');
    expect(screen.queryByText(/gratis i|kr/)).toBeNull();
  });

  it('gratisuke med ukjent lengde sier «gratis» uten tall', () => {
    lofte = { kjent: true, season_pass: { ...PASS, proveDager: null }, premium: { ...MAANED, proveDager: null } };
    rendrer('start');
    expect(screen.getByRole('heading').textContent).toBe(nb.ProvGratisArk.tittelPassProveUkjentLengde);
    expect(screen.getByText(fyll(nb.ProvGratisArk.passVilkaarProvePeriode, { dato: DATO, pris: '249 kr' }))).toBeTruthy();
    expect(lenker()[1].textContent).toBe(fyll(nb.ProvGratisArk.maanedValgProveUkjentLengde, { pris: '99 kr' }));
  });

  it('svensk: samme oppbygning med svensk dato («ca. 22 september 2027»-formen, uten punktum etter dagen)', () => {
    rendrer('start', 'sv');
    const dato = fornyelsesTekst('season_pass', 'sv');
    expect(dato).toMatch(/^ca\. \d{1,2} [a-zäö]+ \d{4}$/);
    expect(screen.getByRole('heading').textContent).toBe(fyll(sv.ProvGratisArk.tittelPassProve, { dager: 7 }));
    expect(screen.getByText(fyll(sv.ProvGratisArk.passVilkaarProve, { dato, pris: '249 kr' }))).toBeTruthy();
    expect(lenker()[0].textContent).toBe(sv.ProvGratisArk.provPass);
  });

  it('teller ikke automatiserte nettlesere (QA-løpet mot prod-databasen)', () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
    rendrer('start');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
