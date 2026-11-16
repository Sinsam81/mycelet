import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { privatSide } from '@/lib/seo/side-titler';

/** Egen tittel og noindex for «Glemt passord» — et skjema uten verdi i et søkeresultat. Siden er en klientkomponent, så tittelen må komme fra en layout. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'AuthForgot' });
  return privatSide(t('title'));
}

export default function ForgotLayout({ children }: { children: ReactNode }) {
  return children;
}
