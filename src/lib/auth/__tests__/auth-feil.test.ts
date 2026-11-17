import { describe, expect, it } from 'vitest';
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from '@supabase/supabase-js';
import { AUTH_FEIL_NOKLER, authFeilNokkel, erForbigaaendeAuthFeil } from '../auth-feil';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

class FalskAuthFeil extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number, name = 'AuthApiError') {
    super(message);
    this.name = name;
    this.code = code;
    this.status = status;
  }
}

describe('authFeilNokkel', () => {
  it('leser koden først', () => {
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'invalid_credentials', 400))).toBe('invalidCredentials');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'email_not_confirmed', 400))).toBe('emailNotConfirmed');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'over_email_send_rate_limit', 429))).toBe('rateLimited');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'over_request_rate_limit', 429))).toBe('rateLimited');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'same_password', 422))).toBe('samePassword');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'weak_password', 422))).toBe('weakPassword');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'user_already_exists', 422))).toBe('emailRegistered');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'email_exists', 422))).toBe('emailRegistered');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'email_address_invalid', 400))).toBe('invalidEmail');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'session_not_found', 403))).toBe('sessionExpired');
    expect(authFeilNokkel(new FalskAuthFeil('whatever', 'user_banned', 400))).toBe('userBanned');
  });

  it('faller tilbake på meldingen når koden mangler (eldre GoTrue)', () => {
    expect(authFeilNokkel(new Error('Invalid login credentials'))).toBe('invalidCredentials');
    expect(authFeilNokkel(new Error('Email not confirmed'))).toBe('emailNotConfirmed');
    expect(authFeilNokkel(new Error('For security purposes, you can only request this after 52 seconds.'))).toBe(
      'rateLimited'
    );
    expect(authFeilNokkel(new Error('New password should be different from the old password.'))).toBe('samePassword');
    expect(authFeilNokkel(new Error('Password should be at least 8 characters.'))).toBe('weakPassword');
    expect(authFeilNokkel(new Error('User already registered'))).toBe('emailRegistered');
    expect(authFeilNokkel(new Error('Auth session missing!'))).toBe('sessionExpired');
  });

  it('kjenner igjen nettverksfeil i Chrome, Safari og Supabase-klienten', () => {
    expect(authFeilNokkel(new TypeError('Failed to fetch'))).toBe('network');
    expect(authFeilNokkel(new TypeError('Load failed'))).toBe('network');
    expect(authFeilNokkel(new FalskAuthFeil('x', undefined, 0, 'AuthRetryableFetchError'))).toBe('network');
  });

  it('leser rene objekter, ikke bare Error (PostgREST)', () => {
    expect(authFeilNokkel({ message: 'Invalid login credentials' })).toBe('invalidCredentials');
    expect(authFeilNokkel({ code: 'same_password' })).toBe('samePassword');
    expect(authFeilNokkel({ status: 429 })).toBe('rateLimited');
  });

  it('ukjent feil gir null — aldri den rå meldingen', () => {
    expect(authFeilNokkel(new Error('Something exotic happened'))).toBeNull();
    expect(authFeilNokkel({ code: 'unexpected_failure', message: 'Database error saving new user' })).toBeNull();
    expect(authFeilNokkel(null)).toBeNull();
    expect(authFeilNokkel(undefined)).toBeNull();
    expect(authFeilNokkel(42)).toBeNull();
  });

  it('hver nøkkel har tekst på både norsk og svensk', () => {
    const nbFeil = (nb as Record<string, Record<string, string>>).AuthErrors;
    const svFeil = (sv as Record<string, Record<string, string>>).AuthErrors;
    for (const nokkel of AUTH_FEIL_NOKLER) {
      expect(nbFeil[nokkel], `nb mangler ${nokkel}`).toBeTruthy();
      expect(svFeil[nokkel], `sv mangler ${nokkel}`).toBeTruthy();
      expect(svFeil[nokkel]).not.toBe(nbFeil[nokkel]);
    }
  });

  it('feil passord-teksten røper ikke om kontoen finnes', () => {
    const nbFeil = (nb as Record<string, Record<string, string>>).AuthErrors;
    expect(nbFeil.invalidCredentials).toMatch(/Feil e-post eller passord/);
  });
});

// Med klientens egne feilklasser, så testen følger formen auth-js faktisk gir.
describe('erForbigaaendeAuthFeil', () => {
  it('nettverk, port, grense og serverfeil er forbigående — engangstokenet er ikke dømt', () => {
    // Ingen forbindelse: auth-js gir status 0.
    expect(erForbigaaendeAuthFeil(new AuthRetryableFetchError('Failed to fetch', 0))).toBe(true);
    for (const status of [502, 503, 504]) {
      expect(erForbigaaendeAuthFeil(new AuthRetryableFetchError('{}', status))).toBe(true);
    }
    expect(erForbigaaendeAuthFeil(new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'))).toBe(true);
    expect(erForbigaaendeAuthFeil(new AuthApiError('Database error finding user from email link', 500, 'unexpected_failure'))).toBe(
      true
    );
    // Svar som ikke lot seg lese (HTML fra en mellomvert) har ingen status.
    expect(erForbigaaendeAuthFeil(new AuthUnknownError('Unexpected token <', new SyntaxError('x')))).toBe(true);
    expect(erForbigaaendeAuthFeil(new TypeError('Load failed'))).toBe(true);
  });

  it('bare et 4xx-svar er serverens dom over lenka', () => {
    expect(erForbigaaendeAuthFeil(new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'))).toBe(false);
    expect(erForbigaaendeAuthFeil(new AuthApiError('User is banned', 403, 'user_banned'))).toBe(false);
    expect(erForbigaaendeAuthFeil(new AuthApiError('Verify requires a verification type', 400, 'validation_failed'))).toBe(false);
    expect(erForbigaaendeAuthFeil({ status: 403, code: 'otp_expired' })).toBe(false);
  });
});
