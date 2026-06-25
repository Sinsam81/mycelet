'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from './config';

// Server action used by the language toggle to persist the chosen language for
// a year. The page is refreshed client-side after this resolves.
export async function setUserLocale(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax'
  });
}
