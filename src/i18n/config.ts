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

/**
 * Tidssonen next-intl skal formatere datoer i.
 *
 * Uten en konfigurert timeZone bruker next-intl kjøremiljøets sone: Vercel
 * kjører i UTC, nettleseren i brukerens sone. Samme dato kunne da rendres som
 * to forskjellige dager på server og klient — en av-med-én-dag-feil som ser
 * tilfeldig ut, pluss en hydreringsadvarsel fra React. Biblioteket logger
 * «IntlError: ENVIRONMENT_FALLBACK» ved hver rendring så lenge sonen mangler.
 *
 * Norge og Sverige har samme forskyvning hele året, så valget påvirker ikke
 * hva som vises i dag — men det låser formateringen til soppsesongen brukeren
 * faktisk står i, ikke til serverens sone.
 */
export const LOCALE_TIME_ZONES: Record<Locale, string> = {
  nb: 'Europe/Oslo',
  sv: 'Europe/Stockholm'
};

export function timeZoneForLocale(locale: string): string {
  return isLocale(locale) ? LOCALE_TIME_ZONES[locale] : LOCALE_TIME_ZONES[DEFAULT_LOCALE];
}
