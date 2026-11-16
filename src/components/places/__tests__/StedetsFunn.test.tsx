// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { StedetsFunn } from '../StedetsFunn';
import type { FunnIKort } from '@/lib/findings/mine-funn';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Funnene under et sted, og det eieren kan gjøre med dem. Alt som skriver, er
 * testet HER og ikke i nettleseren: det finnes bare én database, så et ekte
 * trykk i en innlogget økt ville slettet eller endret et ekte funn.
 *
 * Tekstene lista LÅNER av kartet og lagringsflaten, slås opp i katalogene i
 * stedet for å skrives av: endres ordlyden der, skal ikke testene her falle —
 * men forsvinner en nøkkel, gjør de det.
 */

/** Lagringsflatens navn på delingsnivåene. */
const L = nb.AddFindingSheet;
/** Kartets ord for sletting (popupen) og for varselet etterpå. */
const P = nb.FindingPopup;
const K = nb.MushroomMap;

const { refresh, toast } = vi.hoisted(() => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() });
  return { refresh: vi.fn(), toast: t };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('react-hot-toast', () => ({ default: toast }));

const A = '11111111-2222-3333-4444-555555555555';
const B = '66666666-7777-8888-9999-000000000000';

function funn(over: Partial<FunnIKort> = {}): FunnIKort {
  return {
    id: A,
    artsnavn: 'Kantarell',
    datoTekst: '12. sep. 2026',
    deling: 'private',
    soneNavn: null,
    soneKm: 5,
    notat: null,
    bilde: null,
    aapnesTidligst: null,
    ...over
  };
}

const TO_FUNN = [funn(), funn({ id: B, artsnavn: 'Steinsopp', datoTekst: '3. aug. 2026', deling: 'approximate' })];

const fetchMock = vi.fn();

function tre(liste: FunnIKort[], sprak: 'nb' | 'sv' = 'nb') {
  return (
    <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <StedetsFunn funn={liste} angrefristDager={30} />
    </NextIntlClientProvider>
  );
}

/** Rendrer og åpner kortet. */
function aapnet(liste: FunnIKort[] = [funn()], sprak: 'nb' | 'sv' = 'nb') {
  const utfall = render(tre(liste, sprak));
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  return utfall;
}

const kall = (metode: string) =>
  fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === metode) as [string, RequestInit][];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
  refresh.mockReset();
  toast.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  toast.dismiss.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StedetsFunn — kortet åpner seg i funnene', () => {
  it('er lukket til å begynne med, og sier hvor mange funn som ligger bak', () => {
    render(tre(TO_FUNN));
    expect(screen.getByRole('button', { name: 'Vis funnene (2)' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Steinsopp')).toBeNull();
  });

  it('viser funnene med art, dato og delingsnivå når det åpnes', () => {
    aapnet(TO_FUNN);
    expect(screen.getByRole('button', { name: 'Skjul funnene' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Kantarell')).toBeTruthy();
    expect(screen.getByText('3. aug. 2026')).toBeTruthy();
    // Lagringsflatens egne navn på nivåene.
    expect(screen.getByText(L.sharingPrivate)).toBeTruthy();
    expect(screen.getByText(L.sharingApproximate)).toBeTruthy();
  });

  it('viser sonens navn og rute på et sone-funn', () => {
    aapnet([funn({ deling: 'zone', soneNavn: 'Nordmarka sør', soneKm: 8 })]);
    expect(screen.getByText('Sone: Nordmarka sør · 8 km')).toBeTruthy();
  });

  it('skriver ingenting ved å åpnes og lukkes', () => {
    aapnet(TO_FUNN);
    fireEvent.click(screen.getByRole('button', { name: 'Skjul funnene' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Steinsopp')).toBeNull();
  });

  it('rendrer ingenting for et sted uten funn', () => {
    const { container } = render(tre([]));
    expect(container.textContent).toBe('');
  });

  /**
   * Hver rad har de samme tre knappene, og hvert kort den samme «Vis
   * funnene». En skjermleser skal få vite hvilket funn og hvilket sted de
   * gjelder — uten at knappene skifter navn.
   */
  it('knytter knappene til funnet de gjelder, og åpneknappen til stedet', () => {
    render(
      <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
        <h2 id="sted-0">Sørkedalen</h2>
        <StedetsFunn funn={TO_FUNN} angrefristDager={30} stedId="sted-0" />
      </NextIntlClientProvider>
    );
    const aapne = screen.getByRole('button', { name: 'Vis funnene (2)' });
    expect(aapne.getAttribute('aria-describedby')).toBe('sted-0');
    fireEvent.click(aapne);

    const beskrivelse = (knapp: HTMLElement) =>
      document.getElementById(knapp.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    for (const navn of ['Endre deling', 'Legg til notat', P.delete]) {
      const [forste, andre] = screen.getAllByRole('button', { name: navn });
      expect(beskrivelse(forste)).toBe('Kantarell12. sep. 2026');
      expect(beskrivelse(andre)).toBe('Steinsopp3. aug. 2026');
    }
  });
});

describe('StedetsFunn — notat', () => {
  it('åpner med notatet som står der, og lagrer bare notatet', async () => {
    aapnet([funn({ notat: 'Under den store grana' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Endre notat' }));

    const felt = screen.getByLabelText('Notat') as HTMLTextAreaElement;
    expect(felt.value).toBe('Under den store grana');
    fireEvent.change(felt, { target: { value: '  Ved bekken  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [url, init] = kall('PATCH')[0];
    expect(url).toBe(`/api/findings/${A}`);
    expect(JSON.parse(init.body as string)).toEqual({ notes: 'Ved bekken' });
    expect(toast.success).toHaveBeenCalledWith('Notatet er lagret');
  });

  it('tilbyr «Legg til notat» på et funn uten, og tømmer med null', async () => {
    aapnet([funn({ notat: 'x' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Endre notat' }));
    fireEvent.change(screen.getByLabelText('Notat'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));
    await waitFor(() => expect(kall('PATCH')).toHaveLength(1));
    expect(JSON.parse(kall('PATCH')[0][1].body as string)).toEqual({ notes: null });

    cleanup();
    aapnet([funn()]);
    expect(screen.getByRole('button', { name: 'Legg til notat' })).toBeTruthy();
  });

  /**
   * public_findings viser notatet for funn med eksakt punkt. Det skal stå der
   * notatet skrives — ikke i en personvernerklæring.
   */
  it('sier hvem som ser notatet, der det skrives', () => {
    aapnet([funn({ deling: 'public' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Legg til notat' }));
    expect(screen.getByText('Funnet deles med eksakt punkt, så notatet vises for andre.')).toBeTruthy();

    cleanup();
    aapnet([funn({ deling: 'approximate' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Legg til notat' }));
    // Ikke et løfte uten forbehold: blir funnet senere delt med eksakt punkt,
    // følger notatet med ut (public_findings).
    expect(screen.getByText('Notatet vises bare for deg. Andre ser det bare hvis funnet deles med eksakt punkt.')).toBeTruthy();
  });

  it('avbryter uten å sende noe', () => {
    aapnet([funn({ notat: 'Urørt' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Endre notat' }));
    fireEvent.change(screen.getByLabelText('Notat'), { target: { value: 'Angret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Urørt')).toBeTruthy();
  });

  it('viser serverens beskjed og beholder utkastet når lagringen feiler', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Dette funnet kan ikke endres akkurat nå.', code: 'guard_missing' })
    });
    aapnet([funn()]);
    fireEvent.click(screen.getByRole('button', { name: 'Legg til notat' }));
    fireEvent.change(screen.getByLabelText('Notat'), { target: { value: 'Utkast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Dette funnet kan ikke endres akkurat nå.')
    );
    expect((screen.getByLabelText('Notat') as HTMLTextAreaElement).value).toBe('Utkast');
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * Funnet er slettet i en annen fane eller i appen siden siden ble hentet. Da
 * skal lista hentes på nytt — og beskjeden må ut som varsel, for raden den
 * ellers ville stått i, forsvinner med oppfriskingen.
 */
describe('StedetsFunn — når siden viser et funn som ikke finnes lenger', () => {
  const finnesIkke = {
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Fant ikke funnet', code: 'not_found' })
  };

  it('henter lista på nytt når notatet ikke lar seg lagre fordi funnet er borte', async () => {
    fetchMock.mockResolvedValue(finnesIkke);
    aapnet([funn()]);
    fireEvent.click(screen.getByRole('button', { name: 'Legg til notat' }));
    fireEvent.change(screen.getByLabelText('Notat'), { target: { value: 'Utkast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fant ikke funnet'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('henter lista på nytt når funnet alt er slettet et annet sted', async () => {
    fetchMock.mockResolvedValue(finnesIkke);
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: P.delete }));
    fireEvent.click(screen.getByRole('button', { name: P.deleteConfirm }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fant ikke funnet'));
    expect(refresh).toHaveBeenCalledTimes(1);
    // Ingen «Funnet er slettet» med angreknapp for en sletting som ikke skjedde her.
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('StedetsFunn — sletting, i to trinn som på kartet', () => {
  it('spør først — første trykk sletter ingenting', () => {
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: P.delete }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(P.deleteConfirmQuestion)).toBeTruthy();
    // Angreveien står der FØR klikket, og peker dit funnet blir liggende.
    expect(screen.getByText('Funnet ligger under «Nylig slettet» i 30 dager, så du kan angre.')).toBeTruthy();
  });

  it('avbryter uten å slette', () => {
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: P.delete }));
    fireEvent.click(screen.getByRole('button', { name: P.deleteCancel }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: P.delete })).toBeTruthy();
  });

  it('sletter på bekreftelsen, tar raden bort og henter siden på nytt', async () => {
    aapnet(TO_FUNN);
    fireEvent.click(screen.getAllByRole('button', { name: P.delete })[0]);
    fireEvent.click(screen.getByRole('button', { name: P.deleteConfirm }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(kall('DELETE')[0][0]).toBe(`/api/findings/${A}`);
    expect(screen.queryByText('Kantarell')).toBeNull();
    // Det andre funnet står urørt.
    expect(screen.getByText('Steinsopp')).toBeTruthy();
  });

  it('gir et varsel med angreknapp, som gjenoppretter funnet', async () => {
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: P.delete }));
    fireEvent.click(screen.getByRole('button', { name: P.deleteConfirm }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

    // Varselet rendres av <Toaster> utenfor next-intl-provideren, så det må
    // være ferdig tekst — ikke et t()-kall. Derfor rendres det her uten provider.
    const [innhold, valg] = toast.mock.calls[0] as [(item: { id: string }) => ReactElement, { duration: number }];
    expect(valg.duration).toBe(10_000);
    const varsel = render(innhold({ id: 'varsel-1' }));
    expect(varsel.getByText(K.findingDeleted)).toBeTruthy();
    fireEvent.click(varsel.getByRole('button', { name: K.findingDeleteUndo }));

    await waitFor(() => expect(kall('POST')).toHaveLength(1));
    expect(kall('POST')[0][0]).toBe(`/api/findings/${A}/restore`);
    expect(toast.dismiss).toHaveBeenCalledWith('varsel-1');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(K.findingRestored));
    // Raden er tilbake med knappene sine — ikke skjult, ikke låst i «Sletter …».
    await waitFor(() => expect(screen.getByRole('button', { name: P.delete })).toBeTruthy());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('viser feilen og lar brukeren prøve igjen når slettingen feiler', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: () =>
        Promise.resolve({ error: 'Funksjonen er ikke slått på ennå', details: 'Funnet ditt er trygt og IKKE slettet.' })
    });
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: P.delete }));
    fireEvent.click(screen.getByRole('button', { name: P.deleteConfirm }));

    // `details` vinner over `error`: det er den som sier hva som ikke skjedde.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Funnet ditt er trygt og IKKE slettet.'));
    expect(screen.getByRole('button', { name: P.delete })).toBeTruthy();
    expect(screen.getByText('Kantarell')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('StedetsFunn — deling og språk', () => {
  it('åpner «Endre deling» for funnet det trykkes på, og henter siden på nytt etter lagring', async () => {
    aapnet(TO_FUNN);
    fireEvent.click(screen.getAllByRole('button', { name: 'Endre deling' })[1]);

    const ark = screen.getByRole('dialog');
    expect(ark.textContent).toContain('Steinsopp');
    fireEvent.click(screen.getByRole('radio', { name: L.sharingPrivate }));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(kall('PATCH')[0][0]).toBe(`/api/findings/${B}`);
    expect(toast.success).toHaveBeenCalledWith('Delingen er endret');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Funnet ble slettet et annet sted mens arket sto åpent. Arket forsvinner
   * med raden når lista kommer, så beskjeden må ut som varsel.
   */
  it('varsler og henter lista på nytt når funnet er borte da delingen skulle lagres', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Fant ikke funnet', code: 'not_found' })
    });
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: 'Endre deling' }));
    fireEvent.click(screen.getByRole('radio', { name: L.sharingApproximate }));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fant ikke funnet'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  /** En karantene siden ikke visste om: arket viser beskjeden selv — ingen dobbel beskjed. */
  it('henter lista på nytt uten varsel når serveren kjenner en karantene siden ikke visste om', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Funnet er endret det siste døgnet.', code: 'sharing_cooldown' })
    });
    aapnet();
    fireEvent.click(screen.getByRole('button', { name: 'Endre deling' }));
    fireEvent.click(screen.getByRole('radio', { name: L.sharingApproximate }));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Funnet er endret det siste døgnet.');
    // Arket står fortsatt åpent.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('er oversatt til svensk, også ordene den låner fra kartet', () => {
    aapnet([funn({ notat: 'x', deling: 'zone', soneNavn: 'Kolmården', soneKm: 3 })], 'sv');
    expect(screen.getByRole('button', { name: 'Dölj fynden' })).toBeTruthy();
    expect(screen.getByText(sv.AddFindingSheet.sharingZone)).toBeTruthy();
    expect(screen.getByText('Zon: Kolmården · 3 km')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ändra delning' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ändra anteckning' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: sv.FindingPopup.delete }));
    expect(screen.getByText(sv.FindingPopup.deleteConfirmQuestion)).toBeTruthy();
    expect(screen.getByText('Fyndet ligger under ”Nyligen raderade” i 30 dagar, så du kan ångra dig.')).toBeTruthy();
  });
});
