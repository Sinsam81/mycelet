import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import './globals.css';
import { CookieNotice } from '@/components/layout/CookieNotice';
import { Analytics } from '@/components/analytics/Analytics';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { Providers } from '@/components/layout/Providers';
import { getUserLocale } from '@/i18n/locale';
import { timeZoneForLocale } from '@/i18n/config';

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
    verification: {
      other: {
        'facebook-domain-verification': '4bs9zy1gnb9oxvutw5f5lymq4npoic'
      }
    },
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
        {/* timeZone må sendes eksplisitt: klientprovideren arver den ikke fra
            getRequestConfig, og uten den formaterer serveren i UTC mens
            nettleseren formaterer i brukerens sone. */}
        <NextIntlClientProvider
          locale={locale}
          timeZone={timeZoneForLocale(locale)}
          messages={messages}
        >
          {/* Analytics + consent are WEB-ONLY on purpose: the App Store
              build's App Privacy label declares no usage analytics, and the
              native shell must match it. */}
          <NonNativeOnly>
            <Analytics />
          </NonNativeOnly>
          <Providers>{children}</Providers>
          <NonNativeOnly>
            <CookieNotice />
          </NonNativeOnly>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
