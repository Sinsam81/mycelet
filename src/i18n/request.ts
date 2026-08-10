import { getRequestConfig } from 'next-intl/server';
import { isLocale, timeZoneForLocale } from './config';
import { getUserLocale } from './locale';

// next-intl request config (no-routing setup): resolves the active locale per
// request and loads its message catalog from /messages/<locale>.json.
//
// Et EKSPLISITT språk — getTranslations({locale: 'sv', …}) — vinner over
// cookie/Accept-Language. Det trengs når språket kommer fra data i stedet for
// fra forespørselen: avmeldingskvitteringen får abonnementets lagrede språk
// via ?sprak= fra API-ruta, og mottakeren er som regel ikke innlogget. Uten
// dette ignorerte konfigurasjonen ønsket og lastet cookiespråket uansett.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : await getUserLocale();
  return {
    locale,
    // Uten denne faller next-intl tilbake på kjøremiljøets sone — UTC på
    // Vercel, brukerens sone i nettleseren — og logger IntlError
    // ENVIRONMENT_FALLBACK ved hver rendring. Se timeZoneForLocale.
    timeZone: timeZoneForLocale(locale),
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
