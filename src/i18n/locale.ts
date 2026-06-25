import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config';

// Server-only locale resolution (uses next/headers). The active language comes
// from a cookie (set by the language toggle), falling back to the browser's
// Accept-Language (so a Swedish visitor gets Swedish automatically) and finally
// Norwegian. No /sv or /nb URL prefixes — existing links, SEO, Supabase redirects
// and the Capacitor shell stay exactly as they are.
//
// Client components must import locale constants/types from './config' instead,
// which has no server-only imports.

export async function getUserLocale(): Promise<Locale> {
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  // Auto-detect Swedish browsers on first visit (before they pick a language).
  const acceptLanguage = (await headers()).get('accept-language') ?? '';
  if (/(^|[,\s])sv\b/i.test(acceptLanguage)) return 'sv';

  return DEFAULT_LOCALE;
}
