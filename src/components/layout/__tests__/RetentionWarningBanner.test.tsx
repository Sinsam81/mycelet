// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RetentionWarningBanner } from '../RetentionWarningBanner';
import nb from '../../../../messages/nb.json';

/**
 * Banneret står i Providers, altså på hver eneste side. Det spurte
 * /api/me/deletion-warning ved montering uansett hvem som så på — så hver
 * sidelasting fra en UTLOGGET besøkende kostet ett serverkall som bare kunne
 * svare 401, og en rød linje i konsollen. Nå spør det bare når noen er logget
 * inn. For den innloggede skal alt være som før.
 */

const tilstand = {
  auth: { user: null as { id: string } | null, loading: false }
};

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: () => tilstand.auth }));
vi.mock('react-hot-toast', () => ({ default: toast }));

const VARSEL = { warnedAt: '2026-11-01T08:00:00.000Z', scheduledDeletionAt: '2099-12-24T08:00:00.000Z' };

/** Svaret ruta gir, per adresse. Alt annet er en feil i testen. */
function svar(kropp: unknown, status = 200): Response {
  return new Response(JSON.stringify(kropp), { status, headers: { 'Content-Type': 'application/json' } });
}

let hent: ReturnType<typeof vi.fn>;

function tegn() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <RetentionWarningBanner />
    </NextIntlClientProvider>
  );
}

/** Tegner på nytt med samme tre — som når useAuth får ny tilstand. */
function tegnIgjen(visning: ReturnType<typeof tegn>) {
  visning.rerender(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <RetentionWarningBanner />
    </NextIntlClientProvider>
  );
}

const varselkall = () => hent.mock.calls.filter(([adresse]) => adresse === '/api/me/deletion-warning');

beforeEach(() => {
  tilstand.auth = { user: null, loading: false };
  toast.success.mockReset();
  toast.error.mockReset();
  hent = vi.fn(async (adresse: string) => {
    if (adresse === '/api/me/deletion-warning') return svar({ warning: VARSEL });
    if (adresse === '/api/me/extend-retention') return svar({ message: 'Sletting avbrutt.' });
    throw new Error(`Uventet kall: ${adresse}`);
  });
  vi.stubGlobal('fetch', hent);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RetentionWarningBanner — utlogget', () => {
  it('spør ikke serveren i det hele tatt, og viser ingenting', async () => {
    tegn();
    // Gi en eventuell effekt tid til å kjøre før vi konkluderer.
    await act(async () => {});
    expect(hent).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('spør heller ikke mens innloggingen er ukjent', async () => {
    tilstand.auth = { user: null, loading: true };
    tegn();
    await act(async () => {});
    expect(hent).not.toHaveBeenCalled();
  });
});

describe('RetentionWarningBanner — innlogget, som før', () => {
  it('spør én gang, uten mellomlager, og viser varselet', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegn();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Behold konto' })).toBeTruthy();
    expect(varselkall()).toEqual([['/api/me/deletion-warning', { cache: 'no-store' }]]);
  });

  it('viser ingenting når det ikke finnes noe varsel', async () => {
    hent.mockImplementation(async () => svar({ warning: null }));
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegn();
    await waitFor(() => expect(varselkall()).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([401, 500])('svarer serveren %i, er det stille — ingen feil, ingenting vist', async (status) => {
    hent.mockImplementation(async () => svar({ error: 'nei' }, status));
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegn();
    await waitFor(() => expect(varselkall()).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('en fornyet økt (nytt brukerobjekt, samme id) spør ikke på nytt', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    const visning = tegn();
    await screen.findByRole('alert');
    // Supabase gir et nytt objekt ved hver token-fornyelse.
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegnIgjen(visning);
    await act(async () => {});
    expect(varselkall()).toHaveLength(1);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('«Behold konto» avbryter slettingen og tar banneret bort', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegn();
    fireEvent.click(await screen.findByRole('button', { name: 'Behold konto' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(hent).toHaveBeenCalledWith('/api/me/extend-retention', { method: 'POST' });
    expect(toast.success).toHaveBeenCalledWith('Sletting avbrutt.');
  });

  it('krysset skjuler banneret uten å kalle serveren', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegn();
    fireEvent.click(await screen.findByRole('button', { name: 'Skjul varsel midlertidig' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(hent).toHaveBeenCalledTimes(1);
  });
});

describe('RetentionWarningBanner — innlogging og utlogging uten ny sidelasting', () => {
  it('logger noen inn etter at siden er lastet, spør banneret da', async () => {
    const visning = tegn();
    await act(async () => {});
    expect(hent).not.toHaveBeenCalled();

    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    tegnIgjen(visning);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(varselkall()).toHaveLength(1);
  });

  it('logger brukeren ut, forsvinner varselet hennes — og ingen spør for den utloggede', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    const visning = tegn();
    await screen.findByRole('alert');

    tilstand.auth = { user: null, loading: false };
    tegnIgjen(visning);
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(varselkall()).toHaveLength(1);
  });

  it('neste bruker på samme enhet arver ikke den forriges varsel — heller ikke mens svaret hennes er underveis', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    const visning = tegn();
    await screen.findByRole('alert');

    // Bruker 2 sitt svar kommer aldri: imens skal bruker 1 sitt varsel IKKE stå.
    hent.mockImplementation(() => new Promise<Response>(() => {}));
    tilstand.auth = { user: { id: 'bruker-2' }, loading: false };
    tegnIgjen(visning);
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(varselkall()).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('krysset gjelder den som trykket: neste bruker ser sitt eget varsel', async () => {
    tilstand.auth = { user: { id: 'bruker-1' }, loading: false };
    const visning = tegn();
    fireEvent.click(await screen.findByRole('button', { name: 'Skjul varsel midlertidig' }));
    expect(screen.queryByRole('alert')).toBeNull();

    tilstand.auth = { user: { id: 'bruker-2' }, loading: false };
    tegnIgjen(visning);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(varselkall()).toHaveLength(2);
  });
});
