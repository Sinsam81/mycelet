// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  BestRegionsCard,
  REGIONER_FERSK_MS,
  REGIONER_NYE_FORSOK,
  hentBesteRegioner,
  rasterdag,
  regionerNokkel,
  skalProveRegionerIgjen
} from '../BestRegionsCard';
import { meldFolgerOmrade } from '../folger-omrade-hendelse';
import { Hentefeil } from '../hentefeil';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

const REGIONER = [
  { name: 'Bergen', country: 'NO', score: 81, leadingSpecies: 'Kantarell', verdict: 'Gode forhold', lat: 60.39, lng: 5.32 },
  { name: 'Oslo', country: 'NO', score: 34, leadingSpecies: null, verdict: 'Svake forhold', lat: 59.91, lng: 10.75 },
  { name: 'Göteborg', country: 'SE', score: 62, leadingSpecies: 'Kantarell', verdict: 'Bra läge', lat: 57.71, lng: 11.97 }
];

const fetchMock = vi.fn();

/** Fast klokke: nøkkelen i minnet bærer rasterdagen, så testene skal ikke avhenge av når de kjøres. */
const KLOKKA = new Date('2026-09-15T08:00:00Z');
const DAG = '2026-09-15';

/** Appens klient, men uten ventetid mellom forsøkene — ellers tar hver feiltest tre sekunder. */
const nyKlient = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });

function tegn(
  props: React.ComponentProps<typeof BestRegionsCard> = {},
  sprak: 'nb' | 'sv' = 'nb',
  klient: QueryClient = nyKlient()
) {
  return render(
    <QueryClientProvider client={klient}>
      <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
        <BestRegionsCard {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const svarMedRegioner = () =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tileDate: '2026-09-15', regions: REGIONER }) });
const svarMedStatus = (status: number) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: 'nei' }) });
/** De tre grå strekene kortet viser mens lista hentes. */
const skjelett = (rot: HTMLElement) => rot.querySelectorAll('.animate-pulse').length;

const varselLenke = () => screen.queryByRole('link', { name: /Få varsel på e-post/ });
const omradeLenke = () => screen.queryByRole('link', { name: /Alle områder/ });
/** Raden for et område. Navnet står etter flagget, så teksten må treffes med et mønster. */
const rad = (navn: string) => screen.queryByRole('link', { name: new RegExp(navn) });
const ventPaaRad = (navn: string) => screen.findByRole('link', { name: new RegExp(navn) });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(svarMedRegioner);
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(KLOKKA);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe('BestRegionsCard — varsel-lenka', () => {
  it('vises til en som ikke følger noe område', async () => {
    tegn();
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(varselLenke()?.getAttribute('href')).toBe('/profile?vis=soppvarsel');
    expect(omradeLenke()?.getAttribute('href')).toBe('/soppforhold');
  });

  it('vises ikke til en som alt følger et område — men veien til /soppforhold står', async () => {
    tegn({ folger: true });
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(varselLenke()).toBe(null);
    expect(omradeLenke()).not.toBe(null);
  });

  it('forsvinner i det brukeren begynner å følge et område fra stripa i forsidekortet', async () => {
    tegn();
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(varselLenke()).not.toBe(null);

    act(() => meldFolgerOmrade());
    expect(varselLenke()).toBe(null);
    expect(omradeLenke()).not.toBe(null);
  });
});

describe('BestRegionsCard — lista', () => {
  it('viser ett land om gangen, valgt etter språket', async () => {
    tegn();
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(rad('Oslo')).not.toBe(null);
    expect(rad('Göteborg')).toBe(null);
  });

  it('svensk: Sverige først', async () => {
    tegn({}, 'sv');
    expect(await ventPaaRad('Göteborg')).toBeTruthy();
    expect(rad('Bergen')).toBe(null);
  });
});

/**
 * Kortet holdt svaret i sin egen tilstand og hentet i en løs useEffect: hver
 * retur til forsiden monterte det tomt og spurte på nytt, og ett kall som
 * feilet tok kortet bort til neste gang forsiden ble åpnet. Nå går hentingen
 * gjennom appens QueryClient.
 */
describe('BestRegionsCard — hentingen', () => {
  it('spør på lesernes språk, og språket er en del av nøkkelen', async () => {
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/prediction/regions?locale=nb');
    expect(klient.getQueryData(regionerNokkel('nb', DAG))).toEqual(REGIONER);
    // Et svensk svar skal aldri kunne hentes ut av det norske mellomlageret.
    expect(klient.getQueryData(regionerNokkel('sv', DAG))).toBeUndefined();
    cleanup();

    tegn({}, 'sv', klient);
    expect(await ventPaaRad('Göteborg')).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/prediction/regions?locale=sv');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tilbake på forsiden innen et kvarter: lista står der med en gang, uten nytt kall', async () => {
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup(); // Hjem → Kart

    const { container } = tegn({}, 'nb', klient); // Kart → Hjem
    // Allerede i første tegning: ingen grå streker, ingen venting.
    expect(rad('Bergen')).not.toBe(null);
    expect(skjelett(container)).toBe(0);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('etter et kvarter: lista står der med en gang, og friskes opp i bakgrunnen', async () => {
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup();

    vi.setSystemTime(new Date(KLOKKA.getTime() + REGIONER_FERSK_MS + 1_000));
    const { container } = tegn({}, 'nb', klient);
    expect(rad('Bergen')).not.toBe(null);
    expect(skjelett(container)).toBe(0);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('et kall som feiler prøves igjen — kortet kommer, det forsvinner ikke', async () => {
    fetchMock.mockImplementationOnce(() => svarMedStatus(503));
    tegn();
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('feiler alle forsøkene, vises ingenting — ingen tom ramme med feilmelding', async () => {
    fetchMock.mockImplementation(() => svarMedStatus(503));
    const { container } = tegn();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1 + REGIONER_NYE_FORSOK));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('et nettverksbrudd regnes som en feil som er verdt et forsøk til', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    tegn();
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sier ruta nei (429), spør kortet ikke en gang til', async () => {
    fetchMock.mockImplementation(() => svarMedStatus(429));
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('feiler oppfriskningen i bakgrunnen, står lista som alt er på skjermen', async () => {
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup();

    fetchMock.mockImplementation(() => svarMedStatus(503));
    vi.setSystemTime(new Date(KLOKKA.getTime() + REGIONER_FERSK_MS + 1_000));
    tegn({}, 'nb', klient);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1 + 1 + REGIONER_NYE_FORSOK));
    await waitFor(() => expect(klient.getQueryState(regionerNokkel('nb', DAG))?.status).toBe('error'));
    expect(rad('Bergen')).not.toBe(null);
    expect(rad('Oslo')).not.toBe(null);
  });

  it('en åpning på en ny rasterdag tegner aldri gårsdagens liste under «i dag» — og uten dekning vises ingenting', async () => {
    // Appen står på Hjem om kvelden …
    vi.setSystemTime(new Date('2026-09-15T18:00:00Z'));
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup();

    // … og tas fram igjen i skogen neste morgen, uten dekning: Kart → Hjem.
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.setSystemTime(new Date('2026-09-16T06:00:00Z'));
    const { container } = tegn({}, 'nb', klient);
    // Kveldens liste ligger fortsatt i minnet, men under gårsdagens nøkkel:
    // den tegnes ikke, heller ikke i første tegning.
    expect(klient.getQueryData(regionerNokkel('nb', '2026-09-15'))).toEqual(REGIONER);
    expect(rad('Bergen')).toBe(null);
    expect(skjelett(container)).toBe(3);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1 + 1 + REGIONER_NYE_FORSOK));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('før nattens raster er kveldens liste fortsatt den nyeste som finnes: den står over midnatt', async () => {
    vi.setSystemTime(new Date('2026-09-15T23:55:00Z'));
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup();

    // Ti minutter senere, over midnatt UTC. Flisjobbene går først 01:15 og
    // 01:45, så ruta selv ville svart med nøyaktig det samme rasteret.
    vi.setSystemTime(new Date('2026-09-16T00:05:00Z'));
    const { container } = tegn({}, 'nb', klient);
    expect(rad('Bergen')).not.toBe(null);
    expect(skjelett(container)).toBe(0);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('… men første åpning etter nattens raster henter på nytt, også innen kvarteret', async () => {
    vi.setSystemTime(new Date('2026-09-16T01:55:00Z'));
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup();

    // Ti minutter senere: fersk etter klokka, men nattens raster er kommet.
    vi.setSystemTime(new Date('2026-09-16T02:05:00Z'));
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tileDate: '2026-09-16', regions: [{ ...REGIONER[1], score: 77 }] })
      })
    );
    const { container } = tegn({}, 'nb', klient);
    expect(rad('Bergen')).toBe(null);
    expect(skjelett(container)).toBe(3);
    expect(await ventPaaRad('Oslo')).toBeTruthy();
    expect(rad('Bergen')).toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uten dekning: kortet prøver likevel og tar seg selv bort — tre grå streker blir ikke stående', async () => {
    // Nettleseren har meldt «offline». TanStack setter da spørringer på vent
    // som standard, og kallet ville aldri blitt sendt — eller feilet.
    onlineManager.setOnline(false);
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const { container } = tegn();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1 + REGIONER_NYE_FORSOK));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('uten dekning, men med lista i minnet: den vises', async () => {
    const klient = nyKlient();
    tegn({}, 'nb', klient);
    expect(await ventPaaRad('Bergen')).toBeTruthy();
    cleanup();

    onlineManager.setOnline(false);
    tegn({}, 'nb', klient);
    expect(rad('Bergen')).not.toBe(null);
  });

  it('en tom liste fra ruta (ingen fliser ennå) skjuler kortet, som før', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tileDate: null, regions: [] }) })
    );
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('rasterdag og regionerNokkel', () => {
  it('rasterdagen er dagens UTC-dato fra klokka 02 UTC, og gårsdagens før det', () => {
    expect(rasterdag(new Date('2026-09-15T02:00:00Z'))).toBe('2026-09-15');
    expect(rasterdag(new Date('2026-09-15T23:59:59Z'))).toBe('2026-09-15');
    expect(rasterdag(new Date('2026-09-16T00:00:00Z'))).toBe('2026-09-15');
    expect(rasterdag(new Date('2026-09-16T01:59:59Z'))).toBe('2026-09-15');
    expect(rasterdag(new Date('2026-09-16T02:00:00Z'))).toBe('2026-09-16');
  });

  it('… også over måneds- og årsskiftet', () => {
    expect(rasterdag(new Date('2026-10-01T00:30:00Z'))).toBe('2026-09-30');
    expect(rasterdag(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31');
  });

  it('følger rutas klokke (UTC), ikke leserens: 03:30 norsk sommertid er før nattens raster', () => {
    expect(rasterdag(new Date('2026-09-16T03:30:00+02:00'))).toBe('2026-09-15');
  });

  it('nøkkelen: språk og rasterdag', () => {
    expect(regionerNokkel('nb', '2026-09-15')).toEqual(['prediction-regions', 'nb', '2026-09-15']);
  });
});

describe('hentBesteRegioner og skalProveRegionerIgjen', () => {
  it('et svar uten liste er en tom liste, ikke en feil', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
    await expect(hentBesteRegioner('nb')).resolves.toEqual([]);
  });

  it('et svar som ikke er 2xx kaster med statusen', async () => {
    fetchMock.mockImplementation(() => svarMedStatus(502));
    const feil = await hentBesteRegioner('nb').catch((e: unknown) => e);
    expect(feil).toBeInstanceOf(Hentefeil);
    expect((feil as Hentefeil).status).toBe(502);
  });

  it('nettverksfeil og 5xx: inntil to nye forsøk', () => {
    for (const feil of [new TypeError('Failed to fetch'), new Hentefeil('Områdelista', 500), new Hentefeil('Områdelista', 504)]) {
      expect(skalProveRegionerIgjen(0, feil)).toBe(true);
      expect(skalProveRegionerIgjen(REGIONER_NYE_FORSOK - 1, feil)).toBe(true);
      expect(skalProveRegionerIgjen(REGIONER_NYE_FORSOK, feil)).toBe(false);
    }
  });

  it('4xx: aldri', () => {
    for (const status of [400, 401, 404, 429]) {
      expect(skalProveRegionerIgjen(0, new Hentefeil('Områdelista', status))).toBe(false);
    }
  });
});
