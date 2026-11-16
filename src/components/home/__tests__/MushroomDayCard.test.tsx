// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { HUSKET_POSISJON_NOKKEL, lagreHusketPosisjon } from '@/lib/map/husket-posisjon';
import { FORSIDEKORT_FRIST_MS, FORSIDEKORT_KLAR_EVENT, PROVETILBUD_PUSTEROM_MS } from '@/lib/billing/provetilbud-venting';
import { PROVETILBUD_START_NOKKEL } from '@/lib/billing/provetilbud';

/**
 * Forsidekortet — «Soppforhold i dag».
 *
 * Kortet er en liten tilstandsmaskin (ønsket posisjon → henting → det som
 * vises → bruksdag → «kortet har data»), og tre ting utenfor kortet henger på
 * den: tilbudsarket venter på hendelsen, bruksmålingen skriver kilden kortet
 * viste FØRST, og «Følg området ditt» navngir bare et område kortet faktisk
 * regner på. Ingenting av det sto i en test.
 *
 * Testene beskriver det brukeren ser og det kortet sender ut — ikke hvordan
 * hentingen er bygd. Alt til og med «utenom sesongen» ble skrevet mot kortet
 * slik det var, med en løs useEffect-henting, og besto uendret da hentingen
 * ble flyttet til appens QueryClient. Blokkene etter beskriver det som er
 * nytt med den: minnet mellom åpninger, ett nytt forsøk, og at tilbudsarket
 * hører hendelsen også når svaret kommer fra minnet.
 */

// ── Posisjon ────────────────────────────────────────────────────────────────
type Fix = { latitude: number; longitude: number };
const geo = {
  /** Stille oppslag ved montering: fersk posisjon hvis tilgang alt er gitt, ellers null. */
  stille: vi.fn<() => Promise<Fix | null>>(),
  /** Brukerens eget trykk på «Min posisjon». */
  trykk: vi.fn<() => Promise<Fix>>()
};
vi.mock('@/lib/hooks/useGeolocation', () => ({
  getCurrentPositionIfGranted: () => geo.stille(),
  getCurrentPositionOnce: () => geo.trykk()
}));

// ── Naboene: stripa og bruksmålingen ────────────────────────────────────────
vi.mock('@/components/home/FolgOmrade', () => ({
  FolgOmrade: (p: { innlogget: boolean; folgerAlt: boolean; posisjonsKilde: string; omrade: string | null }) => (
    <div
      data-testid="folg"
      data-kilde={p.posisjonsKilde}
      data-omrade={p.omrade ?? ''}
      data-innlogget={String(p.innlogget)}
      data-folger={String(p.folgerAlt)}
    />
  )
}));

/** Hver «skriving» den ekte komponenten ville gjort: én per montering, og én til hvis kilden byttet. */
const bruksdager: string[] = [];
vi.mock('@/components/bruk/RegistrerBruksdag', async () => {
  const { useEffect } = await import('react');
  return {
    RegistrerBruksdag: ({ flate, omrade = '' }: { flate: string; omrade?: string }) => {
      // Samme avhengigheter som den ekte: bytter kilden, skrives en rad til.
      useEffect(() => {
        bruksdager.push(`${flate}:${omrade}`);
      }, [flate, omrade]);
      return null;
    }
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

// Tilbudsarket (for testen av rekkefølgen nederst): selve arket og introen er
// andre komponenters sak — her gjelder bare NÅR arket får lov til å komme.
vi.mock('@/components/billing/ProvGratisArk', () => ({ ProvGratisArk: () => <div data-testid="tilbudsark" /> }));
vi.mock('@/components/onboarding/OnboardingIntro', () => ({
  ONBOARDING_STORAGE_KEY: 'mycelet:onboarding-v1',
  ONBOARDING_DONE_EVENT: 'mycelet:onboarding-done'
}));

const { MushroomDayCard, PROGNOSE_FERSK_MS, PROGNOSE_NYE_FORSOK, flushTint, prognoseNokkel } = await import('../MushroomDayCard');
const { ProvGratisVedStart } = await import('@/components/billing/ProvGratisVedStart');

// ── Prognosen ───────────────────────────────────────────────────────────────
const prognose = (score: number) => ({
  today: { optimal: false, score, title: `Dom ${score}`, message: 'Slik er det i dag.', reasons: ['Regn siste uke'] },
  days: [
    { date: '2026-09-15', label: 'I dag', isToday: true, score, optimal: false },
    { date: '2026-09-16', label: 'ons', score: Math.max(0, score - 5), optimal: false }
  ],
  hasForecast: true
});

const OSLO = { lat: 59.91, lng: 10.75 }; // standardområdet for norsk
const STOCKHOLM = { lat: 59.33, lng: 18.07 }; // standardområdet for svensk
const BERGEN = { lat: 60.39, lng: 5.32 };
const TRONDHEIM = { lat: 63.43, lng: 10.4 };

interface Svar {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
const ok = (score: number): Svar => ({ ok: true, status: 200, json: () => Promise.resolve(prognose(score)) });
const status = (kode: number): Svar => ({ ok: false, status: kode, json: () => Promise.resolve({ error: 'nei' }) });

/** Hva hver rute («lat,lon» med to desimaler) svarer. Uten oppføring: 200 med tallet under. */
let svarPerRute: Record<string, () => Promise<Svar>>;
const STANDARDTALL: Record<string, number> = { '59.91,10.75': 72, '59.33,18.07': 64, '60.39,5.32': 81, '63.43,10.40': 55 };
const fetchMock = vi.fn((url: string) => {
  const m = /lat=([-\d.]+)&lon=([-\d.]+)/.exec(url);
  const rute = m ? `${m[1]},${m[2]}` : url;
  const egen = svarPerRute[rute];
  return egen ? egen() : Promise.resolve(ok(STANDARDTALL[rute] ?? 50));
});
const rute = (p: { lat: number; lng: number }) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
const adresse = (p: { lat: number; lng: number }) => `/api/mushroom-forecast?lat=${p.lat.toFixed(2)}&lon=${p.lng.toFixed(2)}`;
const kallTil = (p: { lat: number; lng: number }) => fetchMock.mock.calls.filter(([url]) => url === adresse(p)).length;

/** Et svar testen selv slipper løs — for kappløpene. */
function utsatt() {
  let slipp!: (svar: Svar) => void;
  let avvis!: (feil: unknown) => void;
  const løfte = new Promise<Svar>((resolve, reject) => {
    slipp = resolve;
    avvis = reject;
  });
  return { løfte, slipp, avvis };
}

// ── Tegning ─────────────────────────────────────────────────────────────────
/** Appens klient, men uten ventetid mellom forsøk. */
const nyKlient = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });

function tre(sprak: 'nb' | 'sv', klient: QueryClient, props: React.ComponentProps<typeof MushroomDayCard> = {}) {
  return (
    <QueryClientProvider client={klient}>
      <NextIntlClientProvider locale={sprak} messages={(sprak === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
        <MushroomDayCard {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function tegn(
  valg: { sprak?: 'nb' | 'sv'; klient?: QueryClient; props?: React.ComponentProps<typeof MushroomDayCard> } = {}
) {
  const klient = valg.klient ?? nyKlient();
  const sprak = valg.sprak ?? 'nb';
  const visning = render(tre(sprak, klient, valg.props));
  return { ...visning, klient, bytt: (nytt: 'nb' | 'sv') => visning.rerender(tre(nytt, klient, valg.props)) };
}

const ring = (score: number) => screen.findByRole('img', { name: `Vær og sesong i dag: ${score} av 100` });
const harRing = (score: number) => screen.queryByRole('img', { name: `Vær og sesong i dag: ${score} av 100` }) !== null;
const venter = () => screen.queryByText('Sjekker soppforholdene …') !== null;
/** Stedet kortet sier at tallet gjelder for — linja nederst, «📍 Oslo · omtrentlig». */
const sted = (rot: HTMLElement) => {
  const linje = [...rot.querySelectorAll('span')].find((s) => s.textContent?.startsWith('📍'));
  return linje?.textContent?.replace('📍', '').trim() ?? null;
};
const stripe = () => screen.getByTestId('folg');
const delPosisjon = () => screen.queryByRole('button', { name: /Del posisjon for bedre råd/ });
const minPosisjon = () => screen.queryByRole('button', { name: /Min posisjon/ });

let klarHendelser = 0;
const tellKlar = () => {
  klarHendelser += 1;
};

beforeEach(() => {
  window.localStorage.clear();
  bruksdager.length = 0;
  klarHendelser = 0;
  svarPerRute = {};
  fetchMock.mockClear();
  geo.stille.mockReset();
  geo.trykk.mockReset();
  // Utgangspunktet: ingen posisjonstilgang.
  geo.stille.mockResolvedValue(null);
  vi.stubGlobal('fetch', fetchMock);
  window.addEventListener(FORSIDEKORT_KLAR_EVENT, tellKlar);
});

afterEach(() => {
  cleanup();
  window.removeEventListener(FORSIDEKORT_KLAR_EVENT, tellKlar);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe('MushroomDayCard — før noe er kjent', () => {
  it('holder av plassen og henter ingenting før posisjonen er valgt', async () => {
    geo.stille.mockReturnValue(new Promise(() => {})); // posisjonsoppslaget svarer aldri
    const { container } = tegn();
    expect(venter()).toBe(true);
    // Samme høyde som det ferdige kortet, så siden ikke hopper.
    expect(container.firstElementChild?.className).toContain('min-h-[15rem]');
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(klarHendelser).toBe(0);
    expect(bruksdager).toEqual([]);
  });
});

describe('MushroomDayCard — standardområdet (ingen husket posisjon, ingen tilgang)', () => {
  it('norsk: Oslo, merket omtrentlig, med tilbudet om å dele posisjon', async () => {
    const { container } = tegn();
    await ring(72);
    expect(sted(container)).toBe('Oslo · omtrentlig');
    expect(delPosisjon()).not.toBe(null);
    // Stripa får vite at dette er standardområdet, og navngir det aldri.
    expect(stripe().dataset.kilde).toBe('standard');
    expect(stripe().dataset.omrade).toBe('');
  });

  it('svensk: Stockholm — ikke norsk vær på svensk', async () => {
    const { container } = tegn({ sprak: 'sv' });
    await screen.findByRole('img', { name: 'Väder och säsong i dag: 64 av 100' });
    expect(sted(container)).toBe('Stockholm · ungefärlig');
    expect(kallTil(STOCKHOLM)).toBe(1);
    expect(kallTil(OSLO)).toBe(0);
  });

  it('posisjonen i adressen er grov (to desimaler), og svaret skal ikke mellomlagres av nettleseren', async () => {
    tegn();
    await ring(72);
    expect(fetchMock).toHaveBeenCalledWith('/api/mushroom-forecast?lat=59.91&lon=10.75', { cache: 'no-store' });
  });

  it('bruksdagen skrives som «standard», og «kortet har data» sendes én gang', async () => {
    tegn();
    await ring(72);
    await waitFor(() => expect(bruksdager).toEqual(['hjem:standard']));
    expect(klarHendelser).toBe(1);
  });

  it('gir innlogging og «følger alt» videre til stripa', async () => {
    tegn({ props: { innlogget: true, folgerOmrade: true } });
    await ring(72);
    expect(stripe().dataset.innlogget).toBe('true');
    expect(stripe().dataset.folger).toBe('true');
  });
});

describe('MushroomDayCard — husket posisjon', () => {
  beforeEach(() => {
    lagreHusketPosisjon(BERGEN.lat, BERGEN.lng);
  });

  it('brukes med en gang, uten å vente på GPS', async () => {
    geo.stille.mockReturnValue(new Promise(() => {})); // GPS svarer aldri
    const { container } = tegn();
    await ring(81);
    expect(sted(container)).toBe('Bergen');
    expect(kallTil(OSLO)).toBe(0);
    // Egen posisjon: stripa kan navngi området.
    expect(stripe().dataset.kilde).toBe('egen');
    expect(stripe().dataset.omrade).toBe('Bergen');
    await waitFor(() => expect(bruksdager).toEqual(['hjem:egen']));
  });

  it('ubekreftet (kan være ei uke gammel): den lille «Min posisjon»-lenka, ikke det store tilbudet', async () => {
    tegn();
    await ring(81);
    expect(minPosisjon()).not.toBe(null);
    expect(delPosisjon()).toBe(null);
  });

  it('fersk måling i samme rute: ingen ny henting, og posisjonen er bekreftet', async () => {
    geo.stille.mockResolvedValue({ latitude: 60.3912, longitude: 5.3187 }); // samme ~1 km-rute
    tegn();
    await ring(81);
    await waitFor(() => expect(minPosisjon()).toBe(null));
    expect(kallTil(BERGEN)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fersk måling i en annen rute: det gamle står med SITT sted til det nye er hentet', async () => {
    const nytt = utsatt();
    svarPerRute[rute(TRONDHEIM)] = () => nytt.løfte;
    // Rekkefølgen sies rett ut: prognosen for den huskede posisjonen står på
    // skjermen FØR GPS-en svarer (nettet bruker et par hundre millisekunder,
    // GPS-en sekunder). Svarer begge i samme øyeblikk, er det tilfeldig hvem
    // som rekker først — det er kappløpet i testen under.
    let gps!: (fix: Fix) => void;
    geo.stille.mockReturnValue(
      new Promise<Fix | null>((resolve) => {
        gps = resolve;
      })
    );
    const { container } = tegn();

    await ring(81);
    await act(async () => gps({ latitude: TRONDHEIM.lat, longitude: TRONDHEIM.lng }));
    await waitFor(() => expect(kallTil(TRONDHEIM)).toBe(1));
    // Mens Trondheim hentes: Bergens tall under Bergens navn — aldri nytt navn på gammelt tall.
    expect(harRing(81)).toBe(true);
    expect(sted(container)).toBe('Bergen');
    expect(stripe().dataset.omrade).toBe('Bergen');

    await act(async () => nytt.slipp(ok(55)));
    await ring(55);
    expect(sted(container)).toBe('Trondheim');
    expect(stripe().dataset.omrade).toBe('Trondheim');
    // Den ferske posisjonen er lagret til neste åpning.
    expect(JSON.parse(window.localStorage.getItem(HUSKET_POSISJON_NOKKEL) ?? '{}')).toMatchObject({ lat: 63.43, lng: 10.4 });
    // Én hendelse og én bruksdag for hele åpningen, selv om kortet byttet sted.
    expect(klarHendelser).toBe(1);
    expect(bruksdager).toEqual(['hjem:egen']);
  });

  it('kappløp: et tregt svar for det gamle stedet kan aldri havne under det nye navnet', async () => {
    const gammelt = utsatt();
    const nytt = utsatt();
    svarPerRute[rute(BERGEN)] = () => gammelt.løfte;
    svarPerRute[rute(TRONDHEIM)] = () => nytt.løfte;
    geo.stille.mockResolvedValue({ latitude: TRONDHEIM.lat, longitude: TRONDHEIM.lng });
    const { container } = tegn();
    await waitFor(() => expect(kallTil(TRONDHEIM)).toBe(1));

    // Bergen svarer ETTER at kortet har bedt om Trondheim.
    await act(async () => gammelt.slipp(ok(81)));
    expect(sted(container)).not.toBe('Trondheim');

    await act(async () => nytt.slipp(ok(55)));
    await ring(55);
    expect(sted(container)).toBe('Trondheim');
    expect(harRing(81)).toBe(false);
  });
});

describe('MushroomDayCard — når hentingen feiler', () => {
  it('første henting feiler (502): ingenting vises — ikke et ødelagt kort', async () => {
    svarPerRute[rute(OSLO)] = () => Promise.resolve(status(502));
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(klarHendelser).toBe(0);
    expect(bruksdager).toEqual([]);
  });

  it('nettet er nede ved første henting: det samme', async () => {
    svarPerRute[rute(OSLO)] = () => Promise.reject(new TypeError('Failed to fetch'));
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(klarHendelser).toBe(0);
  });

  it('feiler hentingen for et NYTT sted, blir det som vises stående — med sitt eget sted', async () => {
    svarPerRute[rute(BERGEN)] = () => Promise.resolve(status(502));
    geo.trykk.mockResolvedValue({ latitude: BERGEN.lat, longitude: BERGEN.lng });
    const { container } = tegn();
    await ring(72);

    fireEvent.click(delPosisjon()!);
    await waitFor(() => expect(kallTil(BERGEN)).toBeGreaterThan(0));
    await act(async () => {});
    await act(async () => {});
    expect(harRing(72)).toBe(true);
    expect(sted(container)).toBe('Oslo · omtrentlig');
    expect(stripe().dataset.kilde).toBe('standard');
  });
});

describe('MushroomDayCard — brukerens eget trykk', () => {
  it('«Del posisjon»: henter for stedet, lagrer det, og kortet følger med', async () => {
    geo.trykk.mockResolvedValue({ latitude: BERGEN.lat, longitude: BERGEN.lng });
    const { container } = tegn();
    await ring(72);

    fireEvent.click(delPosisjon()!);
    await ring(81);
    expect(sted(container)).toBe('Bergen');
    expect(delPosisjon()).toBe(null);
    // En måling fra denne åpningen bekrefter posisjonen: ingen lenke for å rette den.
    expect(minPosisjon()).toBe(null);
    expect(stripe().dataset.kilde).toBe('egen');
    expect(JSON.parse(window.localStorage.getItem(HUSKET_POSISJON_NOKKEL) ?? '{}')).toMatchObject({ lat: 60.39, lng: 5.32 });
  });

  it('bruksdagen er frosset: aldri «standard» og så «egen» for samme åpning', async () => {
    geo.trykk.mockResolvedValue({ latitude: BERGEN.lat, longitude: BERGEN.lng });
    tegn();
    await ring(72);
    fireEvent.click(delPosisjon()!);
    await ring(81);
    await act(async () => {});
    expect(bruksdager).toEqual(['hjem:standard']);
    expect(klarHendelser).toBe(1);
  });

  it('egen posisjon i SAMME rute som standardområdet: kortet slutter å si «omtrentlig»', async () => {
    geo.trykk.mockResolvedValue({ latitude: 59.9121, longitude: 10.7513 });
    const { container } = tegn();
    await ring(72);
    fireEvent.click(delPosisjon()!);
    await waitFor(() => expect(sted(container)).toBe('Oslo'));
    expect(delPosisjon()).toBe(null);
    expect(stripe().dataset.kilde).toBe('egen');
    expect(stripe().dataset.omrade).toBe('Oslo');
  });

  it('et nytt trykk etter en feilet henting prøver igjen — også når posisjonen er den samme', async () => {
    svarPerRute[rute(BERGEN)] = () => Promise.resolve(status(502));
    geo.trykk.mockResolvedValue({ latitude: BERGEN.lat, longitude: BERGEN.lng });
    const { container } = tegn();
    await ring(72);

    // Første trykk: hentingen for Bergen feiler, Oslo står.
    fireEvent.click(delPosisjon()!);
    await waitFor(() => expect(kallTil(BERGEN)).toBeGreaterThan(0));
    await act(async () => {});
    await act(async () => {});
    const etterForsteTrykk = kallTil(BERGEN);
    expect(sted(container)).toBe('Oslo · omtrentlig');

    // Andre trykk, samme sted: nå svarer ruta. Trykket skal ikke være dødt.
    svarPerRute[rute(BERGEN)] = () => Promise.resolve(ok(81));
    fireEvent.click(delPosisjon()!);
    await ring(81);
    expect(sted(container)).toBe('Bergen');
    expect(kallTil(BERGEN)).toBe(etterForsteTrykk + 1);
  });

  it('avslått eller utilgjengelig: kortet står som det sto', async () => {
    geo.trykk.mockRejectedValue(new Error('Posisjonstilgang er avslått.'));
    const { container } = tegn();
    await ring(72);
    fireEvent.click(delPosisjon()!);
    await act(async () => {});
    expect(harRing(72)).toBe(true);
    expect(sted(container)).toBe('Oslo · omtrentlig');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('MushroomDayCard — språkbytte og ny åpning', () => {
  it('standardområdet følger språket; hendelsen og bruksdagen er alt frosset', async () => {
    const visning = tegn();
    await ring(72);
    expect(sted(visning.container)).toBe('Oslo · omtrentlig');

    visning.bytt('sv');
    await screen.findByRole('img', { name: 'Väder och säsong i dag: 64 av 100' });
    expect(sted(visning.container)).toBe('Stockholm · ungefärlig');
    expect(klarHendelser).toBe(1);
    expect(bruksdager).toEqual(['hjem:standard']);
  });

  it('en ny åpning av forsiden sender «kortet har data» på nytt — tilbudsarket lytter per åpning', async () => {
    const klient = nyKlient();
    tegn({ klient });
    await ring(72);
    expect(klarHendelser).toBe(1);
    cleanup();

    tegn({ klient });
    await ring(72);
    await waitFor(() => expect(klarHendelser).toBe(2));
    await waitFor(() => expect(bruksdager).toEqual(['hjem:standard', 'hjem:standard']));
  });
});

describe('MushroomDayCard — utenom sesongen', () => {
  it('viser veien videre i stedet for å gjenta dommen som banner', async () => {
    svarPerRute[rute(OSLO)] = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...prognose(12),
            today: { ...prognose(12).today, title: 'Utenom soppsesongen' },
            flush: { status: 'dormant', daysUntil: null, title: 'Utenom soppsesongen', message: 'Samme setning.', reason: 'offSeason' }
          })
      });
    tegn({ props: { innlogget: true } });
    await ring(12);
    expect(screen.getAllByText('Utenom soppsesongen')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Se hva som har sesong nå/ }).getAttribute('href')).toBe('/calendar');
    expect(screen.getByRole('link', { name: /Dine steder fra sesongen/ }).getAttribute('href')).toBe('/mine-steder');
  });
});

/**
 * Banneret i skuldrene (flush.ts). Målt 16. november: et GRØNT «Forholdene er
 * modne nå 🍄 — soppen kommer nå. Ta turen ut!» under en gul ring på 69. Nå er
 * ordene sesongkvalifisert, og fargen følger ordene: grønt er kortets «dra nå».
 */
describe('MushroomDayCard — banneret i skuldrene', () => {
  const medBanner = (flush: Record<string, unknown>) => () =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...prognose(69), flush }) });

  it('sent i sesongen: banneret er gult, som ringen over det', async () => {
    svarPerRute[rute(OSLO)] = medBanner({
      status: 'fruiting',
      daysUntil: 0,
      title: 'Fuktig og mildt — men sent i sesongen',
      message: 'Forholdene er fortsatt gode nok for de sene artene.',
      shoulder: 'late'
    });
    tegn();
    await ring(69);
    const banner = screen.getByText('Fuktig og mildt — men sent i sesongen').parentElement!;
    expect(banner.className).toContain('bg-amber-50');
    expect(banner.className).not.toContain('bg-forest-50');
  });

  it('høysesongens «modne nå» er fortsatt grønt', async () => {
    svarPerRute[rute(OSLO)] = medBanner({
      status: 'fruiting',
      daysUntil: 0,
      title: 'Forholdene er modne nå 🍄',
      message: 'Fuktig mark og mildt vær.'
    });
    tegn();
    await ring(69);
    expect(screen.getByText('Forholdene er modne nå 🍄').parentElement!.className).toContain('bg-forest-50');
  });

  it('fargen per status: bare et kvalifisert «modne» bytter farge', () => {
    expect(flushTint({ status: 'fruiting' })).toContain('bg-forest-50');
    expect(flushTint({ status: 'fruiting', shoulder: 'late' })).toContain('bg-amber-50');
    expect(flushTint({ status: 'fruiting', shoulder: 'early' })).toContain('bg-amber-50');
    expect(flushTint({ status: 'soon', shoulder: 'late' })).toBe(flushTint({ status: 'soon' }));
    expect(flushTint({ status: 'building', shoulder: 'late' })).toBe(flushTint({ status: 'building' }));
    expect(flushTint({ status: 'dry' })).toContain('bg-gray-50');
    expect(flushTint({ status: 'dormant' })).toContain('bg-gray-50');
  });
});

/**
 * Hentingen går gjennom appens QueryClient. Før holdt kortet svaret i sin egen
 * tilstand: hver retur til forsiden (Hjem → Kart → Hjem) startet på «Sjekker
 * soppforholdene …» og spurte på nytt om noe ruta selv holder i 30 minutter.
 */
/** Fast klokke: nøkkelen i minnet bærer dagen, så testene skal ikke avhenge av når de kjøres. */
const KLOKKA = new Date('2026-09-15T08:00:00Z');
function frysKlokka(naar: Date = KLOKKA) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(naar);
}

describe('MushroomDayCard — prognosen huskes mellom åpninger', () => {
  beforeEach(() => {
    frysKlokka();
    // Etter at klokka er stilt: en husket posisjon «fra framtida» forkastes.
    lagreHusketPosisjon(BERGEN.lat, BERGEN.lng);
  });

  it('tilbake på forsiden innen et kvarter: kortet står der med en gang, uten nytt kall', async () => {
    const klient = nyKlient();
    tegn({ klient });
    await ring(81);
    cleanup(); // Hjem → Kart

    const { container } = tegn({ klient }); // Kart → Hjem
    // Ingen venting: tallet og stedet står der i det kortet er tegnet.
    expect(harRing(81)).toBe(true);
    expect(venter()).toBe(false);
    expect(sted(container)).toBe('Bergen');
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Åpningen teller som en åpning: hendelse og bruksdag, som ved en henting.
    expect(klarHendelser).toBe(2);
    expect(bruksdager).toEqual(['hjem:egen', 'hjem:egen']);
  });

  it('etter et kvarter: kortet står der med en gang, og friskes opp i bakgrunnen', async () => {
    const klient = nyKlient();
    tegn({ klient });
    await ring(81);
    cleanup();

    vi.setSystemTime(new Date(KLOKKA.getTime() + PROGNOSE_FERSK_MS + 1_000));
    svarPerRute[rute(BERGEN)] = () => Promise.resolve(ok(86));
    tegn({ klient });
    expect(harRing(81)).toBe(true);
    await ring(86);
    expect(kallTil(BERGEN)).toBe(2);
  });

  it('feiler oppfriskningen i bakgrunnen, står det som alt vises', async () => {
    const klient = nyKlient();
    tegn({ klient });
    await ring(81);
    cleanup();

    vi.setSystemTime(new Date(KLOKKA.getTime() + PROGNOSE_FERSK_MS + 1_000));
    svarPerRute[rute(BERGEN)] = () => Promise.resolve(status(502));
    const { container } = tegn({ klient });
    await waitFor(() => expect(kallTil(BERGEN)).toBe(1 + 1 + PROGNOSE_NYE_FORSOK));
    await act(async () => {});
    expect(harRing(81)).toBe(true);
    expect(sted(container)).toBe('Bergen');
  });

  it('et trykk på «Min posisjon» i samme rute henter ikke på nytt mens svaret er ferskt — men bekrefter posisjonen', async () => {
    geo.trykk.mockResolvedValue({ latitude: 60.3912, longitude: 5.3187 }); // samme ~1 km-rute som den huskede
    tegn();
    await ring(81);
    fireEvent.click(minPosisjon()!);
    await waitFor(() => expect(minPosisjon()).toBe(null));
    await act(async () => {});
    expect(kallTil(BERGEN)).toBe(1);
  });

  it('…men er svaret eldre enn et kvarter (kortet har stått åpent), hentes det på nytt', async () => {
    geo.trykk.mockResolvedValue({ latitude: 60.3912, longitude: 5.3187 });
    tegn();
    await ring(81);

    vi.setSystemTime(new Date(KLOKKA.getTime() + PROGNOSE_FERSK_MS + 1_000));
    svarPerRute[rute(BERGEN)] = () => Promise.resolve(ok(86));
    fireEvent.click(minPosisjon()!);
    await ring(86);
    expect(kallTil(BERGEN)).toBe(2);
  });

  it('en ny dag er en ny prognose: gårsdagens svar tegnes aldri som dagens', async () => {
    vi.setSystemTime(new Date('2026-09-15T23:55:00Z'));
    lagreHusketPosisjon(BERGEN.lat, BERGEN.lng);
    const klient = nyKlient();
    tegn({ klient });
    await ring(81);
    cleanup();

    // Ti minutter senere — innenfor kvarteret, men over midnatt i rutas klokke (UTC).
    vi.setSystemTime(new Date('2026-09-16T00:05:00Z'));
    const nytt = utsatt();
    svarPerRute[rute(BERGEN)] = () => nytt.løfte;
    tegn({ klient });
    expect(harRing(81)).toBe(false);
    expect(venter()).toBe(true);
    await act(async () => nytt.slipp(ok(40)));
    await ring(40);
  });

  it('språket er en del av nøkkelen: et norsk svar tegnes aldri for en svensk leser', async () => {
    const klient = nyKlient();
    tegn({ klient });
    await ring(81);
    cleanup();

    const nytt = utsatt();
    svarPerRute[rute(BERGEN)] = () => nytt.løfte;
    tegn({ klient, sprak: 'sv' });
    expect(venter()).toBe(false); // «Kollar svampförhållandena …» på svensk
    expect(screen.queryByText('Kollar svampförhållandena …')).not.toBe(null);
    expect(screen.queryByRole('img')).toBe(null);
    await act(async () => nytt.slipp(ok(81)));
    await screen.findByRole('img', { name: 'Väder och säsong i dag: 81 av 100' });
    expect(kallTil(BERGEN)).toBe(2);
  });

  it('nøkkelen: rute (to desimaler), språk og dag — ikke hvor posisjonen kom fra', () => {
    expect(prognoseNokkel({ lat: 60.3912, lng: 5.3187 }, 'nb', '2026-09-15')).toEqual([
      'mushroom-forecast',
      '60.39',
      '5.32',
      'nb',
      '2026-09-15'
    ]);
  });
});

describe('MushroomDayCard — et kall som feiler', () => {
  it('prøves én gang til: kortet kommer, i stedet for å være borte til neste åpning', async () => {
    let forsok = 0;
    svarPerRute[rute(OSLO)] = () => {
      forsok += 1;
      return Promise.resolve(forsok === 1 ? status(502) : ok(72));
    };
    tegn();
    await ring(72);
    expect(kallTil(OSLO)).toBe(2);
    expect(klarHendelser).toBe(1);
  });

  it('sier ruta nei (429), spør kortet ikke en gang til', async () => {
    svarPerRute[rute(OSLO)] = () => Promise.resolve(status(429));
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    await act(async () => {});
    expect(kallTil(OSLO)).toBe(1);
  });

  it('gir opp etter det ene nye forsøket', async () => {
    svarPerRute[rute(OSLO)] = () => Promise.resolve(status(502));
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(kallTil(OSLO)).toBe(1 + PROGNOSE_NYE_FORSOK);
  });

  it('neste åpning prøver igjen — og holder av plassen imens, så siden ikke hopper når kortet kommer', async () => {
    const klient = nyKlient();
    svarPerRute[rute(OSLO)] = () => Promise.resolve(status(502));
    const forste = tegn({ klient });
    await waitFor(() => expect(forste.container.innerHTML).toBe(''));
    cleanup();

    const nytt = utsatt();
    svarPerRute[rute(OSLO)] = () => nytt.løfte;
    const { container } = tegn({ klient });
    await waitFor(() => expect(kallTil(OSLO)).toBe(1 + PROGNOSE_NYE_FORSOK + 1));
    expect(venter()).toBe(true);
    expect(container.firstElementChild?.className).toContain('min-h-[15rem]');
    await act(async () => nytt.slipp(ok(72)));
    await ring(72);
  });

  it('uten dekning: kortet prøver likevel, og blir ikke stående på «Sjekker soppforholdene …»', async () => {
    // Nettleseren har meldt «offline». Som standard setter TanStack da
    // spørringen på vent, og kallet ville aldri blitt sendt — eller feilet.
    onlineManager.setOnline(false);
    svarPerRute[rute(OSLO)] = () => Promise.reject(new TypeError('Failed to fetch'));
    const { container } = tegn();
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(kallTil(OSLO)).toBe(1 + PROGNOSE_NYE_FORSOK);
  });
});

/**
 * Tilbudsarket venter på «kortet har data». Med en henting var det alltid et
 * nettverkskall mellom monteringen og hendelsen; når svaret ligger i minnet,
 * kommer hendelsen med en gang. Arket må ha lytteren sin på plass da — ellers
 * venter det på fristen (seks sekunder) i stedet for å komme når kortet er
 * klart. Derfor står arket FØR kortet i treet (src/app/__tests__/forside.test.tsx
 * holder den rekkefølgen), og dette er testen på at det er nok.
 */
describe('MushroomDayCard — tilbudsarket hører hendelsen også når svaret kommer fra minnet', () => {
  function forside(klient: QueryClient) {
    return render(
      <QueryClientProvider client={klient}>
        <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
          {/* Samme rekkefølge som på forsiden. */}
          <ProvGratisVedStart />
          <MushroomDayCard innlogget />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }

  /** Arkets pusterom og frist er tidtakere; resten (React, TanStack) går på ekte tid. */
  function frysKlokkaOgTidtakerne() {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(KLOKKA);
  }

  beforeEach(() => {
    frysKlokka();
    lagreHusketPosisjon(BERGEN.lat, BERGEN.lng);
    // Velkomstintroen er alt sett; tilbudet er aldri vist.
    window.localStorage.setItem('mycelet:onboarding-v1', '1');
  });

  it('arket kommer etter pusterommet — ikke først når fristen for kortet går ut', async () => {
    const klient = nyKlient();
    // Første åpning fyller minnet.
    tegn({ klient });
    await ring(81);
    cleanup();
    expect(window.localStorage.getItem(PROVETILBUD_START_NOKKEL)).toBe(null);

    frysKlokkaOgTidtakerne();
    forside(klient);
    // Kortet er tegnet fra minnet, og hendelsen er sendt.
    expect(harRing(81)).toBe(true);
    expect(screen.queryByTestId('tilbudsark')).toBe(null);

    // Langt innenfor fristen: bare hendelsen kan ha sluppet arket fram.
    expect(PROVETILBUD_PUSTEROM_MS).toBeLessThan(FORSIDEKORT_FRIST_MS);
    act(() => {
      vi.advanceTimersByTime(PROVETILBUD_PUSTEROM_MS);
    });
    expect(screen.queryByTestId('tilbudsark')).not.toBe(null);
    // Og det var virkelig minnet som svarte: ett kall, fra første åpning.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Arket merker seg som vist i det det kommer.
    expect(window.localStorage.getItem(PROVETILBUD_START_NOKKEL)).not.toBe(null);
  });

  it('uten data i kortet kommer arket først ved fristen — så testen over ikke består av seg selv', async () => {
    frysKlokkaOgTidtakerne();
    svarPerRute[rute(BERGEN)] = () => new Promise(() => {}); // prognosen kommer aldri
    forside(nyKlient());
    act(() => {
      vi.advanceTimersByTime(PROVETILBUD_PUSTEROM_MS);
    });
    expect(screen.queryByTestId('tilbudsark')).toBe(null);
    act(() => {
      vi.advanceTimersByTime(FORSIDEKORT_FRIST_MS);
    });
    act(() => {
      vi.advanceTimersByTime(PROVETILBUD_PUSTEROM_MS);
    });
    expect(screen.queryByTestId('tilbudsark')).not.toBe(null);
  });
});
