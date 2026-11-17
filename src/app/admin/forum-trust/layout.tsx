import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { privatSide } from '@/lib/seo/side-titler';

/** Egen tittel for forum-trust-verktøyet; noindex arves fra admin-layouten. Siden er en klientkomponent, så tittelen må komme fra en layout. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'AdminForumTrust' });
  return privatSide(t('title'));
}

export default function ForumTrustLayout({ children }: { children: ReactNode }) {
  return children;
}
