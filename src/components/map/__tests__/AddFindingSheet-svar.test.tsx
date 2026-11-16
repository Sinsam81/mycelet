// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Hva skjemaet gjør med SVARET fra POST /api/findings — og med feil.
 *
 *  · `notice` på et vellykket svar: serverens setning vises som varsel, lenge
 *    nok til å leses, og funnet meldes til kartet som privat.
 *  · Uten `notice`: alt som før — kartet får nivået brukeren valgte.
 *  · Feil: rutas egen, oversatte tekst, eller katalogens — aldri nettleserens
 *    engelske «Load failed» eller en tekst fra et svar som ikke er rutas.
 *  · Artssøket: et komma i søkefeltet er tekst, ikke filtersyntaks.
 */

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

const posisjon = vi.hoisted(() => ({ los: null as null | ((fix: unknown) => void) }));
vi.mock('@/lib/map/fersk-posisjon', () => ({
  finnFerskPosisjon: () =>
    new Promise((resolve) => {
      posisjon.los = resolve;
    })
}));

const orKall = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const sporring = {
      select: () => sporring,
      or: (filter: string) => {
        orKall.push(filter);
        return sporring;
      },
      order: () => sporring,
      limit: async () => ({ data: [], error: null })
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
      from: () => sporring
    };
  }
}));

vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => false }));

const { AddFindingSheet } = await import('../AddFindingSheet');

const fetchMock = vi.fn();

function rendrer(locale: 'nb' | 'sv' = 'nb') {
  const onSaved = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <AddFindingSheet kartsenter={{ lat: 59.9, lng: 10.7 }} kartFlyttet={false} onClose={vi.fn()} onSaved={onSaved} />
    </NextIntlClientProvider>
  );
  return { onSaved };
}

async function maalOgLagre(navn = 'Lagre funn') {
  await act(async () => {
    posisjon.los?.({ latitude: 59.95, longitude: 10.71, accuracy: 8 });
  });
  fireEvent.click(screen.getByRole('button', { name: navn }));
}

beforeEach(() => {
  toastMock.mockReset();
  orKall.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AddFindingSheet — svaret fra lagringen', () => {
  it('uten notice: kartet får nivået brukeren valgte, og ingen ekstra beskjed', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: 'x' }) });
    const { onSaved } = rendrer();
    await maalOgLagre();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined, 'approximate'));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('med notice: serverens setning vises lenge, og funnet er privat for kartet', async () => {
    const message = 'Funnet ble lagret som privat.';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: 'x', notice: { code: 'zone_saved_private', message } })
    });
    const { onSaved } = rendrer();
    await maalOgLagre();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined, 'private'));
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [tekst, valg] = toastMock.mock.calls[0] as [string, { duration: number }];
    expect(tekst).toBe(message);
    // Lengre enn standardvarselet (4 s): dette er en setning som skal leses.
    expect(valg.duration).toBeGreaterThanOrEqual(8000);
  });

  it('en notice uten tekst regnes ikke som en beskjed', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, notice: { code: 'x', message: '' } }) });
    const { onSaved } = rendrer();
    await maalOgLagre();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined, 'approximate'));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('viser rutas egen, oversatte feiltekst', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Ogiltig synlighet', code: 'invalid_visibility' }) });
    const { onSaved } = rendrer();
    await maalOgLagre();
    expect(await screen.findByText('Ogiltig synlighet')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('et svar som ikke er rutas eget (ingen code), gir katalogens tekst', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'upstream connect error' }) });
    rendrer();
    await maalOgLagre();
    expect(await screen.findByText(nb.AddFindingSheet.errorSaveFinding)).toBeTruthy();
    expect(screen.queryByText('upstream connect error')).toBeNull();
  });

  it('uten dekning: katalogens tekst, ikke nettleserens engelske', async () => {
    fetchMock.mockRejectedValue(new TypeError('Load failed'));
    rendrer('sv');
    await maalOgLagre('Spara fynd');
    expect(await screen.findByText(sv.AddFindingSheet.errorSaveFinding)).toBeTruthy();
    expect(screen.queryByText('Load failed')).toBeNull();
  });
});

describe('AddFindingSheet — artssøket', () => {
  it('et komma og en parentes i søket er tekst, ikke filtersyntaks', async () => {
    rendrer();
    fireEvent.change(screen.getByPlaceholderText(nb.AddFindingSheet.speciesPlaceholder), {
      target: { value: 'kant,id.not.is.null)' }
    });
    await waitFor(() => expect(orKall).toHaveLength(1));
    // Fire vilkår — ett per kolonne — og verdien i anførselstegn.
    const filter = orKall[0];
    expect(filter.match(/\.ilike\./g)).toHaveLength(4);
    expect(filter).toContain('norwegian_name.ilike."%kant,id.not.is.null)%"');
  });
});
