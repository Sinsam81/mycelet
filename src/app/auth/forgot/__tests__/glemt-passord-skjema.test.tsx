// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import nb from '../../../../../messages/nb.json';
import ForgotPasswordPage from '../page';

/**
 * Skjemaet og reserven mot Supabases egen e-post.
 *
 * Ruten /api/auth/glemt-passord lager lenka med generateLink, som stempler
 * `recovery_sent_at` på brukeren. Supabases /recover (resetPasswordForEmail)
 * svarer 429 de neste 60 sekundene. Kaller skjemaet Supabase rett etter at
 * ruten har meldt at e-posten ikke kom ut, får det 429 hver gang — også når
 * brukeren venter et minutt og prøver igjen, fordi ruten stempler på nytt.
 * Så lenge Resend feilet, ville ingen fått nytt passord.
 */

const resetPasswordForEmail = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a) } })
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>
}));

const fetchMock = vi.fn();
const ruteSvar = (kropp: Record<string, unknown>) => ({ ok: true, json: async () => kropp });

const GRENSE = new AuthApiError('For security purposes, you can only request this after 52 seconds.', 429, 'over_email_send_rate_limit');

function rendrer() {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <ForgotPasswordPage />
    </NextIntlClientProvider>
  );
}

function sendInn(epost = 'kari@example.com') {
  fireEvent.change(screen.getByLabelText(nb.AuthForgot.emailLabel), { target: { value: epost } });
  fireEvent.click(screen.getByRole('button', { name: nb.AuthForgot.sendLink }));
}

const sendtVises = () => screen.queryByText(/har vi sendt en e-post/) !== null;
const ruteKall = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/auth/glemt-passord').length;

beforeEach(() => {
  fetchMock.mockReset();
  resetPasswordForEmail.mockReset();
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/auth/forgot', () => {
  it('ruten sendte e-posten: ferdig, uten å røre Supabases egen e-post', async () => {
    fetchMock.mockResolvedValue(ruteSvar({ ok: true }));
    rendrer();
    sendInn();
    await waitFor(() => expect(sendtVises()).toBe(true));
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'kari@example.com' });
  });

  it('fallback (ruten laget ingen lenke): Supabases e-post med en gang', async () => {
    fetchMock.mockResolvedValue(ruteSvar({ ok: true, fallback: true }));
    rendrer();
    sendInn();
    await waitFor(() => expect(sendtVises()).toBe(true));
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail.mock.calls[0][0]).toBe('kari@example.com');
  });

  it('sendFailed: sier fra, kaller IKKE Supabase nå, og går rett til Supabase neste gang', async () => {
    fetchMock.mockResolvedValue(ruteSvar({ ok: true, sendFailed: true }));
    rendrer();
    sendInn();

    await waitFor(() => expect(screen.queryByText(nb.AuthForgot.sendFailedRetry)).not.toBeNull());
    // Supabase ville svart 429 nå — skjemaet prøver ikke engang.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(sendtVises()).toBe(false);
    expect(ruteKall()).toBe(1);

    // Et minutt senere: ruten hoppes over (den ville stemplet på nytt).
    sendInn();
    await waitFor(() => expect(sendtVises()).toBe(true));
    expect(ruteKall()).toBe(1);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it('for tidlig nytt forsøk etter sendFailed gir «vent et minutt» — og fortsatt ingen ny stempling', async () => {
    fetchMock.mockResolvedValue(ruteSvar({ ok: true, sendFailed: true }));
    resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: GRENSE });
    rendrer();
    sendInn();
    await waitFor(() => expect(screen.queryByText(nb.AuthForgot.sendFailedRetry)).not.toBeNull());

    sendInn();
    await waitFor(() => expect(screen.queryByText(nb.AuthErrors.rateLimited)).not.toBeNull());
    expect(sendtVises()).toBe(false);

    sendInn();
    await waitFor(() => expect(sendtVises()).toBe(true));
    expect(ruteKall()).toBe(1);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });

  it('ruten svarte aldri, og Supabase sier 429: adressen er alt stemplet — hopp over ruten neste gang', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 504, json: async () => ({}) });
    resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: GRENSE });
    rendrer();
    sendInn();
    await waitFor(() => expect(screen.queryByText(nb.AuthErrors.rateLimited)).not.toBeNull());
    expect(ruteKall()).toBe(1);

    sendInn();
    await waitFor(() => expect(sendtVises()).toBe(true));
    expect(ruteKall()).toBe(1);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });

  it('uten nett husker skjemaet ingenting: neste forsøk går via ruten igjen', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    rendrer();
    sendInn();
    await waitFor(() => expect(screen.queryByText(nb.AuthErrors.network)).not.toBeNull());

    fetchMock.mockResolvedValue(ruteSvar({ ok: true }));
    sendInn();
    await waitFor(() => expect(sendtVises()).toBe(true));
    expect(ruteKall()).toBe(2);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });
});
