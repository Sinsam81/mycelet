import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { privatSide } from '@/lib/seo/side-titler';

/** Egen tittel og noindex for AI-resultatet — det viser brukerens egne bilder. Siden er en klientkomponent, så tittelen må komme fra en layout. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'IdentifyResult' });
  return privatSide(t('metaTitle'));
}

export default function IdentifyResultLayout({ children }: { children: ReactNode }) {
  return children;
}
