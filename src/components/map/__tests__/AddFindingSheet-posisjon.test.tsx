// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { avstandMeter, flyttetoleranseMeter, kartErFlyttet, senterForBoks } from '@/lib/map/funnposisjon';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * HVOR funnet lagres — helt ut i forespørselen som sendes.
 *
 * Skjemaet lagret posisjonen kartet fikk da det ble åpnet. To turer endte
 * derfor på feil sted uten at noe sa det: parkeringsplassen (åpnet kartet der,
 * gikk førti minutter) og sofaen (flyttet kartet til lysningen fra i går, men
 * GPS-en sto hjemme og vant). Reglene er testet for seg i
 * src/lib/map/__tests__/funnposisjon.test.ts; her låses det at skjemaet
 * faktisk bruker dem, og at koordinatene i POST-en er de brukeren ser valgt.
 */

interface Leting {
  valg: {
    targetAccuracyM?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onUpdate?: (fix: { latitude: number; longitude: number; accuracy: number }) => void;
  };
  los: (fix: { latitude: number; longitude: number; accuracy: number }) => void;
  avvis: () => void;
}

const letinger: Leting[] = [];

vi.mock('@/lib/map/fersk-posisjon', () => ({
  finnFerskPosisjon: (valg: Leting['valg'] = {}) =>
    new Promise((resolve, reject) => {
      letinger.push({ valg, los: resolve, avvis: () => reject(new Error('Fant ingen fersk posisjon i tide.')) });
    })
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) }
  })
}));

vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => false }));

const { AddFindingSheet } = await import('../AddFindingSheet');

const PARKERING = { lat: 59.9706, lng: 10.7286 };
const LYSNING = { lat: 59.992, lng: 10.71 };
const HJEMME = { lat: 59.9139, lng: 10.7522 };

const fetchMock = vi.fn();

function rendrer(props: Partial<React.ComponentProps<typeof AddFindingSheet>> = {}, locale: 'nb' | 'sv' = 'nb') {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const utfall = render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <AddFindingSheet kartsenter={PARKERING} kartFlyttet={false} onClose={onClose} onSaved={onSaved} {...props} />
    </NextIntlClientProvider>
  );
  return { ...utfall, onSaved, onClose };
}

const lagreknapp = () => screen.getByRole('button', { name: 'Lagre funn' }) as HTMLButtonElement;
const radio = (navn: RegExp) => screen.getByRole('radio', { name: navn }) as HTMLInputElement;

/** Koordinatene i den ene POST-en til /api/findings. */
async function lagretPunkt(): Promise<{ latitude: number; longitude: number }> {
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  expect(url).toBe('/api/findings');
  const body = JSON.parse(init.body) as { latitude: number; longitude: number };
  return { latitude: body.latitude, longitude: body.longitude };
}

async function ferskMaaling(punkt: { lat: number; lng: number }, accuracy = 12) {
  await act(async () => {
    letinger[letinger.length - 1].los({ latitude: punkt.lat, longitude: punkt.lng, accuracy });
  });
}

async function ingenMaaling() {
  await act(async () => {
    letinger[letinger.length - 1].avvis();
  });
}

beforeEach(() => {
  letinger.length = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AddFindingSheet — posisjonen måles på nytt når skjemaet åpnes', () => {
  it('starter en fersk leting med en gang, med frist', () => {
    rendrer();
    expect(letinger).toHaveLength(1);
    expect(letinger[0].valg.targetAccuracyM).toBe(30);
    expect(letinger[0].valg.timeoutMs).toBe(8000);
  });

  it('holder «Lagre» stengt til målingen er kommet — en rask lagrer får ikke en gammel posisjon', () => {
    rendrer();
    expect(lagreknapp().disabled).toBe(true);
    // Og sier hvorfor, rett ved knappen.
    expect(screen.getAllByText('Finner posisjonen din …').length).toBeGreaterThan(0);
    fireEvent.submit(lagreknapp().closest('form') as HTMLFormElement);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parkeringsplassen: lagrer der brukeren står NÅ, ikke der kartet ble åpnet', async () => {
    const { onSaved } = rendrer({ kartsenter: PARKERING, kartFlyttet: false });
    await ferskMaaling(LYSNING, 9);

    expect(radio(/Der jeg står nå/).checked).toBe(true);
    expect(screen.getByText('±9 m')).toBeTruthy();
    expect(lagreknapp().disabled).toBe(false);

    fireEvent.click(lagreknapp());
    expect(await lagretPunkt()).toEqual({ latitude: LYSNING.lat, longitude: LYSNING.lng });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('melder den ferske målingen tilbake til kartet', async () => {
    const onFerskPosisjon = vi.fn();
    rendrer({ onFerskPosisjon });
    await ferskMaaling(LYSNING, 9);
    expect(onFerskPosisjon).toHaveBeenCalledWith({ lat: LYSNING.lat, lng: LYSNING.lng, accuracy: 9 });
  });

  it('en grov måling underveis kan brukes med en gang, og strammes inn', async () => {
    rendrer({ kartsenter: PARKERING, kartFlyttet: false });
    await act(async () => {
      letinger[0].valg.onUpdate?.({ latitude: LYSNING.lat, longitude: LYSNING.lng, accuracy: 60 });
    });
    expect(screen.getByText('±60 m')).toBeTruthy();
    expect(lagreknapp().disabled).toBe(false);
    await act(async () => {
      // En dårligere måling etterpå skal ikke ta over for en bedre.
      letinger[0].valg.onUpdate?.({ latitude: 60.5, longitude: 11, accuracy: 300 });
    });
    expect(screen.getByText('±60 m')).toBeTruthy();
  });
});

describe('AddFindingSheet — kartsenteret kan alltid velges', () => {
  it('sofaen: GPS-en står hjemme og kartet på lysningen — skjemaet velger ikke for brukeren', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true });
    await ferskMaaling(HJEMME, 10);

    expect(radio(/Der jeg står nå/).checked).toBe(false);
    expect(radio(/Der kartet står/).checked).toBe(false);
    expect(lagreknapp().disabled).toBe(true);
    // Avstanden står i klartekst, så det er tydelig HVORFOR det spørres.
    expect(screen.getByText(/Kartet står 9 km fra der du er nå/)).toBeTruthy();
    expect(screen.getByText('Velg posisjon lenger opp før du lagrer.')).toBeTruthy();
  });

  it('sofaen, etter valget: «Der kartet står» lagrer lysningen — hjemmet forlater aldri telefonen', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true });
    await ferskMaaling(HJEMME, 10);

    fireEvent.click(radio(/Der kartet står/));
    expect(lagreknapp().disabled).toBe(false);
    fireEvent.click(lagreknapp());

    const punkt = await lagretPunkt();
    expect(punkt).toEqual({ latitude: LYSNING.lat, longitude: LYSNING.lng });
    expect(punkt.latitude).not.toBe(HJEMME.lat);
  });

  it('kartsenteret kan velges mens letingen ennå pågår', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true });
    fireEvent.click(radio(/Der kartet står/));
    expect(lagreknapp().disabled).toBe(false);
    fireEvent.click(lagreknapp());
    expect(await lagretPunkt()).toEqual({ latitude: LYSNING.lat, longitude: LYSNING.lng });
  });

  it('uten måling er «Der jeg står nå» ikke valgbar', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true });
    expect(radio(/Der jeg står nå/).disabled).toBe(true);
    await ingenMaaling();
    expect(radio(/Der jeg står nå/).disabled).toBe(true);
  });
});

describe('AddFindingSheet — uten fersk posisjon', () => {
  it('kartet er flyttet til funnstedet: kartsenteret lagres, og skjemaet sier det', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true });
    await ingenMaaling();

    expect(radio(/Der kartet står/).checked).toBe(true);
    expect(screen.getByText(/Fant ikke posisjonen din nå, så funnet lagres der kartet står/)).toBeTruthy();
    fireEvent.click(lagreknapp());
    expect(await lagretPunkt()).toEqual({ latitude: LYSNING.lat, longitude: LYSNING.lng });
  });

  it('kartet står der appen la det: lagrer ikke parkeringsplassen før brukeren har sagt at det stemmer', async () => {
    rendrer({ kartsenter: PARKERING, kartFlyttet: false });
    await ingenMaaling();

    expect(lagreknapp().disabled).toBe(true);
    expect(screen.getByText(/kartet står der appen la det/)).toBeTruthy();

    fireEvent.click(radio(/Der kartet står/));
    fireEvent.click(lagreknapp());
    expect(await lagretPunkt()).toEqual({ latitude: PARKERING.lat, longitude: PARKERING.lng });
  });

  it('«Søk etter posisjonen på nytt» starter en ny leting uten å lukke skjemaet', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true });
    await ingenMaaling();
    fireEvent.change(screen.getByPlaceholderText('Beskriv funnet'), { target: { value: 'Under den store grana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Søk etter posisjonen på nytt' }));
    expect(letinger).toHaveLength(2);
    // Det som var skrevet, står.
    expect((screen.getByPlaceholderText('Beskriv funnet') as HTMLTextAreaElement).value).toBe('Under den store grana');

    await ferskMaaling({ lat: LYSNING.lat + 0.0003, lng: LYSNING.lng }, 14);
    expect(radio(/Der jeg står nå/).checked).toBe(true);
  });

  it('verken måling eller kart: ingenting lagres, og skjemaet sier hva som mangler', async () => {
    rendrer({ kartsenter: null, kartFlyttet: false });
    await ingenMaaling();
    expect(lagreknapp().disabled).toBe(true);
    expect(screen.getByText(/Ingen posisjon å lagre på/)).toBeTruthy();
  });
});

describe('AddFindingSheet — pluss rett etter «⭐ Lovende»', () => {
  // «Lovende» zoomet kartet til boksen rundt to områder og brukeren selv:
  // senteret flyttet seg et par hundre meter uten at han rørte kartet. Kartet
  // regner ut `kartFlyttet` slik det gjøres her (pluss-knappen i
  // MushroomMap.tsx), mot senteret appen selv skrev ned etter zoomingen.
  const sorvest = { lat: 59.9065, lng: 10.7302 };
  const nordost = { lat: 59.9195, lng: 10.7638 };
  const midtIBoksen = senterForBoks(sorvest, nordost);
  const etterLovende = {
    kartsenter: midtIBoksen,
    kartFlyttet: kartErFlyttet(midtIBoksen, senterForBoks(sorvest, nordost), flyttetoleranseMeter(midtIBoksen.lat, 14))
  };

  it('forutsetningen: midten av boksen ligger langt nok fra brukeren til at skjemaet ville spurt', () => {
    expect(avstandMeter(midtIBoksen, HJEMME)).toBeGreaterThan(150);
    expect(etterLovende.kartFlyttet).toBe(false);
  });

  it('med fersk måling lagres der brukeren står — uten et valg han ikke har bedt om', async () => {
    rendrer(etterLovende);
    await ferskMaaling(HJEMME, 10);

    expect(radio(/Der jeg står nå/).checked).toBe(true);
    expect(screen.queryByText(/Velg hvilken av de to posisjonene/)).toBeNull();
    expect(lagreknapp().disabled).toBe(false);
    fireEvent.click(lagreknapp());
    expect(await lagretPunkt()).toEqual({ latitude: HJEMME.lat, longitude: HJEMME.lng });
  });

  it('uten måling lagres ikke midten av boksen før brukeren har sagt at stedet stemmer', async () => {
    rendrer(etterLovende);
    await ingenMaaling();

    expect(radio(/Der kartet står/).checked).toBe(false);
    expect(lagreknapp().disabled).toBe(true);
    expect(screen.getByText(/kartet står der appen la det/)).toBeTruthy();
    fireEvent.submit(lagreknapp().closest('form') as HTMLFormElement);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('slik var det da flyttingen ble lest som brukerens: et valg med fersk måling, og boksen lagret uten', async () => {
    // Målt mot senteret fra FØR «Lovende» (der brukeren står) er kartet «flyttet».
    const somFor = {
      kartsenter: midtIBoksen,
      kartFlyttet: kartErFlyttet(midtIBoksen, HJEMME, flyttetoleranseMeter(midtIBoksen.lat, 14))
    };
    expect(somFor.kartFlyttet).toBe(true);

    const medMaaling = rendrer(somFor);
    await ferskMaaling(HJEMME, 10);
    expect(screen.getByText(/Velg hvilken av de to posisjonene/)).toBeTruthy();
    expect(lagreknapp().disabled).toBe(true);
    medMaaling.unmount();

    rendrer(somFor);
    await ingenMaaling();
    expect(radio(/Der kartet står/).checked).toBe(true);
    expect(lagreknapp().disabled).toBe(false);
  });
});

describe('AddFindingSheet — opprydding og språk', () => {
  it('lukkes skjemaet, avbrytes letingen', () => {
    const { unmount } = rendrer();
    const signal = letinger[0].valg.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('en måling som kommer etter at skjemaet er lukket, gjør ingenting', async () => {
    const onFerskPosisjon = vi.fn();
    const { unmount } = rendrer({ onFerskPosisjon });
    unmount();
    await act(async () => {
      letinger[0].los({ latitude: LYSNING.lat, longitude: LYSNING.lng, accuracy: 5 });
    });
    expect(onFerskPosisjon).not.toHaveBeenCalled();
  });

  it('svensk: valget og begrunnelsen står på svensk', async () => {
    rendrer({ kartsenter: LYSNING, kartFlyttet: true }, 'sv');
    await ferskMaaling(HJEMME, 10);
    expect(screen.getByRole('radio', { name: /Där jag står nu/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Där kartan står/ })).toBeTruthy();
    expect(screen.getByText(/Kartan står 9 km från där du är nu/)).toBeTruthy();
  });
});
