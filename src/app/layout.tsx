import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { CookieNotice } from '@/components/layout/CookieNotice';
import { Providers } from '@/components/layout/Providers';
import { getUserLocale } from '@/i18n/locale';

// Self-hosted via next/font (no external requests, zero CLS). --font-display
// drives Tailwind's `font-serif` (headings/brand), --font-sans the body.
const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap'
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap'
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUserLocale();
  const t = await getTranslations('Metadata');
  return {
    title: {
      default: t('titleDefault'),
      template: '%s — Mycelet'
    },
    description: t('description'),
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      title: 'Mycelet',
      statusBarStyle: 'default'
    },
    openGraph: {
      siteName: 'Mycelet',
      locale: locale === 'sv' ? 'sv_SE' : 'nb_NO',
      type: 'website',
      title: t('ogTitle'),
      description: t('ogDescription')
    }
  };
}

export const viewport: Viewport = {
  themeColor: '#1A3409',
  // Lets the WebView extend under the status bar / notch so env(safe-area-inset-*)
  // returns real values; the shell pads for them (Header, BottomNav, PageWrapper).
  viewportFit: 'cover'
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getUserLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          <CookieNotice />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
