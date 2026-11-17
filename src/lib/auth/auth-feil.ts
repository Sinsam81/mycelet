/**
 * Oversetter en Supabase Auth-feil til en nøkkel i `AuthErrors`-navnerommet
 * (messages/nb.json + sv.json).
 *
 * Bakgrunn: innlogging, glemt passord og nytt passord viste `err.message`
 * rått. AuthError ER en Error, så de oversatte reservetekstene slo aldri til
 * — feil passord ga «Invalid login credentials» på engelsk til norske og
 * svenske brukere, på skjermen alle tilbakevendende brukere møter.
 *
 * Regelen: den rå meldingen vises ALDRI. Ukjente feil gir `null`, og siden
 * bruker da sin egen generelle tekst.
 *
 * `code` leses først (GoTrue ≥ 2.1xx); en små-bokstavert delstreng av
 * meldingen er reserve for eldre svar uten kode. Alt leses defensivt fra
 * hvilket som helst objekt — PostgREST-feil er rene objekter, ikke Error.
 */

export const AUTH_FEIL_NOKLER = [
  'invalidCredentials',
  'emailNotConfirmed',
  'rateLimited',
  'samePassword',
  'weakPassword',
  'emailRegistered',
  'invalidEmail',
  'sessionExpired',
  'userBanned',
  'network'
] as const;

export type AuthFeilNokkel = (typeof AUTH_FEIL_NOKLER)[number];

function felt(err: unknown, navn: string): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  return (err as Record<string, unknown>)[navn];
}

function tekst(verdi: unknown): string {
  return typeof verdi === 'string' ? verdi : '';
}

export function authFeilNokkel(err: unknown): AuthFeilNokkel | null {
  const code = tekst(felt(err, 'code')).toLowerCase();
  const name = tekst(felt(err, 'name'));
  const status = felt(err, 'status');
  const message = (typeof err === 'string' ? err : tekst(felt(err, 'message'))).toLowerCase();

  // Nettverk først: en avbrutt forespørsel har ingen kode å lese.
  if (
    name === 'AuthRetryableFetchError' ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed')
  ) {
    return 'network';
  }

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'invalidCredentials';
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'emailNotConfirmed';
  if (code === 'user_banned' || message.includes('user is banned')) return 'userBanned';
  if (code === 'same_password' || message.includes('different from the old password')) return 'samePassword';
  if (
    code === 'weak_password' ||
    name === 'AuthWeakPasswordError' ||
    message.includes('password should be at least') ||
    message.includes('password should contain')
  ) {
    return 'weakPassword';
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return 'emailRegistered';
  }
  if (
    code === 'email_address_invalid' ||
    (message.includes('email address') && message.includes('invalid')) ||
    (code === 'validation_failed' && message.includes('email'))
  ) {
    return 'invalidEmail';
  }
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    name === 'AuthSessionMissingError' ||
    message.includes('auth session missing')
  ) {
    return 'sessionExpired';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    status === 429 ||
    message.includes('security purposes') ||
    message.includes('rate limit')
  ) {
    return 'rateLimited';
  }

  return null;
}

/**
 * Har auth-serveren faktisk AVVIST forespørselen — eller kom det bare ikke noe
 * brukbart svar?
 *
 * Brukes der en feil ellers ville blitt lest som «lenka er død»: /auth/reset
 * løser inn et engangstoken med verifyOtp, og en avvisning betyr at tokenet
 * er brukt eller utløpt. Men auth-js legger også nettverksbrudd (status 0),
 * 502/503/504 fra porten (AuthRetryableFetchError) og 429 i `error`. Da er
 * tokenet ikke dømt, og «be om ny lenke» ville sendt brukeren ut etter en
 * e-post hen ikke trenger.
 *
 * Regelen: bare et 4xx-svar (utenom 429) er serverens dom over forespørselen.
 * Alt annet — nettverk, grense, 5xx, feil uten status — er forbigående, og
 * samme forespørsel kan sendes igjen.
 */
export function erForbigaaendeAuthFeil(err: unknown): boolean {
  const k = authFeilNokkel(err);
  if (k === 'network' || k === 'rateLimited') return true;
  const status = felt(err, 'status');
  return !(typeof status === 'number' && status >= 400 && status < 500);
}

/**
 * Logg en feil vi ikke kjenner igjen, så nye koder blir oppdaget — uten å
 * vise den til brukeren. Bare kode/navn/status; meldingen kan inneholde
 * adressen.
 */
export function varsleUkjentAuthFeil(sted: string, err: unknown): void {
  console.warn('auth.ukjent_feil', {
    sted,
    code: tekst(felt(err, 'code')) || null,
    name: tekst(felt(err, 'name')) || null,
    status: typeof felt(err, 'status') === 'number' ? felt(err, 'status') : null
  });
}
