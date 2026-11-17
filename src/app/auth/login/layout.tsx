import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { sideMetadata } from '@/lib/seo/side-metadata';

/** Tittel, beskrivelse og kanonisk adresse for innloggingen (klientside — derfor en layout). */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'AuthLogin' });
  return sideMetadata({ sti: '/auth/login', tittel: t('metaTitle'), beskrivelse: t('metaDescription'), locale });
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
