import type { Metadata } from 'next';
import Link from 'next/link';
import { Sprout } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ORGANISASJON } from '@/lib/seo/organisasjon';

/**
 * «Om Mycelet» — siden som svarer på «hvem står bak dette?».
 *
 * Svarmotorer (Google AI-oversikter, ChatGPT, Perplexity) vekter hvem som
 * står bak en kilde, og fram til september 2026 fantes det ingen side å
 * peke dem til: forsiden selger, åpenhetssiden viser tall, vilkårssidene er
 * juss. Denne sier med vanlige ord hva Mycelet gjør, hva det ikke gjør, og
 * hvordan man når oss — og bærer Organization-schemaet med sameAs.
 *
 * Samme regel som på åpenhetssiden: siden snakker som «vi»/Mycelet og
 * rendrer aldri juridisk enhet eller byline. Organisasjonsnummer hører
 * hjemme i kjøpsvilkårene, og siden lenker dit.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Om');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: 'https://www.mycelet.com/om' }
  };
}

export default async function OmPage() {
  const t = await getTranslations('Om');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: t('heading'),
    description: t('metaDescription'),
    url: 'https://www.mycelet.com/om',
    mainEntity: ORGANISASJON
  };

  const avsnitt = 'mt-2 text-sm leading-relaxed text-gray-700';
  const kort = 'rounded-xl border border-gray-200 bg-white p-4';

  return (
    <PageWrapper>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="space-y-4 pb-8">
        <header className="pt-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-forest-900">
            <Sprout className="h-6 w-6" aria-hidden />
            {t('heading')}
          </h1>
          <p className={avsnitt}>{t('intro')}</p>
        </header>

        <article className={kort}>
          <h2 className="text-lg font-semibold text-forest-900">{t('whatHeading')}</h2>
          <p className={avsnitt}>{t('whatP1')}</p>
          <p className={avsnitt}>{t('whatP2')}</p>
        </article>

        <article className={kort}>
          <h2 className="text-lg font-semibold text-forest-900">{t('notHeading')}</h2>
          <p className={avsnitt}>{t('notP1')}</p>
          <p className={avsnitt}>{t('notP2')}</p>
        </article>

        <article className={kort}>
          <h2 className="text-lg font-semibold text-forest-900">{t('howHeading')}</h2>
          <p className={avsnitt}>{t('howP1')}</p>
        </article>

        <article className={kort}>
          <h2 className="text-lg font-semibold text-forest-900">{t('whoHeading')}</h2>
          <p className={avsnitt}>{t('whoP1')}</p>
        </article>

        <article className={kort}>
          <h2 className="text-lg font-semibold text-forest-900">{t('contactHeading')}</h2>
          <p className={avsnitt}>
            <a href="mailto:post@mycelet.com" className="font-medium text-forest-700 underline">
              post@mycelet.com
            </a>
            {' · '}
            <a href="https://x.com/mycelet" rel="me noopener" className="font-medium text-forest-700 underline">
              @mycelet
            </a>
          </p>
        </article>

        <nav aria-label={t('linksHeading')} className="text-sm">
          <h2 className="text-sm font-semibold text-forest-900">{t('linksHeading')}</h2>
          <ul className="mt-2 grid gap-1">
            {(
              [
                ['/soppforhold', 'linkSoppforhold'],
                ['/soppvarsel', 'linkSoppvarsel'],
                ['/apenhet', 'linkApenhet'],
                ['/datakilder', 'linkDatakilder'],
                ['/sikkerhet', 'linkSikkerhet'],
                ['/kjopsvilkar', 'linkKjopsvilkar']
              ] as const
            ).map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="text-forest-700 underline">
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
    </PageWrapper>
  );
}
