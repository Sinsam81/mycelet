// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NyligSlettet, type SlettetFunn } from '../NyligSlettet';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «Nylig slettet» gjør hele angrefristen nåbar. Før fantes de 30 dagene bare
 * for den som rakk angreknappen i et varsel som sto i ti sekunder.
 *
 * Gjenopprettingen testes HER og ikke i nettleseren — den skriver til den
 * eneste databasen som finnes.
 */

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('react-hot-toast', () => ({ default: toast }));

const A = '11111111-2222-3333-4444-555555555555';
const B = '66666666-7777-8888-9999-000000000000';

function slettet(over: Partial<SlettetFunn> = {}): SlettetFunn {
  return {
    id: A,
    artsnavn: 'Kantarell',
    sted: 'Sørkedalen',
    funnetTekst: '12. sep. 2026',
    slettetTid: '2026-11-01T09:00:00.000000+00:00',
    dagerIgjen: 21,
    ...over
  };
}

const fetchMock = vi.fn();

function tre(liste: SlettetFunn[], sprak: 'nb' | 'sv' = 'nb', avkortet = false) {
  return (
    <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <NyligSlettet funn={liste} angrefristDager={30} avkortet={avkortet} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
  refresh.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NyligSlettet', () => {
  it('rendrer ingenting når ingenting er slettet', () => {
    const { container } = render(tre([]));
    expect(container.textContent).toBe('');
  });

  it('viser hvert funn med art, sted, funndato og dagene som står igjen', () => {
    render(tre([slettet(), slettet({ id: B, artsnavn: 'Steinsopp', sted: null, dagerIgjen: 1 })]));

    expect(screen.getByRole('heading', { name: 'Nylig slettet' })).toBeTruthy();
    // Fristen kommer fra ryddejobbens konstant, sendt inn av siden.
    expect(screen.getByText('Funn du har slettet, ligger her i 30 dager før de fjernes for godt.')).toBeTruthy();
    expect(screen.getByText('Kantarell')).toBeTruthy();
    expect(screen.getByText('Sørkedalen · funnet 12. sep. 2026')).toBeTruthy();
    expect(screen.getByText('Fjernes for godt om 21 dager')).toBeTruthy();
    // Uten stedsnavn: bare datoen, ingen løs skilleprikk.
    expect(screen.getByText('funnet 12. sep. 2026')).toBeTruthy();
    expect(screen.getByText('Fjernes for godt om 1 dag')).toBeTruthy();
  });

  /** Alle knappene heter «Gjenopprett» — en skjermleser skal få vite hvilket funn. */
  it('knytter hver gjenopprett-knapp til funnet den gjelder', () => {
    render(tre([slettet(), slettet({ id: B, artsnavn: 'Steinsopp', sted: null })]));
    const [forste, andre] = screen.getAllByRole('button', { name: 'Gjenopprett' });
    const beskrivelse = (knapp: HTMLElement) =>
      document.getElementById(knapp.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    expect(beskrivelse(forste)).toContain('Kantarell');
    expect(beskrivelse(forste)).toContain('Sørkedalen');
    expect(beskrivelse(andre)).toContain('Steinsopp');
    expect(beskrivelse(andre)).not.toContain('Kantarell');
  });

  /**
   * Fristen er ute, men raden finnes til ryddejobben har gått. Da skal lista
   * ikke si «om 0 dager» — og funnet kan fortsatt hentes tilbake.
   */
  it('sier at funnet fjernes innen et døgn når fristen er ute, og lar det fortsatt gjenopprettes', () => {
    render(tre([slettet({ dagerIgjen: 0 })]));
    expect(screen.getByText('Fjernes for godt i løpet av et døgn')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Gjenopprett' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('gjenoppretter funnet, tar det ut av lista og henter siden på nytt', async () => {
    render(tre([slettet(), slettet({ id: B, artsnavn: 'Steinsopp' })]));
    fireEvent.click(screen.getAllByRole('button', { name: 'Gjenopprett' })[1]);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/findings/${B}/restore`);
    expect(init.method).toBe('POST');
    // Samme kvittering som kartets angreknapp gir.
    expect(toast.success).toHaveBeenCalledWith(nb.MushroomMap.findingRestored);
    expect(screen.queryByText('Steinsopp')).toBeNull();
    expect(screen.getByText('Kantarell')).toBeTruthy();
  });

  it('lar funnet stå og viser serverens beskjed når gjenopprettingen feiler', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Kunne ikke gjenopprette funnet', code: 'restore_failed' })
    });
    render(tre([slettet()]));
    fireEvent.click(screen.getByRole('button', { name: 'Gjenopprett' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Kunne ikke gjenopprette funnet'));
    expect(screen.getByText('Kantarell')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    // Knappen er tilbake — ikke låst i «Gjenoppretter …».
    expect((screen.getByRole('button', { name: 'Gjenopprett' }) as HTMLButtonElement).disabled).toBe(false);
  });

  /**
   * Funnet er gjenopprettet i en annen fane, eller ryddet for godt siden siden
   * ble hentet. Da lyver lista — og uten en ny henting ville hvert trykk gitt
   * samme «Fant ikke funnet».
   */
  it('henter lista på nytt når funnet ikke finnes som slettet lenger', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Fant ikke funnet', code: 'not_found' })
    });
    render(tre([slettet()]));
    fireEvent.click(screen.getByRole('button', { name: 'Gjenopprett' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fant ikke funnet'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sier fra med egne ord når nettet faller ut', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(tre([slettet()]));
    fireEvent.click(screen.getByRole('button', { name: 'Gjenopprett' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(nb.MushroomMap.findingRestoreFailed));
  });

  /**
   * Raden skjules lokalt fra serveren har bekreftet til siden er hentet på
   * nytt. Slettes det samme funnet igjen senere, er det en NY sletting — og
   * den skal ikke være skjult fordi den forrige ble hentet tilbake.
   */
  it('viser funnet igjen hvis det slettes på nytt etter å ha vært gjenopprettet', async () => {
    const { rerender } = render(tre([slettet()]));
    fireEvent.click(screen.getByRole('button', { name: 'Gjenopprett' }));
    await waitFor(() => expect(screen.queryByText('Kantarell')).toBeNull());

    // Siden er hentet på nytt: lista er tom.
    rerender(tre([]));
    // Samme funn slettes igjen.
    rerender(tre([slettet({ slettetTid: '2026-11-10T12:00:00.000000+00:00', dagerIgjen: 30 })]));
    expect(screen.getByText('Kantarell')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gjenopprett' })).toBeTruthy();
  });

  /**
   * Siden henter et begrenset antall. En liste som er kortet ned, skal si det —
   * ellers ser de eldste slettingene ut som om de alt er ryddet for godt.
   */
  it('sier fra når det finnes flere slettede funn enn lista viser', () => {
    const { rerender } = render(tre([slettet(), slettet({ id: B, artsnavn: 'Steinsopp' })]));
    expect(screen.queryByText(/sist slettede funnene/)).toBeNull();

    rerender(tre([slettet(), slettet({ id: B, artsnavn: 'Steinsopp' })], 'nb', true));
    expect(screen.getByText(/^Viser de 2 sist slettede funnene\./)).toBeTruthy();
  });

  it('er oversatt til svensk, med svenske flertallsformer', () => {
    render(
      tre(
        [
          slettet({ dagerIgjen: 12 }),
          slettet({ id: B, artsnavn: 'Karljohan', sted: null, dagerIgjen: 1 }),
          slettet({ id: 'c', artsnavn: 'Trattkantarell', dagerIgjen: 0 })
        ],
        'sv'
      )
    );
    expect(screen.getByRole('heading', { name: 'Nyligen raderade' })).toBeTruthy();
    expect(screen.getByText('Fynd du har raderat ligger kvar här i 30 dagar innan de tas bort för gott.')).toBeTruthy();
    expect(screen.getByText('Tas bort för gott om 12 dagar')).toBeTruthy();
    expect(screen.getByText('Tas bort för gott om 1 dag')).toBeTruthy();
    expect(screen.getByText('Tas bort för gott inom ett dygn')).toBeTruthy();
    expect(screen.getByText('hittat 12. sep. 2026')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Återställ' })).toHaveLength(3);
  });
});
