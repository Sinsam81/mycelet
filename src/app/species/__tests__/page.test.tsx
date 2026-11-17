// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { timeZoneForLocale } from '@/i18n/config';
import { ARTSKATALOG } from '@/lib/species/__tests__/artskatalog-fixture';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * /species ble rendret helt i nettleseren: HTML-en en søkemotor eller en
 * AI-svartjeneste fikk, hadde ingen arter og ingen lenker til artssidene.
 * Testene holder på at
 *  1. serverens HTML har et kort og en lenke per art, og en ItemList med navn og
 *     adresser — aldri spiselighet,
 *  2. nettleseren tar over samme HTML uten avvik og uten å hente lista på nytt,
 *  3. en feil på serveren gir dagens oppførsel (nettleseren henter selv), ikke
 *     en feilside eller «0 arter».
 */
const mock = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  const svar: { data: unknown; error: unknown } = { data: [], error: null };
  const lag = () => {
    const limit = vi.fn(() => Promise.resolve(svar));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn((_felter: string) => ({ order }));
    const from = vi.fn((_tabell: string) => ({ select }));
    return { from, select };
  };
  return { svar, server: lag(), nettleser: lag(), locale: { verdi: 'nb' as 'nb' | 'sv' } };
});

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from: mock.server.from }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mock.nettleser.from }) }));
vi.mock('next-intl/server', async () => {
  const nbM = (await import('../../../../messages/nb.json')).default;
  const svM = (await import('../../../../messages/sv.json')).default;
  return {
    getLocale: async () => mock.locale.verdi,
    getTranslations: async (namespace: 'Species') => {
      const katalog = (mock.locale.verdi === 'sv' ? svM : nbM)[namespace] as Record<string, string>;
      return (key: string) => katalog[key];
    }
  };
});
// Toppmeny og bunnmeny har sine egne tester og egne avhengigheter (innlogging,
// ruter); her er det innholdet som teller.
vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

const { default: SpeciesPage } = await import('../page');

function medTilbydere(barn: ReactNode, klient: QueryClient) {
  const locale = mock.locale.verdi;
  return (
    <QueryClientProvider client={klient}>
      <NextIntlClientProvider locale={locale} timeZone={timeZoneForLocale(locale)} messages={locale === 'sv' ? sv : nb}>
        {barn}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const nyKlient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Serverens HTML, slik siden ville sendt den. */
async function serverHtml() {
  const tre = await SpeciesPage();
  return { tre, html: renderToString(medTilbydere(tre, nyKlient())) };
}

function jsonLd(html: string) {
  const funnet = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  return funnet ? JSON.parse(funnet[1]) : null;
}

let rot: Root | null = null;

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  mock.svar.data = ARTSKATALOG.map((art) => ({ ...art, primary_image_url: `https://bilder.example.org/${art.id}.jpg` }));
  mock.svar.error = null;
  mock.locale.verdi = 'nb';
  for (const klient of [mock.server, mock.nettleser]) {
    klient.from.mockClear();
    klient.select.mockClear();
  }
});

afterEach(() => {
  act(() => rot?.unmount());
  rot = null;
  document.body.innerHTML = '';
});

describe('serverens HTML', () => {
  it('har et kort med lenke for hver art, og ingen «laster»', async () => {
    const { html } = await serverHtml();
    for (const art of ARTSKATALOG) {
      expect(html, art.norwegian_name).toContain(`href="/species/${art.id}"`);
    }
    expect(html).toContain('alt="Steinsopp"');
    expect(html).not.toContain(nb.Species.loading);
    expect(html).toContain(nb.Species.countSummary.replace('{count}', String(ARTSKATALOG.length)));
    // Sikkerhetsnoten står fortsatt før det første kortet med spiselighetsmerke.
    expect(html.indexOf('/sikkerhet')).toBeGreaterThan(-1);
    expect(html.indexOf('/sikkerhet')).toBeLessThan(html.indexOf('aspect-square'));
    // Treneren er fortsatt lenket fra biblioteket.
    expect(html).toContain('href="/species/forvekslinger"');
  });

  it('henter med serverklienten og samme felter som nettleseren', async () => {
    await serverHtml();
    expect(mock.server.from).toHaveBeenCalledWith('mushroom_species');
    const felter = mock.server.select.mock.calls[0][0].split(',');
    for (const felt of ['norwegian_name', 'swedish_name', 'latin_name', 'english_name', 'synonyms_text', 'habitat', 'primary_image_url']) {
      expect(felter, felt).toContain(felt);
    }
    // Beskrivelsen leses ikke av kort, søk eller ItemList, men var det lengste
    // feltet i HTML-en og i RSC-lasten ved hver navigering til /species.
    expect(felter).not.toContain('description');
    expect(mock.nettleser.from).not.toHaveBeenCalled();
  });

  it('ItemList med navn og adresse per art — og ingen spiselighet', async () => {
    const { html } = await serverHtml();
    const data = jsonLd(html);
    expect(data['@type']).toBe('ItemList');
    expect(data.numberOfItems).toBe(ARTSKATALOG.length);
    expect(data.itemListElement).toHaveLength(ARTSKATALOG.length);
    expect(data.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Ametystsopp',
      url: `https://www.mycelet.com/species/${ARTSKATALOG.find((a) => a.norwegian_name === 'Ametystsopp')?.id}`
    });
    for (const element of data.itemListElement) {
      expect(Object.keys(element).sort()).toEqual(['@type', 'name', 'position', 'url']);
    }
    const tekst = JSON.stringify(data);
    for (const ord of ['edib', 'spiselig', 'Spiselig', 'giftig', 'ätlig', 'Ätlig']) {
      expect(tekst).not.toContain(ord);
    }
  });

  it('svensk leser: svenske navn og svensk rekkefølge, i HTML-en og i lista', async () => {
    mock.locale.verdi = 'sv';
    const { html } = await serverHtml();
    expect(html).toContain('alt="Karljohan"');
    const navn = jsonLd(html).itemListElement.map((e: { name: string }) => e.name);
    expect(navn).toContain('Karljohan');
    expect(navn).not.toContain('Steinsopp');
    expect(navn).toEqual([...navn].sort((a: string, b: string) => a.localeCompare(b, 'sv')));
  });

  it('et navn med «</script>» kan ikke bryte ut av JSON-LD-taggen', async () => {
    mock.svar.data = [{ ...ARTSKATALOG[0], norwegian_name: 'Ond</script><b>sopp' }];
    const { html } = await serverHtml();
    expect(html).not.toContain('Ond</script>');
    expect(jsonLd(html).itemListElement[0].name).toBe('Ond</script><b>sopp');
  });
});

describe('nettleseren tar over', () => {
  it('samme HTML, ingen avvik og ingen ny henting', async () => {
    const { tre, html } = await serverHtml();
    const beholder = document.createElement('div');
    beholder.innerHTML = html;
    document.body.appendChild(beholder);

    const avvik: unknown[] = [];
    const feil = vi.spyOn(console, 'error').mockImplementation((...args) => avvik.push(args));
    try {
      await act(async () => {
        rot = hydrateRoot(beholder, medTilbydere(tre, nyKlient()), {
          onRecoverableError: (e) => avvik.push(e)
        });
      });
      await act(async () => {
        await new Promise((ferdig) => setTimeout(ferdig, 20));
      });
    } finally {
      feil.mockRestore();
    }
    expect(avvik).toEqual([]);
    expect(mock.nettleser.from).not.toHaveBeenCalled();
    expect(beholder.querySelectorAll('a[href^="/species/"]').length).toBe(ARTSKATALOG.length + 1);
  });

  it('månedsskiftet: serverens måned gjelder, ikke klokka i nettleseren', async () => {
    // Serveren rendrer 30. september kl. 23:59 Oslo-tid; nettleseren tar over
    // ett minutt senere, i oktober. «Kun i sesong nå» skal svare likt.
    vi.setSystemTime(new Date('2026-09-30T21:59:00Z'));
    const { tre } = await serverHtml();
    vi.setSystemTime(new Date('2026-09-30T22:01:00Z'));
    const element = tre.props.children[1];
    expect(element.props.maaned).toBe(9);
  });
});

describe('når serveren ikke får lista', () => {
  it('ingen feilside og ingen «0 arter»: nettleseren henter selv, som før', async () => {
    mock.svar.data = null;
    mock.svar.error = new Error('nettverk');
    const { html } = await serverHtml();
    expect(html).toContain(nb.Species.loading);
    expect(html).not.toContain(nb.Species.noMatches);
    expect(html).not.toContain('application/ld+json');

    // Nettleseren prøver selv, og denne gangen svarer basen.
    const { tre } = await serverHtml();
    mock.svar.data = [...ARTSKATALOG];
    mock.svar.error = null;
    const beholder = document.createElement('div');
    beholder.innerHTML = html;
    document.body.appendChild(beholder);
    await act(async () => {
      rot = hydrateRoot(beholder, medTilbydere(tre, nyKlient()));
    });
    await act(async () => {
      await new Promise((ferdig) => setTimeout(ferdig, 20));
    });
    expect(mock.nettleser.from).toHaveBeenCalledTimes(1);
    expect(beholder.querySelectorAll('a[href^="/species/"]').length).toBe(ARTSKATALOG.length + 1);
  });

  it('en server som kaster i stedet for å svare gir også klientens egen henting', async () => {
    mock.server.from.mockImplementationOnce(() => {
      throw new Error('ingen nøkkel');
    });
    const { html } = await serverHtml();
    expect(html).toContain(nb.Species.loading);
    expect(html).not.toContain('href="/species/1"');
  });
});
