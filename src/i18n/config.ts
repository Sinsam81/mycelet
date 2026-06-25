// Client-safe locale constants + types. No server-only imports (next/headers)
// here, so client components (e.g. the language toggle) can import these without
// dragging server APIs into the client bundle.

export const LOCALES = ['nb', 'sv'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'nb';
export const LOCALE_COOKIE = 'MYCELET_LOCALE';

export const LOCALE_LABELS: Record<Locale, string> = {
  nb: 'Norsk',
  sv: 'Svenska'
};

export function isLocale(value: string | undefined): value is Locale {
  return value === 'nb' || value === 'sv';
}
