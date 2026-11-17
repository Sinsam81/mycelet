import type { Metadata, ResolvingMetadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { SAMME_ADRESSE, sideMetadata } from '@/lib/seo/side-metadata';
import { medMal } from '@/lib/seo/side-titler';

/**
 * Metadata for /identify (klientside — derfor en layout).
 *
 * Layouten ligger også rundt /identify/result, som setter egen tittel og
 * noindex. Derfor tittel med mal (medMal) og SAMME_ADRESSE som canonical: en
 * fast '/identify' ville blitt arvet av resultatsiden.
 */
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Identify' });
  const side = sideMetadata({ sti: SAMME_ADRESSE, tittel: t('metaTitle'), beskrivelse: t('metaDescription'), locale });
  return medMal(side, t('metaTitle'), parent);
}

export default function IdentifyLayout({ children }: { children: ReactNode }) {
  return children;
}
