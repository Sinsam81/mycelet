// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../messages/nb.json';

/**
 * «Gjenkjenningen virker ikke i appen» (eieren, 17. okt 2026): GPS-pluginen i
 * appen kunne tie for alltid etter én feil, og «Identifiser» ventet på
 * posisjonen før bildene ble sendt — knappen sto stille og ingenting skjedde.
 * Her tier posisjonen helt, og forespørselen skal likevel gå etter fristen.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/layout/PageWrapper', () => ({ PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/identify/AiFiksetBanner', () => ({ AiFiksetBanner: () => null }));
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => true }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/utils/image', () => ({
  optimizeImageForIdentification: vi.fn(async () => 'QUJD'),
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

// GPS-pluginen i 8.2.0-tilstanden: tillatelse gitt, men svaret kommer aldri.
const getCurrentPosition = vi.fn(() => new Promise(() => {}));
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    requestPermissions: vi.fn(async () => ({ location: 'granted' })),
    checkPermissions: vi.fn(async () => ({ location: 'granted' })),
    getCurrentPosition: () => getCurrentPosition(),
    clearWatch: vi.fn(async () => {})
  }
}));

const { default: IdentifyPage } = await import('../page');
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

function tegn() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb}>
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
    expect(mutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await flush();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ latitude: undefined, longitude: undefined, imagesBase64: ['QUJD'] });
    // Fristen havner i Sentry, så en plugin som tier aldri er usynlig igjen.
    expect(meld).toHaveBeenCalledWith(expect.objectContaining({ steg: 'posisjon' }));
    expect(push).toHaveBeenCalledWith('/identify/result');
  });

  it('et ekstra trykk mens den jobber, gir ikke et ekstra Kindwise-kall', async () => {
    tegn();
    await flush();
    const knapp = await leggTilBilde();

    fireEvent.click(knapp);
    fireEvent.click(knapp);
    fireEvent.click(knapp);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await flush();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
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
});
