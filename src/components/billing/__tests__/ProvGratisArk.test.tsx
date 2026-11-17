// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { ProvGratisArk, type TilbudUtloser } from '../ProvGratisArk';
import { buildTopSpotPopupHtml } from '@/components/map/topSpotPopup';
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
 * passet gjelder ett år fra DEN dagen, (3) si grensene for antall områder
 * («opptil 3 … opptil 12») bare ved utløseren «begrenset», og aldri love et
 * antall, og (4) melde utløseren på bruksdag-raden, så trakten ark → pris kan
 * leses per utløser.
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

/** Står arket i iOS-skallet? Da selger App Store, med Apples frist (24 timer før prøveslutt). */
let iAppen = false;
vi.mock('@/lib/native/platform', () => ({
  isNativePlatform: () => iAppen,
  plattform: () => (iAppen ? 'ios' : 'web')
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
  iAppen = false;
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

  it('grensene for antall områder bare ved utløseren «begrenset» — med planens tittel, og passknappen først', () => {
    rendrer('begrenset');
    // Samme tittel som de andre utløserne: ingen «Se alle 12 …».
    expect(screen.getByRole('heading').textContent).toBe(fyll(nb.ProvGratisArk.tittelPassProve, { dager: 7 }));
    expect(screen.getByText(nb.ProvGratisArk.tekst)).toBeTruthy();
    expect(screen.queryByText(nb.ProvGratisArk.tekstStart)).toBeNull();
    expect(lenker()[0].textContent).toBe(nb.ProvGratisArk.provPass);
    expect(screen.getByText(nb.ProvGratisArk.ikkeNaa)).toBeTruthy();
    expect(sendtUtloser()).toBe('begrenset');
  });

  it('kartets andre utløsere snakker om områdeprognosen, ikke om grensene for gratis', () => {
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

// Regnes inne i hver test, ETTER at datoen er flyttet: både datoene og
// dekningsleddet avhenger av «i dag». `nokkel` velger nett- eller App Store-utgaven.
const vilkaar = (
  katalog: typeof nb,
  dekning: string,
  locale: 'nb' | 'sv',
  nokkel: 'passVilkaarProve' | 'passVilkaarProveApp' = 'passVilkaarProve'
) =>
  fyll(katalog.ProvGratisArk[nokkel], {
    dager: 7,
    forsteBelastning: forsteBelastningsTekst(7, locale),
    pris: '249 kr',
    dato: fornyelsesTekst('season_pass', locale, 7),
    dekning
  });

describe('ProvGratisArk — vilkårene følger sesongen', () => {
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

/**
 * ⭐ Lovende finner ofte ingenting fra november til juni — kartet sier selv at
 * forholdene er for svake. Arket som vises på forsiden og etter 30 sekunder i
 * kartet, skal ikke selge «Opptil 12 lovende områder nær deg» de månedene.
 */
describe('ProvGratisArk — brødteksten følger sesongen', () => {
  const iMaaned = (m: number) => new Date(`2027-${String(m).padStart(2, '0')}-15T10:00:00Z`);
  /** Fasit skrevet ut her, ikke lest fra sesongtekst.ts: juli–oktober. */
  const lovendeNaa = (m: number) => m >= 7 && m <= 10;

  for (const locale of ['nb', 'sv'] as const) {
    const katalog = locale === 'sv' ? sv : nb;

    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(`${locale}: måned %i`, (m) => {
      vi.setSystemTime(iMaaned(m));
      rendrer('start', locale);
      const [forventet, aldri] = lovendeNaa(m)
        ? [katalog.ProvGratisArk.tekstStart, katalog.ProvGratisArk.tekstStartBetinget]
        : [katalog.ProvGratisArk.tekstStartBetinget, katalog.ProvGratisArk.tekstStart];
      const brodtekst = screen.getByText(forventet);
      expect(screen.queryByText(aldri)).toBeNull();
      if (!lovendeNaa(m)) {
        expect(brodtekst.textContent).not.toMatch(/\b12\b/);
        expect(brodtekst.textContent).toMatch(locale === 'sv' ? /Från november till juni/ : /Fra november til juni/);
      }
    });
  }

  it('kartets utløsere får den samme sesongteksten som forsiden, på begge språk', () => {
    vi.setSystemTime(iMaaned(1));
    for (const utloser of ['forste-okt', 'andre-dag'] as const) {
      for (const [locale, katalog] of [
        ['nb', nb],
        ['sv', sv]
      ] as const) {
        rendrer(utloser, locale);
        expect(screen.getByText(katalog.ProvGratisArk.tekstStartBetinget)).toBeTruthy();
        expect(screen.queryByText(katalog.ProvGratisArk.tekstStart)).toBeNull();
        cleanup();
      }
    }
  });

  it('november: betinget brødtekst, mens vilkårene fortsatt sier hva passet dekker («resten av høsten nå»)', () => {
    vi.setSystemTime(new Date('2026-11-16T13:00:00Z'));
    rendrer('start');
    expect(screen.getByText(nb.ProvGratisArk.tekstStartBetinget)).toBeTruthy();
    expect(screen.getByText(vilkaar(nb, nb.ProvGratisArk.passDekningHost, 'nb')).textContent).toContain('resten av høsten nå');
  });

  it('«begrenset» sier de samme grensene hele året, på begge språk — en grense er sann også om vinteren', () => {
    for (const m of [1, 9]) {
      vi.setSystemTime(iMaaned(m));
      for (const [locale, katalog] of [
        ['nb', nb],
        ['sv', sv]
      ] as const) {
        rendrer('begrenset', locale);
        expect(screen.getByText(katalog.ProvGratisArk.tekst)).toBeTruthy();
        expect(screen.queryByText(katalog.ProvGratisArk.tekstStartBetinget)).toBeNull();
        expect(screen.queryByText(katalog.ProvGratisArk.tekstStart)).toBeNull();
        cleanup();
      }
    }
  });
});

/**
 * «Begrenset» sa «Se alle 12 lovende områdene — Gratis viser 3. Sesongpass og
 * Premium viser alle 12». Utløseren fyrer ved ett lovende område eller flere,
 * og rutenettet velger topp 3 (gratis, 5×5) eller topp 12 (betalende, 7×7) i
 * hele boksen før kartet kutter det som ligger utenfor radiusen: gratis viste
 * ofte 1 eller 2, og betalende sjelden 12. Arket, banneret over kartet,
 * popupen på hvert område og knappen under kartet sier derfor grenser, og
 * tittelen følger planen.
 */
describe('ProvGratisArk — «begrenset» lover aldri et antall', () => {
  const SPRAK = [
    { locale: 'nb', katalog: nb, gratis: /\bopptil 3\b/, betalt: /\bopptil 12\b/, alle12: /\balle 12\b/i, bartTall: /\bviser \d/ },
    { locale: 'sv', katalog: sv, gratis: /\bupp till 3\b/, betalt: /\bupp till 12\b/, alle12: /\balla 12\b/i, bartTall: /\bvisar \d/ }
  ] as const;

  for (const { locale, katalog, gratis, betalt, alle12, bartTall } of SPRAK) {
    it(`${locale}: teksten sier grensen for gratis og for betalt, aldri «alle 12» eller et bart tall etter «viser»`, () => {
      const tekst = katalog.ProvGratisArk.tekst;
      expect(tekst).toMatch(gratis);
      expect(tekst).toMatch(betalt);
      expect(tekst).not.toMatch(alle12);
      expect(tekst).not.toMatch(bartTall);
      expect(tekst).not.toMatch(/\b(?:3|12)\./);
    });

    it(`${locale}: hele arket uten antall, og samme tittel som start-arket i hver butikktilstand`, () => {
      const tilstander: ProveLofte[] = [
        { kjent: true, season_pass: PASS, premium: MAANED },
        { kjent: true, season_pass: PASS_UTEN_PROVE, premium: MAANED },
        { kjent: true, season_pass: { ...PASS, proveDager: null }, premium: MAANED },
        { kjent: false }
      ];
      for (const tilstand of tilstander) {
        lofte = tilstand;
        rendrer('start', locale);
        const startTittel = screen.getByRole('heading').textContent;
        cleanup();

        rendrer('begrenset', locale);
        const tittel = screen.getByRole('heading').textContent ?? '';
        expect(tittel).toBe(startTittel);
        expect(tittel).not.toMatch(/\b12\b|\balle\b|\balla\b/i);
        const arket = screen.getByRole('dialog').textContent ?? '';
        expect(arket).toContain(katalog.ProvGratisArk.tekst);
        expect(arket).not.toMatch(alle12);
        expect(arket).not.toMatch(bartTall);
        cleanup();
      }
    });

    it(`${locale}: banneret, popupen på hvert område og knappen på kartet sier den samme grensen som arket`, () => {
      for (const nokkel of ['topSpotsLimited', 'premiumWhyHigh', 'seeAll12Premium', 'seeAll12PremiumUtenProve'] as const) {
        expect(katalog.MushroomMap[nokkel], nokkel).toMatch(betalt);
        expect(katalog.MushroomMap[nokkel], nokkel).not.toMatch(alle12);
      }
    });

    it(`${locale}: popupen en gratisbruker trykker på sier grensen og lover ingen gratisuke`, () => {
      // Popupen er en HTML-streng (topSpotPopup.ts) som bygges uten butikkens
      // svar, så den kan ikke spørre slik ProveLofteTekst gjør for knappen
      // under kartet. «Nye abonnenter får 7 dager gratis» sto der også i
      // appen når App Store ikke ga gratisuke på produktet, og for den som
      // har hatt abonnement før. Gratisuka loves av knappen og arket, som spør.
      const messages = katalog as unknown as Record<string, unknown>;
      const t = createTranslator({ locale, messages, namespace: 'MushroomMap' });
      const html = buildTopSpotPopupHtml({
        spot: { lat: 59.84, lng: 10.65, score: 62 },
        distanceKm: 3.2,
        directionLabel: 'sør',
        radiusM: 714,
        limited: true,
        locale,
        t: t as unknown as (key: string, values?: Record<string, string | number>) => string
      });
      expect(html).toContain(katalog.MushroomMap.premiumWhyHigh);
      expect(html).toMatch(betalt);
      expect(html).not.toMatch(alle12);
      expect(html).not.toMatch(/gratis/i);
    });
  }

  it('tittelen med antallet finnes ikke lenger i katalogen', () => {
    expect('tittel' in nb.ProvGratisArk).toBe(false);
    expect('tittel' in sv.ProvGratisArk).toBe(false);
  });
});

/**
 * I appen selger App Store, og Apple forsøker trekket i løpet av det siste
 * døgnet FØR prøven slutter (kanal.ts / avslutningsfrist). «Fornyes … om du
 * ikke avslutter før {prøveslutt}» ga en frist et døgn for sent — den som
 * fulgte den, kunne bli belastet årsprisen. På nett (Stripe, belaster ved
 * prøveslutt) står teksten uendret.
 */
describe('ProvGratisArk — i appen gjelder Apples frist', () => {
  it('passet med gratisuke: samme datoer og pris som på nett, men avslutt senest 24 timer før prøveslutt', () => {
    iAppen = true;
    rendrer('start');
    const tekst = screen.getByText(vilkaar(nb, nb.ProvGratisArk.passDekningHost, 'nb', 'passVilkaarProveApp')).textContent ?? '';
    expect(tekst).toContain(`Fra ${FORSTE_BELASTNING} koster passet 249 kr per år`);
    expect(tekst).toContain(`gjelder da til ${DATO_ETTER_PROVE}`);
    expect(tekst).toContain('Fornyes automatisk om du ikke avslutter senest 24 timer før prøveperioden er over.');
    // Prøveslutt er aldri fristen i appen.
    expect(tekst).not.toContain(`avslutter før ${FORSTE_BELASTNING}`);
    expect(screen.queryByText(PASS_VILKAAR_PROVE)).toBeNull();
  });

  it('nettet er uendret: Stripe belaster ved prøveslutt, og der er prøveslutt fristen', () => {
    iAppen = false;
    rendrer('start');
    const tekst = screen.getByText(PASS_VILKAAR_PROVE).textContent ?? '';
    expect(tekst).toContain(`avslutter før ${FORSTE_BELASTNING}`);
    expect(tekst).not.toMatch(/24 timer/);
  });

  it('ukjent lengde i appen: ingen dato, men samme 24-timersfrist', () => {
    iAppen = true;
    lofte = { kjent: true, season_pass: { ...PASS, proveDager: null }, premium: MAANED };
    rendrer('start');
    const forventet = fyll(nb.ProvGratisArk.passVilkaarProveUkjentLengdeApp, { pris: '249 kr', dekning: nb.ProvGratisArk.passDekningHost });
    expect(screen.getByText(forventet)).toBeTruthy();
    expect(forventet).toContain('senest 24 timer før prøveperioden er over');
    expect(forventet).not.toMatch(/\d{4}/);
    expect(screen.queryByText(fyll(nb.ProvGratisArk.passVilkaarProveUkjentLengde, { pris: '249 kr', dekning: nb.ProvGratisArk.passDekningHost }))).toBeNull();
  });

  it('svensk i appen: «senast 24 timmar innan provperioden är slut», aldri «före {datum}»', () => {
    iAppen = true;
    rendrer('start', 'sv');
    const forsteBelastning = forsteBelastningsTekst(7, 'sv');
    const tekst = screen.getByText(vilkaar(sv, sv.ProvGratisArk.passDekningHost, 'sv', 'passVilkaarProveApp')).textContent ?? '';
    expect(tekst).toContain(`Från ${forsteBelastning} kostar passet 249 kr per år`);
    expect(tekst).toContain('Förnyas automatiskt om du inte avslutar senast 24 timmar innan provperioden är slut.');
    expect(tekst).not.toContain(`före ${forsteBelastning}`);
  });

  it('sesong og kanal er uavhengige: januar i appen gir vinterleddet, den betingede brødteksten og 24-timersfristen', () => {
    vi.setSystemTime(new Date('2027-01-15T10:00:00Z'));
    iAppen = true;
    rendrer('start');
    const tekst = screen.getByText(vilkaar(nb, nb.ProvGratisArk.passDekningUtenomSesong, 'nb', 'passVilkaarProveApp')).textContent ?? '';
    expect(tekst).toContain('hele neste soppsesong er med');
    expect(tekst).toContain('senest 24 timer før prøveperioden er over');
    expect(screen.getByText(nb.ProvGratisArk.tekstStartBetinget)).toBeTruthy();
  });

  it('passet uten gratisuke i appen: ingen prøve, ingen frist å flytte — samme vilkår som før', () => {
    iAppen = true;
    lofte = { kjent: true, season_pass: PASS_UTEN_PROVE, premium: MAANED };
    rendrer('start');
    expect(screen.getByText(fyll(nb.ProvGratisArk.passVilkaar, { dato: DATO, dekning: nb.ProvGratisArk.passDekningHost }))).toBeTruthy();
    expect(screen.queryByText(/24 timer/)).toBeNull();
  });

  it('app-utgavene skiller seg fra nettutgavene bare i fristen, på begge språk', () => {
    for (const [katalog, nett, app] of [
      [nb, 'før {forsteBelastning}.', 'senest 24 timer før prøveperioden er over.'],
      [sv, 'före {forsteBelastning}.', 'senast 24 timmar innan provperioden är slut.']
    ] as const) {
      const a = katalog.ProvGratisArk;
      expect(a.passVilkaarProveApp).toBe(a.passVilkaarProve.replace(nett, app));
    }
    expect(nb.ProvGratisArk.passVilkaarProveUkjentLengdeApp).toBe(
      nb.ProvGratisArk.passVilkaarProveUkjentLengde.replace('før prøveperioden er over.', 'senest 24 timer før prøveperioden er over.')
    );
    expect(sv.ProvGratisArk.passVilkaarProveUkjentLengdeApp).toBe(
      sv.ProvGratisArk.passVilkaarProveUkjentLengde.replace('innan provperioden är slut.', 'senast 24 timmar innan provperioden är slut.')
    );
  });
});
