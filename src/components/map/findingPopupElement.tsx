import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { FindingPopup } from './FindingPopup';
import { MapFinding } from '@/types/finding';

interface FindingPopupElementArgs {
  finding: MapFinding;
  /** Artsnavnet på leserens språk, slått opp av kartet. */
  displayName?: string;
  locale: string;
  messages: Record<string, unknown>;
}

/**
 * BYGGER POPUP-TREET MED PROVIDEREN INNEBAKT — og det er hele poenget.
 *
 * Kartet rendrer denne popupen i en LØSREVET React-rot: Leaflet eier elementet,
 * så `createRoot()` lager et helt nytt tre ved siden av appens. React-kontekst
 * krysser ikke rot-grenser, så uten `NextIntlClientProvider` kaster FindingPopup
 * på sin første linje (`useTranslations`) og React lar roten stå tom. Fra 26.
 * juni til 1. august ga hvert klikk på en soppmarkør en tom hvit boks for ALLE
 * brukere.
 *
 * Wrappingen lå inline i MushroomMap.tsx, som ingen test laster (Leaflet + DOM),
 * så nøyaktig den slettingen kunne gjøres om igjen uten at noe ble rødt. Ved å
 * la byggingen bo her får den en test ved siden av seg
 * (__tests__/findingPopupElement.test.tsx): fjernes provideren, blir testen rød.
 */
export function findingPopupElement({
  finding,
  displayName,
  locale,
  messages
}: FindingPopupElementArgs): ReactElement {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FindingPopup finding={finding} displayName={displayName} />
    </NextIntlClientProvider>
  );
}
