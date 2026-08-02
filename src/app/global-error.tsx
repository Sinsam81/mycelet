'use client';

import { useEffect, useState } from 'react';
import './globals.css';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/config';

/**
 * Siste skanse: kast i selve ROT-LAYOUTEN.
 *
 * global-error.tsx erstatter hele dokumentet, så den må rendre sin egen
 * <html>/<body> — og NextIntlClientProvider er per definisjon ikke montert her.
 * Teksten kan derfor ikke hentes med useTranslations, og ligger i stedet i en
 * liten COPY-tabell etter samme mønster som src/lib/prediction/mushroom-day.ts.
 *
 * Alternativet — som var tilstanden før denne fila — er Next.js' innebygde
 * «Application error: a client-side exception has occurred»: engelsk, umerket,
 * uten språkvalg og uten vei tilbake, også for svenske brukere.
 */
const COPY: Record<Locale, { title: string; body: string; retry: string; home: string }> = {
  nb: {
    title: 'Noe gikk galt',
    body: 'Appen klarte ikke å laste denne siden. Prøv på nytt — går det fortsatt ikke, prøv igjen om litt.',
    retry: 'Prøv igjen',
    home: 'Til forsiden'
  },
  sv: {
    title: 'Något gick fel',
    body: 'Appen kunde inte ladda den här sidan. Försök igen — fungerar det fortfarande inte, prova om en stund.',
    retry: 'Försök igen',
    home: 'Till startsidan'
  }
};

/** Språket ligger i MYCELET_LOCALE-cookien; ingen server-kontekst her. */
function readLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const fromCookie = match ? decodeURIComponent(match[1]) : undefined;
  if (isLocale(fromCookie)) return fromCookie;
  return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : DEFAULT_LOCALE;
}

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Settes etter montering for å unngå hydrerings-avvik: serveren kan ikke se
  // cookien herfra, så første render er alltid standardspråket.
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocale(readLocale()), []);

  useEffect(() => {
    console.error('global_error', { message: error.message, digest: error.digest });
  }, [error]);

  const copy = COPY[locale];

  return (
    <html lang={locale}>
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#1f2937'
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1A3409' }}>{copy.title}</h1>
          <p style={{ maxWidth: '24rem', fontSize: '0.875rem' }}>{copy.body}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                borderRadius: '0.5rem',
                background: '#1A3409',
                color: '#fff',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {copy.retry}
            </button>
            <a
              href="/"
              style={{
                borderRadius: '0.5rem',
                border: '1px solid #1A3409',
                color: '#1A3409',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none'
              }}
            >
              {copy.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
