'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

/**
 * Feilgrense for sidene.
 *
 * Før denne fantes det ikke ÉN feilgrense i kodebasen — verken Next.js'
 * filbaserte eller en egenskrevet. En komponent som kastet (manglende
 * provider, null-referanse i et API-svar, en katalognøkkel som forsvant) tok
 * derfor ned hele ruta og erstattet den med Next.js' produksjonsfeilside:
 * engelsk, umerket, uten språkvalg og uten vei tilbake.
 *
 * error.tsx rendres INNI rot-layouten, så NextIntlClientProvider er fortsatt
 * montert og useTranslations virker. Kast i selve rot-layouten fanges av
 * global-error.tsx, som har sin egen hardkodede tekst.
 */
export default function RouteError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('ErrorPage');

  useEffect(() => {
    // Havner i Vercels loggstrøm sammen med resten. `digest` er nøkkelen som
    // knytter denne visningen til server-stacktracen.
    console.error('route_error', { message: error.message, digest: error.digest });
    // Samme grep ett nivå ned: feil i et rute-segment. All lokalisert copy
    // under beholdes — vi legger bare rapporteringen ved siden av loggingen.
    Sentry.captureException(error);
  }, [error]);

  return (
    <PageWrapper>
      <section className="space-y-4 py-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
        <p className="mx-auto max-w-sm text-sm text-gray-700">{t('body')}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-medium text-white hover:bg-forest-900"
          >
            {t('retry')}
          </button>
          <Link
            href="/"
            className="rounded-lg border border-forest-700 px-4 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50"
          >
            {t('goHome')}
          </Link>
        </div>
        {error.digest ? <p className="pt-2 text-xs text-gray-400">{t('reference', { digest: error.digest })}</p> : null}
      </section>
    </PageWrapper>
  );
}
