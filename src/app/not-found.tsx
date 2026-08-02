import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Compass } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

/**
 * Appens egen 404.
 *
 * Uten denne fila serverte Next.js sin innebygde standardside — «This page
 * could not be found», på engelsk, uten header, uten bunnmeny og uten vei
 * tilbake i appen — også inni et <html lang="sv">-dokument. Det traff ekte
 * ruter brukere faktisk møter: /species/999999, en slettet forumtråd, en gammel
 * delt lenke, en skrivefeil. En App Store-reviewer som klikker en utdatert
 * lenke ser det samme.
 */
export default async function NotFound() {
  const t = await getTranslations('NotFound');

  return (
    <PageWrapper>
      <section className="space-y-4 py-8 text-center">
        <Compass className="mx-auto h-10 w-10 text-forest-700" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-bold tracking-tight text-forest-900">{t('title')}</h1>
        <p className="mx-auto max-w-sm text-sm text-gray-700">{t('body')}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link
            href="/"
            className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-medium text-white hover:bg-forest-900"
          >
            {t('goHome')}
          </Link>
          <Link
            href="/species"
            className="rounded-lg border border-forest-700 px-4 py-2 text-sm font-medium text-forest-800 hover:bg-forest-50"
          >
            {t('goSpecies')}
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
