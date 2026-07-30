import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { LEGAL_ENTITY } from '@/lib/legal/entity';

/**
 * The statutory contact page.
 *
 * angrerettloven § 8 d requires the trader's name, GEOGRAPHIC address,
 * telephone number and email before the contract is concluded; ehandelsloven
 * § 8 adds the organisation number, the register it is entered in, and VAT
 * status. A P.O. box does not satisfy "geografisk adresse" — the EU
 * Commission's CRD guidance (2021/C 525/01, 3.2.2.3) says so explicitly, and
 * the Swedish distansavtalslagen writes "gatuadressen" in plain words.
 *
 * NOINDEX IS DELIBERATE. For a sole proprietorship the required address is the
 * owner's home. The law demands the information be easy and directly
 * accessible to consumers and authorities — it does not demand that search
 * engines index it. Excluding the page from search is the one free way to
 * limit exposure without withholding anything.
 *
 * Note what is NOT done here, on purpose: no robots.txt disallow (that blocks
 * fetching, which is arguably withholding), and the address is real text, never
 * an image. Both of those would be attackable as making the information not
 * "enkelt og direkte tilgjengelig".
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Kontakt');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true }
  };
}

export default async function KontaktPage() {
  const t = await getTranslations('Kontakt');
  const e = LEGAL_ENTITY;

  const rows: Array<{ label: string; value: string }> = [
    { label: t('orgNrLabel'), value: e.orgNr },
    ...(e.postalAddress ? [{ label: t('addressLabel'), value: e.postalAddress }] : []),
    ...(e.phone
      ? [{ label: t('phoneLabel'), value: e.phoneHours ? `${e.phone} (${e.phoneHours})` : e.phone }]
      : []),
    { label: t('emailLabel'), value: e.generalEmail },
    { label: t('privacyEmailLabel'), value: e.privacyEmail },
    { label: t('websiteLabel'), value: e.website },
    { label: t('registerLabel'), value: t('registerValue') },
    { label: t('vatLabel'), value: e.vatRegistered ? t('vatYes') : t('vatNo') }
  ];

  return (
    <PageWrapper>
      <section className="space-y-5">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('pageTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('intro')}</p>
        </div>

        <article className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-forest-900">{t('operatorHeading')}</h2>
          <p className="mb-3 text-lg font-medium text-gray-900">{e.legalName}</p>
          <dl className="space-y-2 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="sm:flex sm:gap-3">
                <dt className="shrink-0 text-gray-500 sm:w-48">{row.label}</dt>
                <dd className="text-gray-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="space-y-1.5">
          <h2 className="font-semibold text-forest-900">{t('responseHeading')}</h2>
          <p className="text-sm leading-relaxed text-gray-800">{t('responseBody')}</p>
        </article>

        <article className="space-y-1.5">
          <h2 className="font-semibold text-forest-900">{t('missingHeading')}</h2>
          <p className="text-sm leading-relaxed text-gray-800">{t('missingBody')}</p>
        </article>

        <nav className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-sm">
          <Link href="/vilkar" className="font-medium text-forest-800 hover:underline">
            {t('termsLink')}
          </Link>
          <Link href="/kjopsvilkar" className="font-medium text-forest-800 hover:underline">
            {t('purchaseTermsLink')}
          </Link>
          <Link href="/personvern" className="font-medium text-forest-800 hover:underline">
            {t('privacyLink')}
          </Link>
        </nav>
      </section>
    </PageWrapper>
  );
}
