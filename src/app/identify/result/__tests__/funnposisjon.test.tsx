// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Hvor et funn fra AI-resultatet lagres. Før ble posisjonen fra
 * identifiseringen brukt uansett alder og uten å vises — et bilde
 * identifisert fra sofaen ble et funn på sofaen. Nå: vist alltid, brukt uten
 * spørsmål bare mens den er fersk, ellers må brukeren velge. Alt mot mocker;
 * ingen lagring går noe sted.
 */

// Samme objekt hver gang, som Next sin ruter: siden har ruteren i en
// effekts avhengigheter, og et nytt objekt per rendring ville lastet om
// resultatet i det uendelige.
const { push, ruter, sok } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, ruter: { push, replace: vi.fn() }, sok: { get: () => null } };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ruter,
  useSearchParams: () => sok
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/identify/IdentifyResult', () => ({ IdentifyResult: () => <div /> }));
vi.mock('@/components/identify/LookAlikeCheck', () => ({ LookAlikeCheck: () => <div /> }));
vi.mock('@/components/identify/ReferencePhotos', () => ({ ReferencePhotos: () => <div /> }));
vi.mock('@/components/identify/SafetyWarning', () => ({ SafetyWarning: () => <div /> }));
vi.mock('@/lib/vurdering/foreslaa', () => ({ foreslaaVurdering: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } } }) } })
}));

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

const finnFerskPosisjon = vi.hoisted(() => vi.fn());
vi.mock('@/lib/map/fersk-posisjon', () => ({ finnFerskPosisjon: (v: unknown) => finnFerskPosisjon(v) }));

const { default: ResultPage } = await import('../page');

const NAA = Date.parse('2026-09-12T14:00:00.000Z');
const MIN = 60_000;

function resultat(
  location: { latitude: number | null; longitude: number | null; timestamp?: number },
  posisjonSettMs?: number
) {
  return {
    identificationId: null,
    originalImageDataUrl: null,
    location,
    suggestions: [
      {
        name: 'Cantharellus cibarius',
        commonNames: [],
        probability: 90,
        edibility: 'edible',
        description: null,
        taxonomy: null,
        similarImages: [],
        speciesId: 7
      }
    ],
    isPlant: false,
    ...(posisjonSettMs === undefined ? {} : { posisjonSettMs })
  };
}

let lagret: Record<string, unknown>[] = [];
let svar: Record<string, unknown> = { ok: true, id: 'funn-1' };

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function tegn(payload: unknown, locale: 'nb' | 'sv' = 'nb') {
  sessionStorage.setItem('identifyResult', JSON.stringify(payload));
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'sv' ? sv : nb} timeZone="Europe/Oslo">
      <ResultPage />
    </NextIntlClientProvider>
  );
  await flush();
}

const lagreKnapp = () => screen.getByRole('button', { name: nb.IdentifyResult.saveAsFinding });

async function bekreftOgLagre() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(lagreKnapp());
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NAA);
  lagret = [];
  svar = { ok: true, id: 'funn-1' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/findings' && init?.method === 'POST') {
        lagret.push(JSON.parse(String(init.body)));
        return Response.json(svar);
      }
      return Response.json({});
    })
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  finnFerskPosisjon.mockReset();
  toast.mockClear();
  toast.success.mockClear();
  push.mockReset();
});

describe('posisjonen et AI-funn lagres med', () => {
  it('viser posisjonen og bruker den uten ekstra trykk når den er fersk', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }, NAA - 2 * MIN));
    // Uten fixets egen tid lover ikke teksten en presis alder: iOS kan ha gitt
    // en lagret, eldre posisjon.
    expect(
      screen.getByText(
        /Posisjonen telefonen oppga da du trykket «Identifiser» \(for 2 minutter siden, eller tidligere hvis telefonen ga en lagret posisjon\)/
      )
    ).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();

    await bekreftOgLagre();
    expect(lagret).toHaveLength(1);
    expect(lagret[0]).toMatchObject({ latitude: 60.1, longitude: 10.7 });
    expect(finnFerskPosisjon).not.toHaveBeenCalled();
  });

  it('viser fixets presise alder og knytter den til målingen, ikke til trykket', async () => {
    // Siden så resultatet nå, men fixet er to minutter gammelt. Alderen er
    // fixets, så teksten kan ikke si at det var da brukeren trykket
    // «Identifiser» — det trykket var nettopp.
    await tegn(resultat({ latitude: 60.1, longitude: 10.7, timestamp: NAA - 2 * MIN }, NAA));
    expect(screen.getByText(/Posisjonen telefonen målte for 2 minutter siden\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/trykket «Identifiser»/);
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('spør når telefonen ga en gammel lagret posisjon, selv om siden nettopp så resultatet', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7, timestamp: NAA - 60 * MIN }));
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('kaller ikke en gammel lagret posisjon «der jeg var da jeg identifiserte»', async () => {
    // Bildet tatt ved soppen og identifisert for 20 sekunder siden, men
    // telefonen ga en posisjon målt for 45 minutter siden — parkeringsplassen,
    // eller hjemme. «Da jeg identifiserte» ville pekt på stedet brukeren står,
    // mens koordinatene er der telefonen var for 45 minutter siden.
    await tegn(resultat({ latitude: 60.1, longitude: 10.7, timestamp: NAA - 45 * MIN }, NAA - 20_000));
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /^Der telefonen målte posisjonen \(for 45 minutter siden\)/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/da jeg identifiserte/);

    // Valgt med vilje lagres den likevel der: brukeren har sett alderen.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('radio', { name: /^Der telefonen målte posisjonen/ }));
    fireEvent.click(lagreKnapp());
    await flush();
    expect(lagret[0]).toMatchObject({ latitude: 60.1, longitude: 10.7 });
  });

  it('sier det samme på svensk', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7, timestamp: NAA - 2 * MIN }, NAA), 'sv');
    expect(screen.getByText(/Positionen telefonen mätte för 2 minuter sedan\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/tryckte på ”Identifiera”/);
    cleanup();
    sessionStorage.clear();

    await tegn(resultat({ latitude: 60.1, longitude: 10.7, timestamp: NAA - 45 * MIN }, NAA - 20_000), 'sv');
    expect(screen.getByRole('radio', { name: /^Där telefonen mätte positionen \(för 45 minuter sedan\)/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/när jag identifierade/);
  });

  it('stempler tiden første gang et ferskt resultat leses, så en ny lasting ikke gjør det ferskt igjen', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }));
    expect(JSON.parse(sessionStorage.getItem('identifyResult')!).posisjonSettMs).toBe(NAA);
    expect(screen.getByText(/for under ett minutt siden/)).toBeTruthy();
  });

  it('krever et valg når posisjonen er gammel — og lagrer den gamle bare når den er valgt', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }, NAA - 3 * 60 * MIN));
    expect(screen.getByText(nb.IdentifyResult.positionChooseQuestion)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect((lagreKnapp() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /Der jeg var da jeg identifiserte \(for 3 timer siden\)/ }));
    expect((lagreKnapp() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(lagreKnapp());
    await flush();
    expect(lagret[0]).toMatchObject({ latitude: 60.1, longitude: 10.7 });
  });

  it('måler på nytt for «der jeg står nå» og lagrer den ferske posisjonen', async () => {
    let svarMaaling: (fix: unknown) => void = () => {};
    finnFerskPosisjon.mockImplementation(() => new Promise((r) => (svarMaaling = r)));
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }, NAA - 30 * MIN));
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('radio', { name: /Der jeg står nå/ }));
    await flush();
    expect(screen.getByText(nb.IdentifyResult.positionMeasuring)).toBeTruthy();
    expect((lagreKnapp() as HTMLButtonElement).disabled).toBe(true);

    await act(async () => svarMaaling({ latitude: 59.9, longitude: 10.75, accuracy: 8.4 }));
    await flush();
    expect(screen.getByText(/Målt nå, ±8 m\./)).toBeTruthy();
    fireEvent.click(lagreKnapp());
    await flush();
    expect(lagret[0]).toMatchObject({ latitude: 59.9, longitude: 10.75 });
  });

  it('lagrer ikke i stillhet en posisjon som ble gammel mens siden sto åpen', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }, NAA - 1 * MIN));
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));

    // Brukeren legger fra seg telefonen, og trykker «Lagre» en time senere —
    // før siden har rukket å tikke.
    vi.setSystemTime(NAA + 60 * MIN);
    fireEvent.click(lagreKnapp());
    await flush();
    expect(lagret).toHaveLength(0);
    expect(screen.getByText(nb.IdentifyResult.positionChooseFirst)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('henter en fersk posisjon når identifiseringen ikke hadde noen', async () => {
    finnFerskPosisjon.mockResolvedValue({ latitude: 63.4, longitude: 10.4, accuracy: 20 });
    await tegn(resultat({ latitude: null, longitude: null }));
    expect(screen.getByText(nb.IdentifyResult.missingGpsNotice)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: nb.IdentifyResult.fetchLocation }));
    await flush();
    await bekreftOgLagre();
    expect(lagret[0]).toMatchObject({ latitude: 63.4, longitude: 10.4 });
  });

  it('har en vei til kartet i stedet', async () => {
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }, NAA - 2 * MIN));
    expect(screen.getByRole('link', { name: nb.IdentifyResult.positionOnMap }).getAttribute('href')).toBe('/map');
  });

  it('viser beskjeden fra serveren i stedet for «lagret!» når lagringen fikk en', async () => {
    svar = { ok: true, id: 'funn-1', notice: { code: 'zone_saved_private', message: 'Lagret som privat.' } };
    await tegn(resultat({ latitude: 60.1, longitude: 10.7 }, NAA - 2 * MIN));
    await bekreftOgLagre();
    expect(toast).toHaveBeenCalledWith('Lagret som privat.', expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
