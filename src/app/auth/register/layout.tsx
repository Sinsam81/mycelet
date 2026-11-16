import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { sideMetadata } from '@/lib/seo/side-metadata';

/** Tittel, beskrivelse og kanonisk adresse for registreringen (klientside — derfor en layout). */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'AuthRegister' });
  return sideMetadata({ sti: '/auth/register', tittel: t('title'), beskrivelse: t('metaDescription'), locale });
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
