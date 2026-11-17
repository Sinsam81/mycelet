// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import GlobalError from '../global-error';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
// Stilarket betyr ingenting for språket. Uten mocken drar Vite det gjennom
// PostCSS, med et Browserslist-varsel i testutskriften.
vi.mock('../globals.css', () => ({}));

/**
 * Språket på feilsiden for kast i selve rot-layouten.
 *
 * NextIntlClientProvider er ikke montert der (se filhodet i global-error.tsx),
 * så siden velger språk selv, etter samme regel som serveren (getUserLocale)
 * og offline-siden: MYCELET_LOCALE-cookien når den er gyldig, ellers svensk
 * når svensk står hvor som helst i nettleserens språkliste, ellers norsk.
 * Før 2a023cd så siden bare på det første språket, så en nettleser med
 * ['en-US', 'sv-SE'] fikk svensk app og norsk feilside. Regelen er testet for
 * serveren og offline-siden; denne fila tester kopien her.
 */

const SVENSK = { lang: 'sv', tittel: 'Något gick fel', igjen: 'Försök igen', hjem: 'Till startsidan' };
const NORSK = { lang: 'nb', tittel: 'Noe gikk galt', igjen: 'Prøv igjen', hjem: 'Til forsiden' };

type Oppsett = {
  /** Verdien i MYCELET_LOCALE-cookien. Utelatt: ingen cookie, slik de fleste svenske brukerne har det. */
  cookie?: string;
  /** navigator.languages. */
  sprak: readonly string[];
  /** navigator.language. Som i en ekte nettleser er det første språket i lista, om ikke annet er sagt. */
  hovedsprak?: string;
};

let konsollfeil: MockInstance<typeof console.error>;

beforeEach(() => {
  // Siden logger selv feilen den viser (global_error). Alt annet på
  // console.error er React som sier fra om monteringen — se testene.
  konsollfeil = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.cookie = 'MYCELET_LOCALE=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

function visFeilsiden({ cookie, sprak, hovedsprak = sprak[0] ?? 'en-US' }: Oppsett) {
  if (cookie !== undefined) document.cookie = `MYCELET_LOCALE=${cookie}`;
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(sprak);
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(hovedsprak);

  // Siden rendrer sin egen <html> og <body>, så den monteres på dokumentet
  // slik Next gjør, ikke i en <div>.
  render(
    <GlobalError error={Object.assign(new Error('rot-layouten kastet'), { digest: 'test' })} reset={() => {}} />,
    { container: document }
  );

  return {
    lang: document.documentElement.lang,
    tittel: screen.getByRole('heading', { level: 1 }).textContent,
    igjen: screen.getByRole('button').textContent,
    hjem: screen.getByRole('link').textContent
  };
}

const TILFELLER: Array<{ navn: string; oppsett: Oppsett; venter: typeof SVENSK }> = [
  {
    navn: 'svensk når svensk står bak et annet språk i nettleserens liste, uten cookie',
    oppsett: { sprak: ['en-US', 'sv-SE'] },
    venter: SVENSK
  },
  {
    navn: 'norsk når cookien sier nb, selv om nettleseren også er svensk',
    oppsett: { cookie: 'nb', sprak: ['en-US', 'sv-SE'] },
    venter: NORSK
  },
  { navn: 'norsk for en norsk nettleser', oppsett: { sprak: ['nb-NO'] }, venter: NORSK },
  {
    navn: 'svensk når cookien sier sv, selv om nettleseren er norsk',
    oppsett: { cookie: 'sv', sprak: ['nb-NO'] },
    venter: SVENSK
  },
  {
    navn: 'en cookie med et annet språk enn nb og sv overses',
    oppsett: { cookie: 'en', sprak: ['en-US', 'sv-SE'] },
    venter: SVENSK
  },
  {
    navn: 'navigator.language avgjør når nettleseren ikke har en språkliste',
    oppsett: { sprak: [], hovedsprak: 'sv-SE' },
    venter: SVENSK
  }
];

describe('global-error: språket', () => {
  for (const { navn, oppsett, venter } of TILFELLER) {
    it(navn, () => {
      expect(visFeilsiden(oppsett)).toEqual(venter);
      // Bare sidens egen logglinje: et varsel fra React her betyr at siden
      // ikke ble montert slik den blir i appen, og da sier testen ingenting.
      expect(konsollfeil.mock.calls.map(([forste]) => forste)).toEqual(['global_error']);
    });
  }
});
