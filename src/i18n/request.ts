import { getRequestConfig } from 'next-intl/server';
import { timeZoneForLocale } from './config';
import { getUserLocale } from './locale';

// next-intl request config (no-routing setup): resolves the active locale per
// request and loads its message catalog from /messages/<locale>.json.
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    // Uten denne faller next-intl tilbake på kjøremiljøets sone — UTC på
    // Vercel, brukerens sone i nettleseren — og logger IntlError
    // ENVIRONMENT_FALLBACK ved hver rendring. Se timeZoneForLocale.
    timeZone: timeZoneForLocale(locale),
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
