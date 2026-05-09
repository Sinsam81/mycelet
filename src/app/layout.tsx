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
  themeColor: '#1A3409'
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
