// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Banneret om automatisk sletting, og knappen «Behold konto».
 *
 * Det viste tre ting det ikke skulle: en norsk bekreftelse til svenske brukere
 * (rutens `message` var hardkodet), databasens egen feilmelding (rutens
 * `error` var `error.message`), og nettleserens «Load failed» ved brudd
 * (`err.message` rett i toasten). Ruta svarer nå oversatt; her låses det at
 * banneret aldri viser en tekst vi ikke har skrevet.
 *
 * Bare knappens tekster. Når banneret vises, og for hvem, er holdt utenfor
 * denne filen med vilje.
 */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));
// Alle tilfellene gjelder en innlogget bruker — «Behold konto» finnes ikke for
// andre. Det sies eksplisitt, så testene ikke avhenger av HVORDAN banneret
// finner ut hvem som ser på: spør det useAuth før det henter varselet, er
// svaret «bruker-1»; lar det serverens 401 avgjøre, er mocken uten virkning.
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'bruker-1' }, loading: false })
}));

const { RetentionWarningBanner } = await import('../RetentionWarningBanner');

const VARSEL = { warnedAt: '2026-11-01T00:00:00Z', scheduledDeletionAt: '2026-12-01T00:00:00Z' };

/** Svaret på POST /api/me/extend-retention i den aktuelle testen. */
let avbryt: () => Promise<unknown>;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  avbryt = async () => json({ ok: true, cleared: true, message: 'Sletting av kontoen din er avbrutt.' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { method?: string }) =>
      init?.method === 'POST' ? avbryt() : Promise.resolve(json({ warning: VARSEL }))
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function trykkBehold(sprak: 'nb' | 'sv' = 'nb') {
  const katalog = sprak === 'nb' ? nb : sv;
  render(
    <NextIntlClientProvider locale={sprak} messages={katalog as never} timeZone="Europe/Oslo">
      <RetentionWarningBanner />
    </NextIntlClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: katalog.RetentionWarningBanner.keepAccount }));
  await waitFor(() => expect(toast.success.mock.calls.length + toast.error.mock.calls.length).toBe(1));
}

describe('RetentionWarningBanner — «Behold konto»', () => {
  it('viser rutens bekreftelse, og banneret forsvinner', async () => {
    await trykkBehold();
    expect(toast.success).toHaveBeenCalledWith('Sletting av kontoen din er avbrutt.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('en svensk bruker ser rutens svenske bekreftelse', async () => {
    avbryt = async () => json({ ok: true, cleared: true, message: sv.RetentionWarningBanner.cancelSuccess });
    await trykkBehold('sv');
    expect(toast.success).toHaveBeenCalledWith('Raderingen av ditt konto är avbruten.');
  });

  it('feiler ruta, vises dens oversatte tekst — og banneret blir stående', async () => {
    avbryt = async () =>
      json({ error: 'Kunde inte avbryta raderingen. Försök igen.', code: 'retention_cancel_failed' }, 500);
    await trykkBehold('sv');
    expect(toast.error).toHaveBeenCalledWith('Kunde inte avbryta raderingen. Försök igen.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('et brudd i forbindelsen gir katalogens tekst, aldri nettleserens «Load failed»', async () => {
    avbryt = async () => {
      throw new TypeError('Load failed');
    };
    await trykkBehold('sv');
    expect(toast.error).toHaveBeenCalledWith(sv.RetentionWarningBanner.cancelError);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('plattformens HTML-feilside gir katalogens tekst, ikke «Unexpected token <»', async () => {
    avbryt = async () => ({
      ok: false,
      status: 504,
      json: async () => {
        throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
      }
    });
    await trykkBehold();
    expect(toast.error).toHaveBeenCalledWith(nb.RetentionWarningBanner.cancelError);
  });
});
