import type { Metadata } from 'next';
import Link from 'next/link';
import { Cookie, Database, FileDown, Lock, Mail, Trash2, Users } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { entityFormSuffix, entityMessageValues } from '@/lib/legal/entity';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { PoisonHotlineLinks } from '@/components/safety/PoisonHotlineLinks';
import { AnalyticsPreferencesButton } from '@/components/analytics/AnalyticsPreferencesButton';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { NativeOnly } from '@/components/native/NativeOnly';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Personvern');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

// === Personvernerklæring — v1 (klar for lansering) ===
// Behandlingsansvarlig, kontakt-e-post, tredjeparter og datalagring er fylt inn.
// Gjenstår før/ved lansering:
//   1) Opprett innboksen privacy@mycelet.com (lenkes til gjennom hele siden).
//   2) Anbefalt (ikke påkrevd for App Store): la en jurist se over teksten.
//   3) Når kjøp i iOS-appen (RevenueCat/Apple IAP) skrus på: legg Apple + RevenueCat
//      til som databehandlere i punkt 4.

export default async function PersonvernPage() {
  const t = await getTranslations('Personvern');
  // Who the data controller is changes with the company form: for a sole
  // proprietorship it is the owner personally, for an AS it is the company.
  const locale = await getLocale();
  return (
    <PageWrapper>
      <section className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-gray-700">
            {t('lastUpdatedIntro', { date: t('lastUpdatedDate') })}
          </p>
        </div>

        {/* === 1. Behandlingsansvarlig === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-forest-700" /> {t('controllerHeading')}
          </h2>
          <p className="text-sm text-gray-700">
            {t('controllerIntro')}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>{t(`controllerName${entityFormSuffix()}`, entityMessageValues(locale))}</li>
            <li>
              {t('controllerContactLabel')}{' '}
              <a href="mailto:privacy@mycelet.com" className="font-medium text-forest-700 underline">
                privacy@mycelet.com
              </a>
            </li>
          </ul>
        </article>

        {/* === 2. Hva vi samler inn === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-5 w-5 text-forest-700" /> {t('collectHeading')}
          </h2>
          <p className="text-sm text-gray-700">{t('collectIntro')}</p>
          <dl className="space-y-2 text-sm text-gray-700">
            <div>
              <dt className="font-medium text-gray-900">{t('collectAccountTerm')}</dt>
              <dd>{t('collectAccountDesc')}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">{t('collectUsageTerm')}</dt>
              <dd>
                {t('collectUsageDesc')}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">{t('collectLocationTerm')}</dt>
              <dd>
                {t('collectLocationDesc')}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">{t('collectTechnicalTerm')}</dt>
              <dd>
                {t('collectTechnicalDesc')}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">{t('collectPaymentTerm')}</dt>
              <dd>
                {t('collectPaymentDesc')}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">{t('collectImagesTerm')}</dt>
              <dd>
                {t('collectImagesDesc')}
              </dd>
            </div>
          </dl>
        </article>

        {/* === 3. Lovlig grunnlag === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t('legalBasisHeading')}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">{t('legalBasisContractLabel')}</span> — {t('legalBasisContractDesc')}
            </li>
            <li>
              <span className="font-medium">{t('legalBasisLegitimateLabel')}</span> — {t('legalBasisLegitimateDesc')}
            </li>
            <li>
              <span className="font-medium">{t('legalBasisLegalLabel')}</span> — {t('legalBasisLegalDesc')}
            </li>
            <li>
              <span className="font-medium">{t('legalBasisConsentLabel')}</span> — {t('legalBasisConsentDesc')}
            </li>
          </ul>
        </article>

        {/* === 4. Tredjeparter === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t('processorsHeading')}</h2>
          <p className="text-sm text-gray-700">
            {t('processorsIntro')}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">Supabase</span> {t('processorSupabaseDesc')}{' '}
              <a
                href="https://supabase.com/legal/dpa"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                supabase.com/legal/dpa
              </a>
              .
            </li>
            <li>
              <span className="font-medium">Vercel</span> {t('processorVercelDesc')}{' '}
              <a
                href="https://vercel.com/legal/dpa"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                vercel.com/legal/dpa
              </a>
              . {t('processorVercelNote')}
            </li>
            <li>
              <span className="font-medium">Stripe</span> {t('processorStripeDesc')}{' '}
              <a
                href="https://stripe.com/legal/dpa"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                stripe.com/legal/dpa
              </a>
              . {t('processorStripeNote')}
            </li>
            <li>
              <span className="font-medium">RevenueCat</span> {t('processorRevenuecatDesc')}{' '}
              <a
                href="https://www.revenuecat.com/dpa/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                revenuecat.com/dpa
              </a>
              . {t('processorRevenuecatNote')}
            </li>
            <li>
              <span className="font-medium">Apple</span> {t('processorAppleDesc')}{' '}
              <a
                href="https://www.apple.com/legal/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                apple.com/legal/privacy
              </a>
              . {t('processorAppleNote')}
            </li>
            <li>
              <span className="font-medium">Kindwise</span> {t('processorKindwiseDesc')}{' '}
              <a
                href="https://www.kindwise.com/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                kindwise.com/privacy-policy
              </a>
              .
            </li>
            <li>
              <span className="font-medium">Google Analytics</span> {t('processorGoogleAnalyticsDesc')}{' '}
              <a
                href="https://support.google.com/analytics/answer/6004245"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest-700 underline"
              >
                support.google.com/analytics
              </a>
              .
            </li>
            <li>
              <span className="font-medium">{t('processorMetLabel')}</span> {t('processorAnd')} <span className="font-medium">{t('processorSmhiLabel')}</span>{' '}
              {t('processorWeatherDesc')}
            </li>
            <li>
              <span className="font-medium">{t('processorNibioLabel')}</span> {t('processorAnd')} <span className="font-medium">{t('processorCorineLabel')}</span>{' '}
              {t('processorForestDesc')}
            </li>
            {/* Karttjenestene hentes av NETTLESEREN, ikke av serveren vår (se
                connect-src/img-src i next.config.js). De får derfor IP-adressen
                din og hvilket kartutsnitt du ser på — inkludert utsnittet rundt
                din egen posisjon når kartet sentreres på GPS. Det er en annen
                situasjon enn MET/SMHI/NIBIO over, der bare koordinater sendes
                fra serveren, og det måtte stå her. */}
            <li>
              <span className="font-medium">{t('processorMapTilesLabel')}</span> {t('processorMapTilesDesc')}
            </li>
            <li>
              <span className="font-medium">Wikimedia Commons</span> — {t('processorWikimediaDesc')}
            </li>
          </ul>
        </article>

        {/* === 5. Retensjon === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t('retentionHeading')}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">{t('retentionActiveLabel')}</span> {t('retentionActiveDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionInactiveLabel')}</span> {t('retentionInactiveDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionDeletedLabel')}</span> {t('retentionDeletedDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionForumLabel')}</span> {t('retentionForumDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionNegativeLabel')}</span> {t('retentionNegativeDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionPaymentLabel')}</span> {t('retentionPaymentDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionAuditLabel')}</span> {t('retentionAuditDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionServerLabel')}</span> {t('retentionServerDesc')}
            </li>
            <li>
              <span className="font-medium">{t('retentionAnalyticsLabel')}</span> {t('retentionAnalyticsDesc')}
            </li>
          </ul>
        </article>

        {/* === 6. Internasjonale overføringer === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t('transfersHeading')}</h2>
          <p className="text-sm text-gray-700">
            {t('transfersDesc')}
          </p>
        </article>

        {/* === 7. Dine rettigheter === */}
        <article className="space-y-3 rounded-xl border-2 border-forest-300 bg-forest-50 p-4">
          <h2 className="text-lg font-semibold text-forest-900">{t('rightsHeading')}</h2>
          <p className="text-sm text-forest-900">{t('rightsIntro')}</p>

          <div className="space-y-2 text-sm text-forest-900">
            <div className="flex items-start gap-2">
              <FileDown className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">{t('rightsAccessLabel')}</p>
                <p>
                  {t('rightsAccessDescBefore')}{' '}
                  <code className="rounded bg-forest-100 px-1 py-0.5 text-xs">GET /api/me/export</code> {t('rightsAccessDescAfter')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">{t('rightsDeleteLabel')}</p>
                <p>
                  {t('rightsDeleteDescBefore')}{' '}
                  <code className="rounded bg-forest-100 px-1 py-0.5 text-xs">POST /api/me/delete</code>. {t('rightsDeleteDescAfter')}
                </p>
              </div>
            </div>

            <div>
              <p className="font-medium">{t('rightsCorrectionLabel')}</p>
              <p>{t('rightsCorrectionDesc')}</p>
            </div>

            <div>
              <p className="font-medium">{t('rightsRestrictionLabel')}</p>
              <p>
                {t('rightsRestrictionDescBefore')}{' '}
                <a href="mailto:privacy@mycelet.com" className="font-medium underline">
                  privacy@mycelet.com
                </a>{' '}
                {t('rightsRestrictionDescAfter')}
              </p>
            </div>

            <div>
              <p className="font-medium">{t('rightsComplaintLabel')}</p>
              <p>
                {t('rightsComplaintDescBefore')}{' '}
                <a
                  href={t('supervisoryAuthorityUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  {t('supervisoryAuthorityHost')}
                </a>{' '}
                {t('rightsComplaintDescAfter')}
              </p>
            </div>
          </div>
        </article>

        {/* === 8. Cookies === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Cookie className="h-5 w-5 text-forest-700" /> {t('cookiesHeading')}
          </h2>
          <p className="text-sm text-gray-700">{t('cookiesIntro')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">{t('cookiesSessionLabel')}</span> {t('cookiesSessionDesc')}
            </li>
            {/* Språk-cookien settes både i middleware og av språkvelgeren, og
                sto ikke i denne lista — §8 er nettopp den delen som skal være
                uttømmende. */}
            <li>
              <span className="font-medium">{t('cookiesLocaleLabel')}</span> {t('cookiesLocaleDesc')}
            </li>
            <li>
              <span className="font-medium">{t('cookiesStripeLabel')}</span> {t('cookiesStripeDesc')}
            </li>
          </ul>
          <p className="text-sm text-gray-700">{t('cookiesOptionalIntro')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>
              <span className="font-medium">{t('cookiesAnalyticsLabel')}</span> {t('cookiesAnalyticsDesc')}
            </li>
          </ul>
          <p className="text-sm text-gray-700">{t('cookiesMarketing')}</p>
          <p className="text-sm text-gray-700">{t('cookiesLocalStorage')}</p>
          {/* Knappen dispatcher et vindusevent som BARE CookieNotice lytter på,
              og CookieNotice er pakket i NonNativeOnly i rot-layouten. I
              App Store-bygget fantes altså knappen uten lytter: et trykk gjorde
              ingenting, uten feilmelding — på nettopp den siden en Apple-
              reviewer leser. Ingen data sto på spill (GA er bevisst av i det
              native bygget), men en død kontroll her er den dyreste av alle. */}
          <NonNativeOnly>
            <AnalyticsPreferencesButton label={t('cookiesManage')} />
          </NonNativeOnly>
          <NativeOnly>
            <p className="text-sm text-gray-700">{t('cookiesNativeNoAnalytics')}</p>
          </NativeOnly>
        </article>

        {/* === 9. Sikkerhet === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-5 w-5 text-forest-700" /> {t('securityHeading')}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>{t('securityHttps')}</li>
            <li>{t('securityPasswords')}</li>
            <li>{t('securityRls')}</li>
            <li>{t('securityHeaders')}</li>
            <li>{t('securityAdmin')}</li>
          </ul>
        </article>

        {/* === 10. Brudd === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t('breachHeading')}</h2>
          <p className="text-sm text-gray-700">
            {t('breachDesc')}
          </p>
        </article>

        {/* === 11. Endringer === */}
        <article className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t('changesHeading')}</h2>
          <p className="text-sm text-gray-700">
            {t('changesDesc')}
          </p>
        </article>

        {/* === 12. Kontakt === */}
        <article className="space-y-2 rounded-xl border-2 border-forest-300 bg-forest-50 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-forest-900">
            <Mail className="h-5 w-5" /> {t('contactHeading')}
          </h2>
          <p className="text-sm text-forest-900">
            {t('contactDescBefore')}{' '}
            <a href="mailto:privacy@mycelet.com" className="font-medium underline">
              privacy@mycelet.com
            </a>
            .
          </p>
          <p className="text-sm text-forest-900">
            {t('contactEmergencyBefore')}{' '}
            <PoisonHotlineLinks withName className="font-medium underline" />{' '}
            {t('contactEmergencyAfter')}
          </p>
        </article>

        <p className="pt-2 text-center text-xs text-gray-500">
          <Link href="/" className="underline">
            {t('backToHome')}
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}
