import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { CookieNotice } from '@/components/layout/CookieNotice';
import { Providers } from '@/components/layout/Providers';

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

export const metadata: Metadata = {
  title: {
    default: 'Mycelet — soppkart, soppvarsel og AI-soppidentifikasjon',
    template: '%s — Mycelet'
  },
  description:
    'Finn mer sopp: live soppvarsel, prediksjonskart med beste steder, AI-identifikasjon og artsbibliotek for Norge og Sverige.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Mycelet',
    statusBarStyle: 'default'
  },
  openGraph: {
    siteName: 'Mycelet',
    locale: 'nb_NO',
    type: 'website',
    title: 'Mycelet — soppkart, soppvarsel og AI-soppidentifikasjon',
    description:
      'Live soppvarsel, prediksjonskart, AI-identifikasjon og artsbibliotek for sopplukkere i Norge og Sverige.'
  }
};

export const viewport: Viewport = {
  themeColor: '#1A3409',
  // Lets the WebView extend under the status bar / notch so env(safe-area-inset-*)
  // returns real values; the shell pads for them (Header, BottomNav, PageWrapper).
  viewportFit: 'cover'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <CookieNotice />
      </body>
    </html>
  );
}
