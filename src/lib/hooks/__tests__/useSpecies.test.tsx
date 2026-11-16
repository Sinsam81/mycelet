// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { filtrerArtsliste, type ArtslisteFiltre } from '@/lib/species/artsliste';
import { ARTSKATALOG } from '@/lib/species/__tests__/artskatalog-fixture';

/**
 * Biblioteket hentet hele artstabellen på nytt for hvert filtervalg og hver
 * bokstav i habitatfeltet, og tømte rutenettet mens det sto på. Testene holder
 * på det motsatte: ÉN henting, og alt annet skjer i minnet uten lastetilstand.
 *
 * Bare Date fakes (tidtakere går som vanlig, ellers henger waitFor), og datoen
 * er låst før noe lastes — «kun i sesong nå» leser måneden.
 */
const mock = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  const svar: { data: unknown; error: unknown } = { data: [], error: null };
  const limit = vi.fn(() => Promise.resolve(svar));
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn((_felter: string) => ({ order }));
  const from = vi.fn((_tabell: string) => ({ select }));
  return { svar, limit, order, select, from, locale: { verdi: 'nb' } };
});

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mock.from }) }));
vi.mock('next-intl', () => ({ useLocale: () => mock.locale.verdi }));

const { useSpecies } = await import('../useSpecies');

const INGEN: ArtslisteFiltre = { query: '', edibility: 'all', inSeasonNow: false, habitat: '' };
/** Måneden den låste datoen (15. september 2026) ligger i. */
const SEPTEMBER = 9;

function rendrer(filtre: ArtslisteFiltre = INGEN) {
  const klient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={klient}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook((props: ArtslisteFiltre) => useSpecies(props), { wrapper, initialProps: filtre }),
    klient
  };
}

const navn = (data: Array<{ norwegian_name: string }> | undefined) => (data ?? []).map((art) => art.norwegian_name);

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  mock.svar.data = [...ARTSKATALOG];
  mock.svar.error = null;
  mock.locale.verdi = 'nb';
  mock.from.mockClear();
  mock.select.mockClear();
  mock.order.mockClear();
  mock.limit.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('én henting av katalogen', () => {
  it('filterbytter, habitattekst og søk henter ikke på nytt og laster ikke', async () => {
    const { result, rerender } = rendrer();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toHaveLength(ARTSKATALOG.length));
    expect(mock.from).toHaveBeenCalledTimes(1);

    // Hvert steg under var en ny spørring mot Supabase før — også hver bokstav
    // i habitatfeltet, som ikke engang var forsinket.
    const steg: ArtslisteFiltre[] = [
      { ...INGEN, edibility: 'deadly' },
      { ...INGEN, edibility: 'deadly', habitat: 'g' },
      { ...INGEN, edibility: 'deadly', habitat: 'gr' },
      { ...INGEN, edibility: 'deadly', habitat: 'gra' },
      { ...INGEN, edibility: 'deadly', habitat: 'granskog' },
      { ...INGEN, query: 'kantarell' },
      { ...INGEN, query: 'karljohan' },
      { ...INGEN, inSeasonNow: true },
      INGEN
    ];
    const antall: number[] = [];
    for (const filtre of steg) {
      rerender(filtre);
      // Synkront: svaret står der i samme rendring, uten en runde med «laster».
      expect(result.current.isLoading, JSON.stringify(filtre)).toBe(false);
      expect(result.current.data, JSON.stringify(filtre)).toEqual(
        filtrerArtsliste(ARTSKATALOG, filtre, 'nb', SEPTEMBER)
      );
      antall.push(result.current.data?.length ?? -1);
    }
    // Filtrene gjorde faktisk noe underveis — ellers beviser løkka ingenting.
    expect(antall[0]).toBe(6);
    expect(antall[5]).toBe(4);
    expect(antall[6]).toBe(1);
    expect(antall[8]).toBe(ARTSKATALOG.length);
    expect(new Set(antall).size).toBeGreaterThan(4);

    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.limit).toHaveBeenCalledTimes(1);
  });

  it('språkbytte sorterer om uten å hente på nytt', async () => {
    const { result, rerender } = rendrer();
    await waitFor(() => expect(result.current.data).toHaveLength(ARTSKATALOG.length));
    expect(navn(result.current.data)[0]).toBe('Ametystsopp');

    mock.locale.verdi = 'sv';
    rerender({ ...INGEN });
    // Svensk rekkefølge: «Ametistskivling» er fortsatt først, men steinsopp
    // står nå under K (Karljohan), ikke S.
    const svensk = navn(result.current.data);
    expect(svensk.indexOf('Steinsopp')).toBeLessThan(svensk.indexOf('Sandsopp'));
    expect(mock.from).toHaveBeenCalledTimes(1);
  });

  it('spør etter navnene søket leser, i fast rekkefølge og uten 200-taket', async () => {
    const { result } = rendrer();
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(mock.from).toHaveBeenCalledWith('mushroom_species');
    const felter = mock.select.mock.calls[0][0].split(',');
    for (const felt of ['norwegian_name', 'swedish_name', 'latin_name', 'english_name', 'synonyms_text']) {
      expect(felter, felt).toContain(felt);
    }
    expect(mock.order).toHaveBeenCalledWith('id');
    expect(mock.limit).toHaveBeenCalledWith(1000);
  });
});

describe('søket', () => {
  it('rangerer i stedet for å sortere alfabetisk', async () => {
    const { result } = rendrer({ ...INGEN, query: 'kantarell' });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(navn(result.current.data)).toEqual(['Kantarell', 'Blek kantarell', 'Falsk kantarell', 'Traktkantarell']);
  });

  it('flertallsformen finner artene — «kantareller» ga treff i det gamle norske søket også', async () => {
    const { result } = rendrer({ ...INGEN, query: 'kantareller' });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(navn(result.current.data)).toEqual(['Kantarell', 'Blek kantarell', 'Falsk kantarell', 'Traktkantarell']);
  });

  it('tåler komma og parenteser — de gikk rett inn i et PostgREST-filter før', async () => {
    const { result } = rendrer({ ...INGEN, query: 'kantarell, (steinsopp)' });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
  });
});

describe('«kun i sesong nå»', () => {
  it('bruker Oslo-måneden, ikke enhetens', async () => {
    // 31. desember 23:30 UTC er 1. januar 00:30 i Oslo. Blå ridderhatt har
    // sesong ut desember og skal derfor IKKE være med.
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
    const { result } = rendrer({ ...INGEN, inSeasonNow: true });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(navn(result.current.data)).toEqual(['Judasøre', 'Vintersopp', 'Østerssopp']);
  });
});

describe('når hentingen feiler', () => {
  it('gir feilen videre og ingen liste', async () => {
    mock.svar.data = null;
    mock.svar.error = new Error('nettverk');
    const { result } = rendrer();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('en mislykket oppfrisking i bakgrunnen er ikke en feil når lista allerede står der', async () => {
    const { result, klient } = rendrer({ ...INGEN, query: 'kantarell' });
    await waitFor(() => expect(result.current.data).toHaveLength(4));

    // Katalogen hentes på nytt (slik den gjør når den er over ti minutter
    // gammel), og denne gangen svarer ikke basen.
    mock.svar.data = null;
    mock.svar.error = new Error('nettverk');
    await act(async () => {
      await klient.refetchQueries();
      // TanStack melder fra til kroken i en egen tidtakerrunde.
      await new Promise((ferdig) => setTimeout(ferdig, 20));
    });
    expect(mock.from).toHaveBeenCalledTimes(2);
    expect(klient.getQueryState(['species-all'])?.status).toBe('error');

    // Siden viser «Kunne ikke hente arter» når den får en feil. Lista er
    // fortsatt den samme katalogen, så det ville vært en usann melding.
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(navn(result.current.data)).toEqual(['Kantarell', 'Blek kantarell', 'Falsk kantarell', 'Traktkantarell']);
  });
});

describe('uten nett', () => {
  it('er lista «ikke kommet ennå» — ikke «ingen treff»', async () => {
    // TanStack setter spørringen på vent når nettleseren er frakoblet. Siden
    // viser «ingen arter matcher» når den verken laster eller har data, så
    // «laster» må være sant helt til lista faktisk har kommet.
    onlineManager.setOnline(false);
    try {
      const { result } = rendrer();
      await new Promise((ferdig) => setTimeout(ferdig, 20));
      expect(mock.from).not.toHaveBeenCalled();
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(true);

      // Nettet kommer tilbake: spørringen fortsetter av seg selv.
      onlineManager.setOnline(true);
      await waitFor(() => expect(result.current.data).toHaveLength(ARTSKATALOG.length));
      expect(result.current.isLoading).toBe(false);
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
