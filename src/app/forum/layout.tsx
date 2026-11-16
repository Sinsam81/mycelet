import type { Metadata, ResolvingMetadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { SAMME_ADRESSE, sideMetadata } from '@/lib/seo/side-metadata';
import { medMal } from '@/lib/seo/side-titler';

/**
 * Metadata for /forum (klientside — derfor en layout).
 *
 * Layouten ligger også rundt trådene, «Nytt innlegg», rapportene og
 * moderasjonen, som setter egne titler. Derfor tittel med mal (medMal) og
 * SAMME_ADRESSE som canonical: en fast '/forum' ville blitt arvet av en tråd
 * som ikke kan lese innlegget sitt.
 */
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'Forum' });
  const side = sideMetadata({ sti: SAMME_ADRESSE, tittel: t('metaTitle'), beskrivelse: t('metaDescription'), locale });
  return medMal(side, t('metaTitle'), parent);
}

export default function ForumLayout({ children }: { children: ReactNode }) {
  return children;
}
