import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

/**
 * Landingssiden etter e-postbekreftelse for kontoer som ble opprettet I APPEN.
 *
 * Bekreftelseslenka åpner alltid i Safari, aldri i appen (ingen universal
 * links ennå). Før landet app-brukeren på nettsidens innlogging og ble bedt
 * om å logge inn — på nettet. Ni av de 25 som aldri logget inn (10. sep 2026)
 * var registrert i appen. Denne siden sier det ene som må sies: åpne appen.
 */
export default async function BekreftetAppSide() {
  const t = await getTranslations('AuthBekreftetApp');
  return (
    <PageWrapper>
      <section className="mx-auto max-w-md space-y-5 py-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-forest-700" aria-hidden="true" />
        <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
        <p className="text-base leading-relaxed text-gray-700">{t('body')}</p>
        <div className="rounded-2xl border border-forest-200 bg-forest-50 p-4 text-left">
          <p className="flex items-start gap-2 text-sm text-forest-900">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('steps')}</span>
          </p>
        </div>
        <p className="text-sm text-gray-600">
          {t('webInstead')}{' '}
          <Link href="/auth/login?verified=1" className="font-semibold text-forest-800 underline">
            {t('webLink')}
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}
