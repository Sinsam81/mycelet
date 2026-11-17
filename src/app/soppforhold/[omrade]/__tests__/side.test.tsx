import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { SoppforholdRegion } from '../../hent-regioner';

/**
 * Områdesidene skrives på LANDETS språk — /soppforhold/goteborg er svensk for
 * alle. Resten av dokumentet følger den besøkende, så siden må selv si hvilket
 * språk innholdet har: uten det fikk en crawler eller skjermleser lang="nb"
 * rundt svensk tekst, og delingskortet manglet og:locale (Next erstatter
 * rot-layoutens openGraph-objekt i sin helhet).
 *
 * Og varselboksen er selve påmeldingsskjemaet: svaret fra påmeldingsruta
 * (?status=…#varsel) vises her, over skjemaet.
 *
 * Datoen er låst til januar og alle tallene er lave. Da er siden i
 * «utenom sesongen»-tilstanden og utelater ukestripen — som ellers ville hentet
 * vær. Ingen nettverkskall i testen uansett: værmodulene er erstattet.
 */

let regioner: SoppforholdRegion[] = [];
let rasterdato: string | null = '2026-01-15';

vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));
vi.mock('@/components/bruk/RegistrerBruksdag', () => ({ RegistrerBruksdag: () => null }));
vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));
vi.mock('@/lib/weather/forecast', () => ({ fetchDailyForecast: async () => null }));
vi.mock('../../hent-regioner', async () => {
  const ekte = await vi.importActual<typeof import('../../hent-regioner')>('../../hent-regioner');
  return { ...ekte, hentRegioner: async () => ({ tileDate: rasterdato, regions: regioner }) };
});

import OmradePage, { generateMetadata } from '../page';

const region = (name: string, country: 'NO' | 'SE'): SoppforholdRegion => ({
  name,
  country,
  score: 3,
  cells: 20,
  leadingSpecies: null,
  leadingInSeason: null,
  verdict: null
});

const props = (omrade: string, status?: string) => ({
  params: Promise.resolve({ omrade }),
  searchParams: Promise.resolve(status ? { status } : {})
});

async function side(omrade: string, status?: string): Promise<string> {
  return renderToStaticMarkup(await OmradePage(props(omrade, status)));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  rasterdato = '2026-01-15';
  regioner = [region('Oslo', 'NO'), region('Bergen', 'NO'), region('Göteborg', 'SE'), region('Stockholm', 'SE')];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('områdesidens metadata følger landet', () => {
  it('svensk område: svensk tittel, og:locale sv_SE og nettstedsnavnet', async () => {
    const meta = await generateMetadata(props('goteborg'));
    expect(meta.title).toBe('Svampläget i Göteborg idag — uppdateras varje dag');
    expect(meta.alternates?.canonical).toBe('https://www.mycelet.com/soppforhold/goteborg');
    expect(meta.openGraph).toMatchObject({
      title: 'Svampläget i Göteborg idag',
      url: 'https://www.mycelet.com/soppforhold/goteborg',
      type: 'website',
      siteName: 'Mycelet',
      locale: 'sv_SE'
    });
  });

  it('norsk område: nb_NO — også når leseren er svensk, for siden er norsk', async () => {
    const meta = await generateMetadata(props('oslo'));
    expect(meta.title).toBe('Soppforhold i Oslo i dag — oppdatert daglig');
    expect(meta.openGraph).toMatchObject({ siteName: 'Mycelet', locale: 'nb_NO' });
  });

  it('delingsbildet versjoneres fortsatt med rasterdatoen', async () => {
    const meta = await generateMetadata(props('oslo'));
    const bilder = (meta.openGraph as { images?: Array<{ url: string }> }).images ?? [];
    expect(bilder).toHaveLength(1);
    expect(bilder[0].url).toBe('https://www.mycelet.com/soppforhold/oslo/opengraph-image?d=2026-01-15');
    rasterdato = null;
    const uten = await generateMetadata(props('oslo'));
    expect((uten.openGraph as { images: Array<{ url: string }> }).images[0].url).toBe(
      'https://www.mycelet.com/soppforhold/oslo/opengraph-image'
    );
  });

  it('delingsbildets alt-tekst står i sidens egne bildeoppføringer, på landets språk', async () => {
    // Bildefilas `export const alt` sendes ikke ut når siden setter
    // openGraph.images selv — den sto som en norsk konstant uten å nå noen.
    const alt = async (omrade: string) =>
      ((await generateMetadata(props(omrade))).openGraph as { images: Array<{ alt?: string }> }).images[0].alt;
    expect(await alt('goteborg')).toBe('Svampläget i Göteborg idag, som tal från 0 till 100');
    expect(await alt('oslo')).toBe('Soppforhold i Oslo i dag, som tall fra 0 til 100');
    expect(await alt('goteborg')).not.toMatch(/[æøÆØ]/);
  });

  it('ukjent område gir ingen metadata (siden svarer 404)', async () => {
    expect(await generateMetadata(props('atlantis'))).toEqual({});
  });
});

describe('områdesidens innhold sier selv hvilket språk det har', () => {
  it('svensk område: <article lang="sv">', async () => {
    const html = await side('goteborg');
    expect(html).toMatch(/<article[^>]*\slang="sv"/);
    expect(html).toContain('Svampläget i Göteborg idag');
  });

  it('norsk område: <article lang="nb"> — satt i begge retninger', async () => {
    const html = await side('oslo');
    expect(html).toMatch(/<article[^>]*\slang="nb"/);
    expect(html).toContain('Soppforhold i Oslo i dag');
  });

  it('JSON-LD sier det samme språket som artikkelen', async () => {
    expect(await side('goteborg')).toContain('"inLanguage":"sv"');
    expect(await side('oslo')).toContain('"inLanguage":"nb"');
  });
});

describe('varselboksen på områdesiden', () => {
  it('er påmeldingsskjemaet, med området ferdig utfylt og svaret bedt tilbake hit', async () => {
    const html = await side('goteborg');
    expect(html).toContain('id="varsel"');
    expect(html).toContain('action="/api/soppvarsel/pamelding"');
    expect(html).toContain('<input type="hidden" name="region" value="Göteborg"/>');
    expect(html).toContain('<input type="hidden" name="locale" value="sv"/>');
    expect(html).toContain('<input type="hidden" name="retur" value="goteborg"/>');
    // Uten ?status= står ingen statuslinje over skjemaet.
    expect(html).not.toContain('role="status"');
  });

  it('?status=sendt: «sjekk innboksen» på sidens språk, og skjemaet er borte', async () => {
    const html = await side('goteborg', 'sendt');
    expect(html).toContain('Kolla inkorgen');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<form');

    const norsk = await side('oslo', 'sendt');
    expect(norsk).toContain('Sjekk innboksen');
    expect(norsk).not.toContain('<form');
  });

  it('?status=sendt: den som skrev feil adresse har en vei tilbake til skjemaet', async () => {
    // Samme side uten ?status= — der står skjemaet igjen.
    expect(await side('oslo', 'sendt')).toMatch(
      /<a[^>]*href="\/soppforhold\/oslo#varsel"[^>]*>Skrev du feil adresse\? Prøv igjen\.<\/a>/
    );
    expect(await side('goteborg', 'sendt')).toMatch(
      /<a[^>]*href="\/soppforhold\/goteborg#varsel"[^>]*>Skrev du fel adress\? Försök igen\.<\/a>/
    );
    // Når skjemaet står der, trengs ingen slik lenke.
    expect(await side('oslo')).not.toContain('Skrev du feil adresse');
    expect(await side('oslo', 'ugyldig')).not.toContain('Skrev du feil adresse');
  });

  it('?status=ugyldig / for-mange / feil: beskjeden står over skjemaet, som fortsatt er der', async () => {
    const ugyldig = await side('oslo', 'ugyldig');
    expect(ugyldig).toContain('E-postadressen ser ikke riktig ut');
    // Området er gitt av siden — rådet om å velge et område hører ikke hjemme her.
    expect(ugyldig).not.toContain('valgt et område');
    expect(ugyldig).toContain('<form');
    expect(ugyldig.indexOf('role="status"')).toBeLessThan(ugyldig.indexOf('<form'));

    expect(await side('oslo', 'for-mange')).toContain('For mange forsøk herfra');
    expect(await side('goteborg', 'feil')).toContain('Något gick fel hos oss');
  });

  it('?status=bekreftet: kvitteringen vises, og ingenting ber om en ny påmelding', async () => {
    const html = await side('oslo', 'bekreftet');
    expect(html).toContain('id="pameldt"');
    expect(html).toContain('Du er påmeldt soppvarselet for Oslo');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('id="varsel"');
  });

  it('en ukjent statusverdi blir aldri til tekst på siden', async () => {
    const html = await side('oslo', '<script>alert(1)</script>');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('role="status"');
    expect(html).toContain('<form');
  });
});
