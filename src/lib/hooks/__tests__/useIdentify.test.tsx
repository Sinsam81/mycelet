// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { IdentifyError, useIdentify } = await import('../useIdentify');

function lagKrok() {
  const klient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={klient}>{children}</QueryClientProvider>;
  return renderHook(() => useIdentify(), { wrapper }).result;
}

const FORESPORSEL = { imagesBase64: ['abc'], originalImageDataUrls: ['data:image/jpeg;base64,abc'] };

async function feilFra(svar: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => svar));
  const krok = lagKrok();
  try {
    await krok.current.mutateAsync(FORESPORSEL);
  } catch (e) {
    return e;
  }
  throw new Error('ventet en feil');
}

afterEach(() => vi.unstubAllGlobals());

describe('useIdentify — feilen bærer status og om svaret var rutens JSON', () => {
  it('Vercels 413 er HTML: status 413, ikke JSON, generisk tekst', async () => {
    const feil = await feilFra(new Response('<html>Request Entity Too Large</html>', { status: 413, headers: { 'content-type': 'text/html' } }));
    expect(feil).toBeInstanceOf(IdentifyError);
    expect(feil).toMatchObject({ status: 413, json: false, code: undefined, message: 'Identifikasjon feilet' });
  });

  it('rutens 401 er JSON: status, kode og serverens tekst bevares', async () => {
    const feil = await feilFra(Response.json({ error: 'Ikke autentisert', code: 'unauthenticated' }, { status: 401 }));
    expect(feil).toMatchObject({ status: 401, json: true, code: 'unauthenticated', message: 'Ikke autentisert' });
  });

  it('et tidsavbrudd hos Vercel (504 HTML) skilles fra en feil i ruta (500 JSON)', async () => {
    const tidsavbrudd = await feilFra(new Response('An error occurred', { status: 504 }));
    const iRuta = await feilFra(Response.json({ error: 'En feil oppstod. Prøv igjen.', code: 'unexpected' }, { status: 500 }));
    expect(tidsavbrudd).toMatchObject({ status: 504, json: false });
    expect(iRuta).toMatchObject({ status: 500, json: true, code: 'unexpected' });
  });
});
