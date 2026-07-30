import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { getLocale } from 'next-intl/server';
import { entityFormSuffix, entityMessageValues } from '@/lib/legal/entity';

const SECTIONS = [
  'seller', 'productsAndPrices', 'payment', 'angrerett', 'cancellation',
  'renewalAndPriceChanges', 'deliveryAndAccess', 'complaintsAndDisputes', 'assignment', 'contact'
];


/**
 * NOINDEX, same reasoning as /kontakt: this page repeats the statutory trader
 * block, which for a sole proprietorship contains the owner's home address.
 * The information must be easy and directly accessible — angrerettloven § 8
 * requires it to be GIVEN before the contract, which a linked page would not
 * clearly satisfy — but nothing requires it to be searchable. Excluding the
 * page from the index is the only free mitigation, and terms pages carry no
 * SEO value anyway.
 *
 * Keeping the block here and noindexing is deliberate: moving the address to a
 * link would trade a real legal duty for a cosmetic privacy gain.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Kjopsvilkar');
  return { title: t('pageTitle'), robots: { index: false, follow: true } };
}

export default async function KjopsvilkarPage() {
  const t = await getTranslations('Kjopsvilkar');
  // Seller identity from one place — see src/lib/legal/entity.ts (ENK → AS).
  const entity = entityMessageValues(await getLocale());
  return (
    <PageWrapper>
      <section className="space-y-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('pageTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('intro', entity)}</p>
        </div>
        {SECTIONS.map((key) => (
          <article key={key} className="space-y-1.5">
            <h2 className="font-semibold text-forest-900">{t(`${key}Title`)}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{t(`${key}Body`, entity)}</p>
            {key === 'seller' ? (
              // The "what a sole proprietorship means" paragraph has to change
              // wording entirely for an AS, so it is its own keyed variant.
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">
                {t(`sellerFormNote${entityFormSuffix()}`, entity)}
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </PageWrapper>
  );
}
