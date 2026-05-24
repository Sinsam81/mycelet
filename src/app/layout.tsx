import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CookieNotice } from '@/components/layout/CookieNotice';
import { Providers } from '@/components/layout/Providers';

export const metadata: Metadata = {
  title: 'Mycelet',
  description: 'Norsk soppapp for trygg identifikasjon og kartlegging av funn.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Mycelet',
    statusBarStyle: 'default'
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
    <html lang="nb">
      <body>
        <Providers>{children}</Providers>
        <CookieNotice />
      </body>
    </html>
  );
}
