import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';

// Section order (keys live in the Vilkar message namespace as <key>Title / <key>Body).
const SECTIONS = [
  'lastUpdated', 'serviceNature', 'safety', 'warrantyDisclaimer', 'liability',
  'acceptableUse', 'userContent', 'age', 'changes', 'governingLaw', 'entity'
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Vilkar');
  return { title: t('pageTitle') };
}

export default async function VilkarPage() {
  const t = await getTranslations('Vilkar');
  return (
    <PageWrapper>
      <section className="space-y-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('pageTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('intro')}</p>
        </div>
        {SECTIONS.map((key) => (
          <article key={key} className="space-y-1.5">
            <h2 className="font-semibold text-forest-900">{t(`${key}Title`)}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{t(`${key}Body`)}</p>
          </article>
        ))}
      </section>
    </PageWrapper>
  );
}
