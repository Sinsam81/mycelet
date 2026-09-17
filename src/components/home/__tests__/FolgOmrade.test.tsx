// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FolgOmrade } from '../FolgOmrade';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { FOLG_OMRADE_KILDE, FOLG_OMRADE_NOKKEL, avvisningsVerdi } from '@/lib/alerts/folg-omrade';
import { meldTilbudsarkApent, nullstillTilbudsark } from '@/lib/billing/tilbudsark-apent';

/**
 * Trykket testes HER og ikke i nettleseren: et ekte trykk i en innlogget økt
 * ville laget et ekte varselabonnement i produksjonsdatabasen (det finnes bare
 * én). Her er fetch mocket, og vi sjekker kroppen som ville gått ut.
 */

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>
}));

const REGIONER = [
  { navn: 'Oslo', land: 'NO' },
  { navn: 'Bergen', land: 'NO' },
  { navn: 'Göteborg', land: 'SE' }
];

const fetchMock = vi.fn();

function svarUtenAbonnement() {
  fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
    if (!init?.method || init.method === 'GET') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ abonnement: null, regioner: REGIONER }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

function rendrer(props: Partial<React.ComponentProps<typeof FolgOmrade>> = {}, sprak: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <FolgOmrade innlogget folgerAlt={false} omrade="Oslo" posisjonsKilde="egen" {...props} />
    </NextIntlClientProvider>,
    // React kjører hver effekt to ganger her, som i utviklingsmodus. Uten
    // levende-refen i komponenten kastet opprydningen etter FØRSTE kjøring
    // svaret, mens vakten hindret andre kjøring i å hente på nytt — og stripa
    // viste seg aldri lokalt. Testene kjører derfor alltid med dobbel montering.
    { reactStrictMode: true }
  );
}

const kroppen = () => {
  const kall = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
  return kall ? JSON.parse(kall[1].body as string) : null;
};

beforeEach(() => {
  window.localStorage.clear();
  nullstillTilbudsark();
  fetchMock.mockReset();
  svarUtenAbonnement();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FolgOmrade', () => {
  it('navngir området og lover hyppighet og vei ut FØR knappen', async () => {
    rendrer();
    expect(await screen.findByRole('button', { name: 'Følg Oslo' })).toBeTruthy();
    expect(
      screen.getByText(
        'Vi sender deg én e-post når soppforholdene i Oslo snur. Aldri mer enn én i uka, og avmelding i hver e-post.'
      )
    ).toBeTruthy();
  });

  it('sender område og kilde ved trykk, og bekrefter med en vei videre', async () => {
    rendrer();
    fireEvent.click(await screen.findByRole('button', { name: 'Følg Oslo' }));

    await waitFor(() => expect(kroppen()).not.toBe(null));
    expect(kroppen()).toEqual({ region: 'Oslo', active: true, kilde: FOLG_OMRADE_KILDE });

    const bekreftelse = await screen.findByText(/Du følger Oslo/);
    expect(bekreftelse.textContent).toContain('Du kan endre eller avslutte på profilen din.');
    expect(screen.getByRole('link', { name: 'profilen din' }).getAttribute('href')).toBe('/profile?vis=soppvarsel');
  });

  it('blir stående med en tydelig beskjed når lagringen feiler — aldri en stille suksess', async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (!init?.method || init.method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ abonnement: null, regioner: REGIONER }) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'nei' }) });
    });
    rendrer();
    fireEvent.click(await screen.findByRole('button', { name: 'Følg Oslo' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Du følger/)).toBe(null);
    expect(screen.getByRole('button', { name: 'Følg Oslo' })).toBeTruthy();
  });

  it('«Ikke nå» skjuler stripa og lagrer pausen', async () => {
    rendrer();
    fireEvent.click(await screen.findByRole('button', { name: 'Ikke nå' }));
    expect(screen.queryByRole('button', { name: 'Følg Oslo' })).toBe(null);
    expect(window.localStorage.getItem(FOLG_OMRADE_NOKKEL)).toBeTruthy();
  });

  it('spør uten å navngi noe når kortet står på standardområdet', async () => {
    rendrer({ posisjonsKilde: 'standard', omrade: 'Oslo' });
    expect(await screen.findByText('Hvor plukker du?')).toBeTruthy();
    // Ingen knapp og intet løfte før brukeren har valgt selv.
    expect(screen.queryByRole('button', { name: /Følg / })).toBe(null);
    expect(screen.queryByText(/soppforholdene i Oslo/)).toBe(null);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bergen' } });
    expect(screen.getByText(/soppforholdene i Bergen/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Følg Bergen' }));
    await waitFor(() => expect(kroppen()?.region).toBe('Bergen'));
  });

  it('«Et annet område» åpner velgeren fra den navngitte varianten', async () => {
    rendrer();
    fireEvent.click(await screen.findByRole('button', { name: 'Et annet område' }));
    expect(screen.getByText('Hvor plukker du?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Følg Oslo' })).toBe(null);
  });

  it('spør ikke — og henter ingenting — når serveren alt så et abonnement', async () => {
    rendrer({ folgerAlt: true });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Følg/ })).toBe(null);
  });

  it('spør ikke når en kontoløs påmelding ble adoptert i det samme kallet', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ abonnement: { region: 'Bergen', active: true }, regioner: REGIONER })
      })
    );
    rendrer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Følg/ })).toBe(null);
  });

  it('henter ingenting når «Ikke nå» fortsatt gjelder', async () => {
    window.localStorage.setItem(FOLG_OMRADE_NOKKEL, avvisningsVerdi(Date.now() - 3 * 86_400_000));
    rendrer();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holder seg unna skjermen mens prøvetilbudsarket ligger over', async () => {
    const lukk = meldTilbudsarkApent();
    rendrer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Følg Oslo' })).toBe(null);
    // Arket lukkes: stripa er klar uten en ny runde.
    lukk();
    expect(await screen.findByRole('button', { name: 'Følg Oslo' })).toBeTruthy();
  });

  it('svensk: følger, mejl och avregistrering i varje mejl', async () => {
    rendrer({ omrade: 'Göteborg' }, 'sv');
    expect(await screen.findByRole('button', { name: 'Följ Göteborg' })).toBeTruthy();
    expect(
      screen.getByText(
        'Vi mejlar dig när svampläget i Göteborg vänder. Aldrig mer än ett mejl i veckan, och avregistrering i varje mejl.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inte nu' })).toBeTruthy();
  });

  it('svensk: frågar «Var plockar du?» utan att namnge Stockholm', async () => {
    rendrer({ posisjonsKilde: 'standard', omrade: 'Stockholm' }, 'sv');
    expect(await screen.findByText('Var plockar du?')).toBeTruthy();
    expect(screen.queryByText(/Stockholm/)).toBe(null);
  });
});
