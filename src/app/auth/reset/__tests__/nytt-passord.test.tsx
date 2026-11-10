// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import nb from '../../../../../messages/nb.json';
import ResetPasswordPage from '../page';

/**
 * /auth/reset løser inn engangstokenet fra e-postlenka først ved innsending.
 *
 * To feller, begge låst her:
 *
 *  · auth-js leverer også nettverksbrudd, 429 og 5xx i `error` fra verifyOtp.
 *    Leses ENHVER feil som «lenken er ugyldig, brukt eller utløpt», kastes et
 *    token som aldri ble brukt, og brukeren sendes ut etter en ny e-post.
 *  · Blir det BRUKTE tokenet liggende i sessionStorage til passordet er
 *    lagret, henter en omlasting det fram igjen når lagringen feilet — og
 *    ender på «ugyldig» med en gyldig gjenopprettingsøkt i kapslene.
 */

const TOKEN_LAGER = 'mycelet:reset-token';

const auth = {
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn()
};
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }));
vi.mock('@/lib/native/platform', () => ({ isNativePlatform: () => false }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>
}));

// App-konto: da ender et vellykket bytte på «åpne appen» uten tidsstyrt videresending.
const APP_BRUKER = { data: { user: { user_metadata: { plattform: 'ios' } } }, error: null };

function rendrer() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <ResetPasswordPage />
    </NextIntlClientProvider>
  );
}

function sendInn(passord = 'nytt-passord-1') {
  fireEvent.change(screen.getByLabelText(nb.AuthReset.newPasswordLabel), { target: { value: passord } });
  fireEvent.change(screen.getByLabelText(nb.AuthReset.confirmPasswordLabel), { target: { value: passord } });
  fireEvent.click(screen.getByRole('button', { name: nb.AuthReset.submit }));
}

const ugyldig = () => screen.queryByText(nb.AuthReset.invalidLink) !== null;
const skjemaVises = () => screen.queryByRole('button', { name: nb.AuthReset.submit }) !== null;
const lagretToken = () => window.sessionStorage.getItem(TOKEN_LAGER);

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/auth/reset?token_hash=engangstoken');
  for (const f of Object.values(auth)) f.mockReset();
  auth.verifyOtp.mockResolvedValue({ data: { user: {}, session: {} }, error: null });
  auth.updateUser.mockResolvedValue(APP_BRUKER);
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.signOut.mockResolvedValue({ error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => {
  cleanup();
  // Bare spionene (console.warn i én test); auth-mockene nullstilles i beforeEach.
  vi.restoreAllMocks();
});

describe('/auth/reset med token_hash', () => {
  it('tar tokenet ut av adressen, og løser det ikke inn før innsending', async () => {
    rendrer();
    await waitFor(() => expect(skjemaVises()).toBe(true));
    expect(window.location.search).toBe('');
    expect(lagretToken()).toBe('engangstoken');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('nettverksbrudd under innløsningen: skjemaet blir stående med tokenet i behold', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    rendrer();
    await waitFor(() => expect(skjemaVises()).toBe(true));
    sendInn();

    await waitFor(() => expect(screen.queryByText(nb.AuthErrors.network)).not.toBeNull());
    expect(ugyldig()).toBe(false);
    expect(skjemaVises()).toBe(true);
    expect(lagretToken()).toBe('engangstoken');
    expect(auth.updateUser).not.toHaveBeenCalled();

    // Samme lenke, ett trykk til: nå går det.
    sendInn();
    await waitFor(() => expect(screen.queryByText(nb.AuthReset.doneAppTitle)).not.toBeNull());
    expect(auth.verifyOtp).toHaveBeenCalledTimes(2);
    expect(auth.verifyOtp).toHaveBeenLastCalledWith({ token_hash: 'engangstoken', type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('502, 429 og 500 er heller ikke en dom over lenka', async () => {
    // Den ukjente 500-koden meldes (kode/navn/status), men vises aldri rått.
    const advarsel = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const forbigaaende: Array<[Error, string]> = [
      [new AuthRetryableFetchError('{}', 502), nb.AuthErrors.network],
      [new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'), nb.AuthErrors.rateLimited],
      [new AuthApiError('Database error finding user from email link', 500, 'unexpected_failure'), nb.AuthReset.errorTryAgain]
    ];
    for (const [feil, tekst] of forbigaaende) {
      auth.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: feil });
      const { unmount } = rendrer();
      await waitFor(() => expect(skjemaVises()).toBe(true));
      sendInn();
      await waitFor(() => expect(screen.queryByText(tekst)).not.toBeNull());
      expect(ugyldig()).toBe(false);
      expect(lagretToken()).toBe('engangstoken');
      unmount();
    }
    expect(advarsel).toHaveBeenCalledTimes(1);
    expect(advarsel).toHaveBeenCalledWith('auth.ukjent_feil', {
      sted: 'reset.verify',
      code: 'unexpected_failure',
      name: 'AuthApiError',
      status: 500
    });
  });

  it('403 otp_expired: lenka er død — tokenet glemmes og veien til ny lenke vises', async () => {
    auth.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired')
    });
    rendrer();
    await waitFor(() => expect(skjemaVises()).toBe(true));
    sendInn();

    await waitFor(() => expect(ugyldig()).toBe(true));
    expect(lagretToken()).toBeNull();
    expect(screen.queryByText(nb.AuthReset.requestNewLink)).not.toBeNull();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('glemmer det brukte tokenet straks det er løst inn — også når passordbyttet feiler etterpå', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('New password should be different from the old password.', 422, 'same_password')
    });
    rendrer();
    await waitFor(() => expect(skjemaVises()).toBe(true));
    sendInn();

    await waitFor(() => expect(screen.queryByText(nb.AuthErrors.samePassword)).not.toBeNull());
    expect(lagretToken()).toBeNull();
    expect(skjemaVises()).toBe(true);

    // Nytt forsøk i samme fane: tokenet løses ikke inn én gang til.
    sendInn('et-annet-passord-2');
    await waitFor(() => expect(screen.queryByText(nb.AuthReset.doneAppTitle)).not.toBeNull());
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it('omlasting etter innløsning finner gjenopprettingsøkten i stedet for det brukte tokenet', async () => {
    // Tilstanden etter «innløst, men passordet ble ikke lagret»: adressen er
    // ren, tokenet er glemt, og økten ligger i kapslene.
    window.history.replaceState(null, '', '/auth/reset');
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } });
    rendrer();
    await waitFor(() => expect(skjemaVises()).toBe(true));
    sendInn();

    await waitFor(() => expect(screen.queryByText(nb.AuthReset.doneAppTitle)).not.toBeNull());
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nytt-passord-1' });
    expect(ugyldig()).toBe(false);
  });
});
