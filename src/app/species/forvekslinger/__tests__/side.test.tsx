// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { TRENER_SELECT, type ForvekslingsArtRad, type ForvekslingsRad } from '@/lib/species/forvekslingstrener';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Siden er limet mellom databasen og treneren, og det er her to ting kan gå
 * galt uten at noen av delene hver for seg gjør feil:
 *
 *  · språket tres ikke gjennom til byggTrenerpar — da får en svensk leser den
 *    norske prosaen (akkurat den feilen artssiden og AI-resultatet har i dag)
 *  · et oppslag som feiler rendres som en tom trener — da leser siden som «vi
 *    har ingen farlige forvekslinger å vise»
 *
 * Testene kjører den ekte siden og den ekte treneren mot en falsk database.
 */

let sprak: 'nb' | 'sv' = 'nb';
const katalog = () => (sprak === 'sv' ? sv : nb);

vi.mock('next-intl/server', () => ({
  getLocale: async () => sprak,
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: sprak, messages: katalog() as never, namespace: namespace as never })
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

// PoisonHotlineLinks er en async serverkomponent og kan ikke rendres i jsdom.
// Klienttvillingen bygger de samme lenkene av de samme meldingene
// (byggGiftnummer), så testen ser fortsatt hvilke nummer hvert språk får.
vi.mock('@/components/safety/PoisonHotlineLinks', async () => {
  const { PoisonHotlineLinksClient } = await import('@/components/safety/PoisonHotlineLinksClient');
  return { PoisonHotlineLinks: PoisonHotlineLinksClient };
});

const warn = vi.fn();
vi.mock('@/lib/log', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

let svar: { data: ForvekslingsRad[] | null; error: { message: string } | null } = { data: [], error: null };
const kall = { tabell: '', select: '', kolonne: '', verdier: [] as string[], limit: 0 };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (tabell: string) => {
      kall.tabell = tabell;
      return {
        select: (select: string) => {
          kall.select = select;
          return {
            in: (kolonne: string, verdier: string[]) => {
              kall.kolonne = kolonne;
              kall.verdier = verdier;
              return {
                limit: async (limit: number) => {
                  kall.limit = limit;
                  return svar;
                }
              };
            }
          };
        }
      };
    }
  })
}));

const { default: ForvekslingerPage, generateMetadata } = await import('../page');

function art(id: number, norsk: string, svensk: string, latin: string, spiselighet: string): ForvekslingsArtRad {
  return {
    id,
    norwegian_name: norsk,
    swedish_name: svensk,
    latin_name: latin,
    edibility: spiselighet,
    primary_image_url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${id}/Art_${id}.jpg/330px-Art_${id}.jpg`,
    primary_image_photographer: `Testfotograf ${id}`,
    primary_image_license: 'CC BY-SA 3.0',
    primary_image_source_url: `https://commons.wikimedia.org/wiki/File:Art_${id}.jpg`
  };
}

const sjampinjong = art(10, 'Sjampinjong', 'Ängschampinjon', 'Agaricus campestris', 'edible');
const hvitFluesopp = art(16, 'Hvit fluesopp', 'Vit flugsvamp', 'Amanita virosa', 'deadly');

const NORSK_LIKHET = 'Begge har hvit hatt og hvit stilk.';
const NORSK_SKILLE = 'Sjampinjong har ALLTID ROSA til SJOKOLADEBRUNE skiver. Hvis skivene er hvite — ikke spis.';

const RAD: ForvekslingsRad = {
  species_id: 10,
  look_alike_id: 16,
  danger_level: 'critical',
  similarity_description: NORSK_LIKHET,
  difference_description: NORSK_SKILLE,
  art: sjampinjong,
  forveksling: hvitFluesopp
};

async function tegn() {
  const side = await ForvekslingerPage();
  return render(
    <NextIntlClientProvider locale={sprak} messages={katalog() as never} timeZone="Europe/Oslo">
      {side}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  sprak = 'nb';
  svar = { data: [RAD], error: null };
  warn.mockReset();
  window.localStorage.clear();
});

afterEach(cleanup);

describe('/species/forvekslinger', () => {
  it('henter bare alvorlige forvekslinger, med begge artene og krediteringen', async () => {
    await tegn();
    expect(kall.tabell).toBe('look_alikes');
    expect(kall.select).toBe(TRENER_SELECT);
    expect(kall.kolonne).toBe('danger_level');
    expect(kall.verdier).toEqual(['high', 'critical']);
    // Taket skal ligge godt over antall rader, så ingen par faller ut i det stille.
    expect(kall.limit).toBeGreaterThanOrEqual(200);
  });

  it('viser overskrift, den faste sikkerhetslinja, treneren og giftinformasjonen', async () => {
    await tegn();
    expect(screen.getByRole('heading', { level: 1, name: 'Kjenn forvekslingen' })).toBeTruthy();
    expect(screen.getByText(/Et bilde er aldri nok\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start en runde' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tilbake til biblioteket' }).getAttribute('href')).toBe('/species');

    const gift = screen.getByText(/Mistanke om soppforgiftning\? Ring/);
    expect(gift.textContent).toContain('Giftinformasjonen');
    expect(within(gift).getByRole('link', { name: '22 59 13 00' }).getAttribute('href')).toBe('tel:+4722591300');
    expect(warn).not.toHaveBeenCalled();
  });

  it('norsk: avsløringen viser kjennetegnene fra basen', async () => {
    await tegn();
    fireEvent.click(screen.getByRole('button', { name: 'Start en runde' }));
    fireEvent.click(screen.getByRole('button', { name: /Hvit fluesopp/ }));
    expect(document.body.textContent).toContain(NORSK_SKILLE);
    expect(document.body.textContent).toContain(NORSK_LIKHET);
  });

  it('svensk: den norske prosaen når aldri siden — heller ikke etter svaret', async () => {
    sprak = 'sv';
    await tegn();
    expect(screen.getByRole('heading', { level: 1, name: 'Lär känna förväxlingsarterna' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Starta en runda' }));
    fireEvent.click(screen.getByRole('button', { name: /Vit flugsvamp/ }));

    const tekst = document.body.textContent ?? '';
    expect(tekst).toContain('Rätt. Vit flugsvamp är giftsvampen av de två.');
    expect(tekst).toContain('än så länge bara på norska');
    expect(tekst).not.toContain(NORSK_SKILLE);
    expect(tekst).not.toContain(NORSK_LIKHET);
    expect(tekst).not.toContain('skiver');
    // Heller ikke de norske artsnavnene.
    expect(tekst).not.toContain('Hvit fluesopp');
    expect(tekst).not.toContain('Sjampinjong');
  });

  it('svensk: Giftinformationscentralen med 112 og 010-nummeret — ikke det norske nummeret', async () => {
    sprak = 'sv';
    await tegn();
    const gift = screen.getByText(/Misstänker du svampförgiftning\? Ring/);
    expect(gift.textContent).toContain('Giftinformationscentralen');
    expect(within(gift).getByRole('link', { name: '112 (akut)' }).getAttribute('href')).toBe('tel:112');
    expect(within(gift).getByRole('link', { name: '010-456 67 00' }).getAttribute('href')).toBe('tel:+46104566700');
    expect(document.body.textContent).not.toContain('22 59 13 00');
  });

  it('et oppslag som feiler sies høyt — det rendres ikke som en tom trener', async () => {
    svar = { data: null, error: { message: 'connection refused' } };
    await tegn();
    expect(screen.getByRole('alert').textContent).toContain('Vi klarte ikke å hente forvekslingsparene akkurat nå.');
    expect(screen.queryByRole('button', { name: 'Start en runde' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ingen par å øve på akkurat nå' })).toBeNull();
    // Sikkerhetslinja og giftinformasjonen står der uansett.
    expect(screen.getByText(/Et bilde er aldri nok\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: '22 59 13 00' })).toBeTruthy();
    expect(warn).toHaveBeenCalledWith('forvekslingstrener.hent_feilet', { message: 'connection refused' });
  });

  it('ingen rader, eller ingen som oppfyller kravene, gir tom-tilstanden', async () => {
    const utenBilde: ForvekslingsRad = { ...RAD, forveksling: { ...hvitFluesopp, primary_image_url: null } };
    for (const data of [[], null, [utenBilde]]) {
      svar = { data, error: null };
      await tegn();
      expect(screen.getByRole('heading', { name: 'Ingen par å øve på akkurat nå' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start en runde' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();
    }
  });
});

describe('metadata for /species/forvekslinger', () => {
  it('har egen tittel og beskrivelse på norsk, uten merkenavnet i tittelen', async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe(nb.Forvekslingstrener.metaTitle);
    expect(String(meta.title)).not.toContain('Mycelet');
    expect(meta.description).toBe(nb.Forvekslingstrener.metaDescription);
    expect(meta.alternates?.canonical).toBe('https://www.mycelet.com/species/forvekslinger');
    expect(meta.openGraph).toMatchObject({ locale: 'nb_NO', siteName: 'Mycelet', title: nb.Forvekslingstrener.metaTitle });
  });

  it('følger leserens språk', async () => {
    sprak = 'sv';
    const meta = await generateMetadata();
    expect(meta.title).toBe(sv.Forvekslingstrener.metaTitle);
    expect(meta.description).toBe(sv.Forvekslingstrener.metaDescription);
    expect(meta.openGraph).toMatchObject({ locale: 'sv_SE' });
  });
});
