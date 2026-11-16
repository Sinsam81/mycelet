// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «Gjenkjenningen virker ikke i appen» (eieren, 17. okt 2026): GPS-pluginen i
 * appen kunne tie for alltid etter én feil, og «Identifiser» ventet på
 * posisjonen før bildene ble sendt — knappen sto stille og ingenting skjedde.
 * Her tier posisjonen helt, og forespørselen skal likevel gå etter fristen
 * (pluginens timeout + margin).
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => true }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
// BildeFeil og bildeFeilKode er de ekte: siden oversetter ut fra koden i dem.
const optimaliser = vi.hoisted(() => vi.fn(async (_fil: File) => 'QUJD'));
vi.mock('@/lib/utils/image', async (original) => ({
  ...(await original<typeof import('@/lib/utils/image')>()),
  optimizeImageForIdentification: optimaliser,
  base64ToBlob: () => new Blob(['x'], { type: 'image/jpeg' }),
  reencodeBase64ForHistory: vi.fn()
}));

const captureNativePhoto = vi.fn(async () => new File(['x'], 'sopp.jpg', { type: 'image/jpeg' }));
vi.mock('@/lib/native/camera', async (original) => ({
  ...(await original<typeof import('@/lib/native/camera')>()),
  captureNativePhoto: () => captureNativePhoto()
}));

const meld = vi.fn();
vi.mock('@/lib/identifications/meld-feil', () => ({ meldIdentifiseringsfeil: (f: unknown) => meld(f) }));

const mutateAsync = vi.fn(async (_foresporsel: unknown) => ({
  identificationId: null,
  historyImagePath: null,
  originalImageDataUrl: 'data:image/jpeg;base64,QUJD',
  originalImageDataUrls: ['data:image/jpeg;base64,QUJD'],
  location: { latitude: null, longitude: null },
  suggestions: [],
  isPlant: true,
  safetyDataIncomplete: false,
  freeQuotaRemaining: null
}));
vi.mock('@/lib/hooks/useIdentify', async (original) => ({
  ...(await original<typeof import('@/lib/hooks/useIdentify')>()),
  useIdentify: () => ({ mutateAsync, isPending: false })
}));

/**
 * Som Capacitors registerPlugin-proxy (@capacitor/core): ALLE ukjente
 * egenskapsnavn — også `then` — blir en metode som avviser med «not
 * implemented». Et vanlig objekt her skjulte feilen i PR #284, der tillegget
 * ble gitt som verdien til et løfte og alle oppslag hang.
 */
function somCapacitorTillegg(navn: string, metoder: () => Record<string | symbol, unknown>) {
  return new Proxy(
    {},
    {
      get(_m, prop) {
        if (prop === '$typeof') return undefined;
        const kjente = metoder();
        if (prop in kjente) return kjente[prop];
        return () => Promise.reject(new Error(`"${navn}.${String(prop)}()" is not implemented on ios`));
      }
    }
  );
}

// GPS-pluginen i 8.2.0-tilstanden: tillatelse gitt, men svaret kommer aldri.
const getCurrentPosition = vi.fn(() => new Promise(() => {}));
const geoMetoder = {
  requestPermissions: vi.fn(async () => ({ location: 'granted' })),
  checkPermissions: vi.fn(async () => ({ location: 'granted' })),
  getCurrentPosition: () => getCurrentPosition(),
  clearWatch: vi.fn(async () => {})
};
vi.mock('@capacitor/geolocation', () => ({ Geolocation: somCapacitorTillegg('Geolocation', () => geoMetoder) }));

const { default: IdentifyPage } = await import('../page');
const { NATIV_FRIST_MARGIN_MS, POSISJON_TIMEOUT_MS } = await import('@/lib/hooks/useGeolocation');
const FRIST = POSISJON_TIMEOUT_MS + NATIV_FRIST_MARGIN_MS;
// Laster GPS-pluginen én gang med ekte tidtakere (useGeolocation gjenbruker den).
await (await import('@/lib/hooks/useGeolocation')).hasGeolocationPermission();
const ekteSetImmediate = setImmediate;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => ekteSetImmediate(r));
    });
  }
}

function tegn(sprak: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={sprak} messages={sprak === 'nb' ? nb : sv}>
      <IdentifyPage />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ enabled: true })));
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  push.mockReset();
  meld.mockReset();
  mutateAsync.mockClear();
  getCurrentPosition.mockClear();
  sessionStorage.clear();
});

async function leggTilBilde() {
  fireEvent.click(screen.getByRole('button', { name: nb.Identify.takeOrChoosePhoto }));
  await flush();
  return screen.getByRole('button', { name: /Identifiser \(1 bilde\)/ });
}

describe('«Identifiser» når GPS-pluginen tier', () => {
  it('sender bildene uten posisjon etter fristen, i stedet for å vente for alltid', async () => {
    tegn();
    await flush();
    const knapp = await leggTilBilde();

    fireEvent.click(knapp);
    await flush();
    // Synlig fra første trykk: posisjonsfasen har egen tekst, og knappen er sperret.
    expect(screen.getByText(nb.Identify.locating)).toBeTruthy();
    expect((knapp as HTMLButtonElement).disabled).toBe(true);
    expect(mutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FRIST - 1);
    });
    await flush();
    expect(mutateAsync).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flush();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ latitude: undefined, longitude: undefined, imagesBase64: ['QUJD'] });
    // Fristen havner i Sentry, så en plugin som tier aldri er usynlig igjen.
    expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'posisjon' }));
    expect(push).toHaveBeenCalledWith('/identify/result');
    // Sperret helt til siden byttes — et trykk nå ville kostet et nytt kall.
    expect((knapp as HTMLButtonElement).disabled).toBe(true);

    // … men gjenoppretter nettleseren siden fra bfcache, er forsøket over.
    const gjenopprettet = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(gjenopprettet, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(gjenopprettet);
    });
    expect((knapp as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(nb.Identify.analyzing)).toBeNull();
  });

  it('tre trykk før React rekker å tegne på nytt, gir ett Kindwise-kall', async () => {
    tegn();
    await flush();
    const knapp = await leggTilBilde();

    // Alle tre i samme act: ingen ny tegning mellom dem, så bare ref-vakta stopper 2 og 3.
    act(() => {
      knapp.click();
      knapp.click();
      knapp.click();
    });
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FRIST);
    });
    await flush();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('forlater brukeren siden mens posisjonen hentes, går det ikke noe betalt kall', async () => {
    const { unmount } = tegn();
    await flush();
    const knapp = await leggTilBilde();
    fireEvent.click(knapp);
    await flush();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FRIST);
    });
    await flush();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe('kamera- og bildetilgang avslått', () => {
  it('viser norsk forklaring i stedet for pluginens engelske tekst', async () => {
    captureNativePhoto.mockRejectedValueOnce(new Error('User denied access to photos'));
    tegn();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: nb.Identify.takeOrChoosePhoto }));
    await flush();
    expect(screen.getByText(nb.Identify.photosDenied)).toBeTruthy();
    expect(screen.queryByText('User denied access to photos')).toBeNull();
    expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'kamera' }));
  });

  it('en avvisning siden ikke kjenner igjen vises aldri som pluginens rå engelske tekst', async () => {
    captureNativePhoto.mockRejectedValueOnce(new Error('Unable to resolve image picker'));
    tegn();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: nb.Identify.takeOrChoosePhoto }));
    await flush();
    expect(screen.getByText(nb.Identify.couldNotGetImage)).toBeTruthy();
    expect(screen.queryByText('Unable to resolve image picker')).toBeNull();
    // Den rå teksten er ikke borte — den står i Sentry.
    expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'kamera' }));
  });
});

/**
 * image.ts kastet `new Error('Kunne ikke lese bilde.')`, og siden viste
 * `err.message` rått — norsk til svenske brukere. Nå bærer feilen en kode, og
 * siden velger teksten fra katalogen.
 */
describe('bildet lar seg ikke behandle', () => {
  async function velgBildeSomFeiler(feil: unknown, sprak: 'nb' | 'sv' = 'nb') {
    const { BildeFeil } = await import('@/lib/utils/image');
    optimaliser.mockRejectedValueOnce(typeof feil === 'string' ? new BildeFeil(feil as never) : feil);
    tegn(sprak);
    await flush();
    const katalog = sprak === 'nb' ? nb : sv;
    fireEvent.click(screen.getByRole('button', { name: katalog.Identify.takeOrChoosePhoto }));
    await flush();
  }

  it('et bilde nettleseren ikke kan lese får sin egen tekst — med noe brukeren kan gjøre', async () => {
    await velgBildeSomFeiler('ulesbart');
    expect(screen.getByText(nb.Identify.imageUnreadable)).toBeTruthy();
    expect(screen.queryByText('Kunne ikke lese bilde.')).toBeNull();
    expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'bilde' }));
  });

  it('en svensk bruker får den på svensk, ikke den norske setningen fra image.ts', async () => {
    await velgBildeSomFeiler('ulesbart', 'sv');
    expect(screen.getByText(sv.Identify.imageUnreadable)).toBeTruthy();
    expect(screen.queryByText('Kunne ikke lese bilde.')).toBeNull();
    expect(sv.Identify.imageUnreadable).not.toBe(nb.Identify.imageUnreadable);
  });

  it('de andre bildefeilene får den generelle teksten fra katalogen', async () => {
    await velgBildeSomFeiler('canvas', 'sv');
    expect(screen.getByText(sv.Identify.couldNotGetImage)).toBeTruthy();
    expect(screen.queryByText('Kunne ikke initialisere canvas.')).toBeNull();
  });

  it('nettleserens egne feil vises aldri rått', async () => {
    // En DOMException er en Error i nettleseren. I jsdom er den det ikke, så
    // testen bygger feilen slik den ser ut for siden: en Error med navnet.
    await velgBildeSomFeiler(
      Object.assign(new Error('The string to be decoded is not correctly encoded.'), { name: 'InvalidCharacterError' })
    );
    expect(screen.getByText(nb.Identify.couldNotGetImage)).toBeTruthy();
    expect(screen.queryByText(/not correctly encoded/)).toBeNull();
  });
});

describe('forespørselen som aldri får et brukbart svar', () => {
  async function identifiserMedFeil(feil: unknown) {
    mutateAsync.mockRejectedValueOnce(feil);
    tegn();
    await flush();
    const knapp = await leggTilBilde();
    fireEvent.click(knapp);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FRIST);
    });
    await flush();
    return knapp as HTMLButtonElement;
  }

  // Lenka i sidehodet har samme etikett og står der alltid. Den som teller
  // her, er den som dukker opp UNDER feilteksten.
  const historikklenker = () =>
    screen.getAllByRole('link').filter((lenke) => lenke.getAttribute('href') === '/identifiseringer');

  it('opplastingen sto stille → bildene kom aldri fram: prøv igjen, ingen omvei om historikken', async () => {
    const { IdentifyError } = await import('@/lib/hooks/useIdentify');
    const knapp = await identifiserMedFeil(new IdentifyError('diagnosetekst til Sentry', 'upload_stalled'));
    expect(screen.getByText(nb.Identify.uploadStalledError)).toBeTruthy();
    expect(screen.queryByText('diagnosetekst til Sentry')).toBeNull();
    // Ingenting er brukt, og bildet ligger fortsatt i feltet: et nytt forsøk er ett trykk.
    expect(knapp.disabled).toBe(false);
    expect(historikklenker()).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
    expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'foresporsel', kode: 'upload_stalled' }));
  });

  it.each(['timeout', 'response_lost'])(
    'klienten ga opp etter at bildene var sendt (%s) → pek til historikken, ikke et blindt nytt forsøk',
    async (kode) => {
      // Serveren kan ha brukt kvoteenheten og skrevet svaret i historikken.
      // «Prøv igjen» alene ville kostet én enhet til for samme sopp.
      const { IdentifyError } = await import('@/lib/hooks/useIdentify');
      const knapp = await identifiserMedFeil(new IdentifyError('diagnosetekst til Sentry', kode));
      expect(screen.getByText(nb.Identify.timeoutError)).toBeTruthy();
      expect(screen.queryByText('diagnosetekst til Sentry')).toBeNull();
      // Lenka under feilteksten kommer i tillegg til den i sidehodet.
      expect(historikklenker()).toHaveLength(2);
      // Ikke en blindvei: fant de ingenting i historikken, kan de prøve på nytt.
      expect(knapp.disabled).toBe(false);
      expect(push).not.toHaveBeenCalled();
      expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'foresporsel', kode }));
    }
  );

  it('lenka til historikken forsvinner når et nytt forsøk starter', async () => {
    const { IdentifyError } = await import('@/lib/hooks/useIdentify');
    const knapp = await identifiserMedFeil(new IdentifyError('timeout', 'timeout'));
    expect(historikklenker()).toHaveLength(2);
    fireEvent.click(knapp);
    await flush();
    expect(historikklenker()).toHaveLength(1);
    expect(screen.queryByText(nb.Identify.timeoutError)).toBeNull();
  });

  it('lenka følger feilen den hører til — den blir ikke stående under en annen', async () => {
    const { IdentifyError } = await import('@/lib/hooks/useIdentify');
    await identifiserMedFeil(new IdentifyError('timeout', 'timeout'));
    expect(historikklenker()).toHaveLength(2);
    // Neste feil er en helt annen: bildetilgangen er avslått.
    captureNativePhoto.mockRejectedValueOnce(new Error('User denied access to photos'));
    fireEvent.click(screen.getByRole('button', { name: nb.Identify.slotUnderside }));
    await flush();
    expect(screen.getByText(nb.Identify.photosDenied)).toBeTruthy();
    expect(historikklenker()).toHaveLength(1);
  });

  it('en brutt forbindelse før alt var sendt → «sjekk dekningen», som før', async () => {
    await identifiserMedFeil(new TypeError('Network request failed'));
    expect(screen.getByText(nb.Identify.networkError)).toBeTruthy();
    expect(screen.queryByText('Network request failed')).toBeNull();
    expect(historikklenker()).toHaveLength(1);
  });

  it('en ukjent kode fra klienten vises aldri som rå diagnosetekst', async () => {
    const { IdentifyError } = await import('@/lib/hooks/useIdentify');
    await identifiserMedFeil(new IdentifyError('diagnosetekst til Sentry', 'noe_nytt'));
    expect(screen.getByText(nb.Identify.identifyFailed)).toBeTruthy();
    expect(screen.queryByText('diagnosetekst til Sentry')).toBeNull();
  });

  it('en feil som ikke kom fra kallet (full sessionStorage) vises aldri som nettleserens engelske tekst', async () => {
    // Samme forbehold som over: en Error med navnet, slik nettleseren gir den.
    await identifiserMedFeil(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }));
    expect(screen.getByText(nb.Identify.identifyFailed)).toBeTruthy();
    expect(screen.queryByText('The quota has been exceeded.')).toBeNull();
  });

  it('rutens egne feil vises fortsatt med serverens oversatte tekst', async () => {
    const { IdentifyError } = await import('@/lib/hooks/useIdentify');
    await identifiserMedFeil(
      new IdentifyError('AI-tjenesten svarer ikke akkurat nå. Prøv igjen om litt.', 'provider_timeout', 504, true)
    );
    expect(screen.getByText('AI-tjenesten svarer ikke akkurat nå. Prøv igjen om litt.')).toBeTruthy();
    expect(historikklenker()).toHaveLength(1);
  });

  it('plattformens HTML-svar (413/504) vises med katalogens tekst, ikke feilens egen', async () => {
    // Reserveteksten i useIdentify var hardkodet norsk og ble vist ordrett —
    // også til svenske brukere. Siden skal velge den oversatte selv.
    const { IdentifyError } = await import('@/lib/hooks/useIdentify');
    await identifiserMedFeil(new IdentifyError('rå tekst som ikke skal vises', undefined, 504, false));
    expect(screen.getByText(nb.Identify.identifyFailed)).toBeTruthy();
    expect(screen.queryByText('rå tekst som ikke skal vises')).toBeNull();
  });
});

describe('filfeltet på nett', () => {
  it('tvinger ikke kameraet — bildebiblioteket skal kunne velges', async () => {
    // capture="environment" åpner kameraet direkte på mobil og hopper over
    // velgeren. Knappen heter «Ta bilde / velg bilde»; begge halvdeler må være sanne.
    const { container } = tegn();
    await flush();
    const felt = container.querySelector('input[type="file"]');
    expect(felt).not.toBeNull();
    expect(felt!.getAttribute('accept')).toBe('image/*');
    expect(felt!.hasAttribute('capture')).toBe(false);
    // Ett bilde per felt — handleFile og feltindeksen er bygget rundt det.
    expect(felt!.hasAttribute('multiple')).toBe(false);
  });
});
