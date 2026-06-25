import Link from 'next/link';
import { AlertTriangle, BookOpen, Phone, Shield } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';

export const metadata = {
  title: 'Sikkerhet og ansvar — Mycelet',
  description: 'Slik bruker du Mycelet trygt. Kontaktinfo til Soppkontrollen og Giftinformasjonen ved behov.'
};

export default async function SikkerhetPage() {
  const t = await getTranslations('Sikkerhet');

  return (
    <PageWrapper>
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-700">{t('pageSubtitle')}</p>
        </div>

        <article className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <Phone className="h-6 w-6 shrink-0 text-red-700" />
            <div className="space-y-1">
              <p className="text-base font-bold text-red-900">{t('emergencyHeading')}</p>
              <p className="text-sm text-red-900">
                {t('callPrefix')}{' '}
                <a href="tel:+4722591300" className="font-bold underline">
                  Giftinformasjonen 22 59 13 00
                </a>{' '}
                {t('poisonSuffix')}
              </p>
              <p className="text-sm text-red-900">
                {t('callPrefix')}{' '}
                <a href="tel:113" className="font-bold underline">
                  113
                </a>{' '}
                {t('emergency113Suffix')}
              </p>
              <p className="pt-1 text-xs text-red-900">
                {t('preserveEvidence')}
              </p>
            </div>
          </div>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-forest-800" />
            <h2 className="font-semibold">{t('rulesHeading')}</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-800">
            <li>
              <span className="font-medium">{t('rule1Title')}</span> {t('rule1Body')}
            </li>
            <li>
              <span className="font-medium">{t('rule2Title')}</span> {t('rule2Body')}
            </li>
            <li>
              <span className="font-medium">{t('rule3Title')}</span> {t('rule3Body')}
            </li>
          </ol>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-forest-800" />
            <h2 className="font-semibold">{t('controlHeading')}</h2>
          </div>
          <p className="text-sm text-gray-800">
            {t('controlBody')}
          </p>
          <a
            href="https://soppognyttevekster.no/soppkontroll/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-3 py-2 text-sm font-medium text-white hover:bg-forest-700"
          >
            {t('controlLink')}
          </a>
        </article>

        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <h2 className="font-semibold">{t('dangersHeading')}</h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-800">
            <li>
              <span className="font-semibold">{t('danger1Name')}</span> {t('danger1Body')}
            </li>
            <li>
              <span className="font-semibold">{t('danger2Name')}</span> {t('danger2Body')}
            </li>
            <li>
              <span className="font-semibold">{t('danger3Name')}</span> {t('danger3Body')}
            </li>
            <li>
              <span className="font-semibold">{t('danger4Name')}</span> {t('danger4Body')}
            </li>
          </ul>
          <Link href="/species" className="text-sm font-medium text-forest-800 hover:underline">
            {t('allSpeciesLink')}
          </Link>
        </article>

        <article className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{t('limitationHeading')}</h2>
          <p className="text-sm text-gray-800">
            {t('limitationBody')}
          </p>
          <p className="text-sm text-gray-700">
            {t('seeAlsoPrefix')}{' '}
            <Link href="/personvern" className="font-medium text-forest-800 hover:underline">
              {t('privacyLinkText')}
            </Link>{' '}
            {t('seeAlsoSuffix')}
          </p>
        </article>
      </section>
    </PageWrapper>
  );
}
