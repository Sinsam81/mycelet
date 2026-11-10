// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProvGratisArk, type TilbudUtloser } from '../ProvGratisArk';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { fornyelsesTekst, forsteBelastningsTekst } from '@/lib/billing/fornyelse';
import type { ProveLofte } from '@/lib/hooks/useProveLofte';

/**
 * Datoen er LÅST, og låst før noe annet lastes: vilkårene følger sesongen
 * (sesongtekst.ts), så uten dette ville testene byttet fasit 1. desember.
 * Bare Date fakes — tidtakere og løfter går som vanlig. 15. september =
 * høstleddet («resten av høsten nå»); vinter og forsesong testes for seg nederst.
 */
const HOST = new Date('2026-09-15T10:00:00Z');
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
});

/**
 * Arket skal (1) lede med sesongpasset og vise måneden som et synlig, like
 * tydelig alternativ, (2) love «7 dager gratis» bare når butikken faktisk gir
 * den PÅ DEN PLANEN — og da si når de 249 kronene trekkes første gang og at
 * passet gjelder ett år fra DEN dagen, (3) si «3 av 12» bare når det er det
 * brukeren ser, og (4) melde utløseren på bruksdag-raden, så trakten
 * ark → pris kan leses per utløser.
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

/** Uten gratisuke: passet gjelder ett år fra i dag. */
const DATO = fornyelsesTekst('season_pass', 'nb');
/** Med sju gratisdager: første belastning om en uke, og passet gjelder ett år fra den. */
const FORSTE_BELASTNING = forsteBelastningsTekst(7, 'nb');
const DATO_ETTER_PROVE = fornyelsesTekst('season_pass', 'nb', 7);
const PASS_VILKAAR_PROVE = fyll(nb.ProvGratisArk.passVilkaarProve, { dager: 7, forsteBelastning: FORSTE_BELASTNING, pris: '249 kr', dato: DATO_ETTER_PROVE, dekning: nb.ProvGratisArk.passDekningHost });

beforeEach(() => {
  vi.setSystemTime(HOST);
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
  it('start-arket: passet med gratisuke i tittel, vilkår med første belastning, pris og dato, passknappen først og måneden som synlig alternativ', () => {
    rendrer('start');
    expect(screen.getByRole('heading').textContent).toBe(fyll(nb.ProvGratisArk.tittelPassProve, { dager: 7 }));
    expect(screen.getByText(PASS_VILKAAR_PROVE)).toBeTruthy();
    expect(FORSTE_BELASTNING).toMatch(/^ca\. \d{1,2}\. [a-zæøå]+ \d{4}$/);
    expect(DATO_ETTER_PROVE).toMatch(/^ca\. \d{1,2}\. [a-zæøå]+ \d{4}$/);
    // Vilkårene sier når pengene trekkes første gang, prisen, og at året
    // regnes fra den dagen — ikke fra i dag (Stripe fakturerer ved trial_end).
    expect(PASS_VILKAAR_PROVE).toContain(`Fra ${FORSTE_BELASTNING} koster passet 249 kr per år`);
    expect(PASS_VILKAAR_PROVE).toContain(`gjelder da til ${DATO_ETTER_PROVE}`);
    expect(PASS_VILKAAR_PROVE).toContain(`avslutter før ${FORSTE_BELASTNING}`);
    expect(DATO_ETTER_PROVE).not.toBe(DATO);

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
    // Uten prøve gjelder passet ett år fra i dag — ingen første belastning å nevne.
    expect(screen.getByText(fyll(nb.ProvGratisArk.passVilkaar, { dato: DATO, dekning: nb.ProvGratisArk.passDekningHost }))).toBeTruthy();
    const [pass, maaned] = lenker();
    expect(pass.textContent).toBe(nb.ProvGratisArk.kjopPass);
    expect(maaned.textContent).toBe(fyll(nb.ProvGratisArk.maanedValgProve, { pris: '99 kr', dager: 7 }));
    // Ingen gratisuke lovet på passet — verken i tittel, vilkår eller knapp.
    expect(pass.textContent).not.toMatch(/gratis/i);
    expect(screen.queryByText(/prøveperiode|belastning|Prøv Sesongpass gratis/)).toBeNull();
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

  it('gratisuke med ukjent lengde sier «gratis» uten tall — og ingen dato, siden ingen kan regnes', () => {
    lofte = { kjent: true, season_pass: { ...PASS, proveDager: null }, premium: { ...MAANED, proveDager: null } };
    rendrer('start');
    expect(screen.getByRole('heading').textContent).toBe(nb.ProvGratisArk.tittelPassProveUkjentLengde);
    const vilkaar = fyll(nb.ProvGratisArk.passVilkaarProveUkjentLengde, { pris: '249 kr', dekning: nb.ProvGratisArk.passDekningHost });
    expect(screen.getByText(vilkaar)).toBeTruthy();
    expect(vilkaar).not.toMatch(/\d{4}/);
    expect(lenker()[1].textContent).toBe(fyll(nb.ProvGratisArk.maanedValgProveUkjentLengde, { pris: '99 kr' }));
  });

  it('en kjent prøve som ikke er sju dager får samme vilkår med sitt eget tall og sine egne datoer', () => {
    lofte = { kjent: true, season_pass: { ...PASS, proveDager: 14 }, premium: MAANED };
    rendrer('start');
    expect(screen.getByRole('heading').textContent).toBe(fyll(nb.ProvGratisArk.tittelPassProve, { dager: 14 }));
    expect(
      screen.getByText(
        fyll(nb.ProvGratisArk.passVilkaarProve, {
          dager: 14,
          forsteBelastning: forsteBelastningsTekst(14, 'nb'),
          pris: '249 kr',
          dato: fornyelsesTekst('season_pass', 'nb', 14),
          dekning: nb.ProvGratisArk.passDekningHost
        })
      )
    ).toBeTruthy();
  });

  it('svensk: samme oppbygning med svensk dato («ca 22 september 2027»-formen — «ca» uten punktum, ingen punktum etter dagen)', () => {
    rendrer('start', 'sv');
    const dato = fornyelsesTekst('season_pass', 'sv', 7);
    const forsteBelastning = forsteBelastningsTekst(7, 'sv');
    expect(dato).toMatch(/^ca \d{1,2} [a-zäö]+ \d{4}$/);
    expect(forsteBelastning).toMatch(/^ca \d{1,2} [a-zäö]+ \d{4}$/);
    expect(screen.getByRole('heading').textContent).toBe(fyll(sv.ProvGratisArk.tittelPassProve, { dager: 7 }));
    expect(screen.getByText(fyll(sv.ProvGratisArk.passVilkaarProve, { dager: 7, forsteBelastning, pris: '249 kr', dato, dekning: sv.ProvGratisArk.passDekningHost }))).toBeTruthy();
    expect(lenker()[0].textContent).toBe(sv.ProvGratisArk.provPass);
  });

  it('teller ikke automatiserte nettlesere (QA-løpet mot prod-databasen)', () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
    rendrer('start');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ProvGratisArk — vilkårene følger sesongen', () => {
  // Regnes inne i hver test, ETTER at datoen er flyttet: både datoene og
  // dekningsleddet avhenger av «i dag».
  const vilkaar = (katalog: typeof nb, dekning: string, locale: 'nb' | 'sv') =>
    fyll(katalog.ProvGratisArk.passVilkaarProve, {
      dager: 7,
      forsteBelastning: forsteBelastningsTekst(7, locale),
      pris: '249 kr',
      dato: fornyelsesTekst('season_pass', locale, 7),
      dekning
    });

  it('september: «resten av høsten nå»', () => {
    rendrer('start');
    expect(screen.getByText(vilkaar(nb, nb.ProvGratisArk.passDekningHost, 'nb')).textContent).toContain(
      'resten av høsten nå'
    );
  });

  it('januar: aldri «resten av høsten nå» — passet dekker hele neste sesong', () => {
    vi.setSystemTime(new Date('2027-01-15T10:00:00Z'));
    rendrer('start');
    const tekst = screen.getByText(vilkaar(nb, nb.ProvGratisArk.passDekningUtenomSesong, 'nb')).textContent ?? '';
    expect(tekst).not.toMatch(/høst/);
    expect(tekst).toContain('hele neste soppsesong er med');
    // Det lovpålagte står uendret: første belastning, pris, fornyelse, avslutning.
    expect(tekst).toContain(`Fra ${forsteBelastningsTekst(7, 'nb')} koster passet 249 kr per år`);
    expect(tekst).toContain(`avslutter før ${forsteBelastningsTekst(7, 'nb')}`);
  });

  it('januar på svensk: svensk ledd, ingen «hösten»', () => {
    vi.setSystemTime(new Date('2027-01-15T10:00:00Z'));
    rendrer('start', 'sv');
    const tekst = screen.getByText(vilkaar(sv, sv.ProvGratisArk.passDekningUtenomSesong, 'sv')).textContent ?? '';
    expect(tekst).not.toMatch(/höst/);
    expect(tekst).toContain('hela nästa svampsäsong ingår');
  });

  it('juli: «resten av sesongen nå», ikke høsten', () => {
    vi.setSystemTime(new Date('2027-07-10T10:00:00Z'));
    rendrer('start');
    const tekst = screen.getByText(vilkaar(nb, nb.ProvGratisArk.passDekningForsesong, 'nb')).textContent ?? '';
    expect(tekst).toContain('resten av sesongen nå');
    expect(tekst).not.toMatch(/høst/);
  });

  it('uten gratisuke og med ukjent lengde får samme sesongledd', () => {
    vi.setSystemTime(new Date('2027-02-01T10:00:00Z'));
    const dekning = nb.ProvGratisArk.passDekningUtenomSesong;
    lofte = { kjent: true, season_pass: PASS_UTEN_PROVE, premium: MAANED };
    rendrer('start');
    expect(
      screen.getByText(fyll(nb.ProvGratisArk.passVilkaar, { dato: fornyelsesTekst('season_pass', 'nb'), dekning }))
    ).toBeTruthy();
    cleanup();
    lofte = { kjent: true, season_pass: { ...PASS, proveDager: null }, premium: MAANED };
    rendrer('start');
    expect(
      screen.getByText(fyll(nb.ProvGratisArk.passVilkaarProveUkjentLengde, { pris: '249 kr', dekning }))
    ).toBeTruthy();
  });
});
