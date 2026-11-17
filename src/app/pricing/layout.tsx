import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { sideMetadata } from '@/lib/seo/side-metadata';

/**
 * Metadata for /pricing. Siden er en klientkomponent og kan ikke eksportere
 * metadata selv, så denne layouten gjør ingenting annet enn å gi den tittel,
 * beskrivelse og kanonisk adresse på leserens språk. Den rører ikke
 * rendringen: Suspense-grensen rundt useSearchParams ligger fortsatt i siden.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Pricing' });
  return sideMetadata({ sti: '/pricing', tittel: t('metaTitle'), beskrivelse: t('metaDescription'), locale });
}

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
