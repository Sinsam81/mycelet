import type { Metadata } from 'next';
import Link from 'next/link';
import { Microscope } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Fasitlogg } from './Fasitlogg';

/**
 * Åpenhetssiden — valideringstallene bak varselet og AI-identifiseringen,
 * med dato, metode og kildeartefakt for hvert tall. Siden viser bevisst også
 * tallene som ikke smigrer oss — det romlige signalet nær myntkast er
 * grunnen til at appen lover skog og forhold, aldri punkter.
 *
 * Tallkanon (avgjort mot valideringsartefaktene 26.08.2026):
 *  · NÅR: AUC 0,88 (0,882, streng temporal splitt tren <2021 / test ≥2021,
 *    docs/reports/prediction-model.md). «0,89» fra den løsere hash-splitten
 *    skal ALDRI siteres offentlig — runbooken forbyr å kalle den temporal
 *    validering. En vaktest låser dette.
 *  · HVOR: 0,50–0,52 (skog × habitat × sesongkurve — backtest-full-pipeline
 *    scorer IKKE vær/jord/terreng; si aldri «full modell»), 0,54 (habitat),
 *    0,47–0,52 (funntetthet).
 *    «Beste sted»-statistikken (AUC 0,65, p = 0,44) gjelder de 18 av 26
 *    områdene med skogdata — se docs/validering-romlig-signal.md.
 *  · Kindwise: kun deres egne publiserte tall, merket som leverandørens,
 *    hvert med lenke til innlegget som faktisk inneholder tallet.
 *
 * Siden snakker som «vi»/Mycelet og rendrer aldri juridisk enhet eller
 * byline — juridisk informasjon hører hjemme på vilkårssidene og bare der.
 */

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Apenhet');
  return {
    title: t('metaTitle'),
    description: t('metaDescription')
  };
}

export default async function TransparencyPage() {
  const t = await getTranslations('Apenhet');

  return (
    <PageWrapper>
      <section className="space-y-4 pb-8">
        <header className="pt-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-forest-900">
            <Microscope className="h-6 w-6" aria-hidden />
            {t('heading')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('intro1')}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('intro2')}</p>
        </header>

        {/* ── NÅR: det validerte signalet ─────────────────────────────── */}
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-forest-900">{t('timingHeading')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('timingP1')}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('timingP2')}</p>
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
            {t('timingCaveat')}
          </p>
        </article>

        {/* ── Fasitloggen: hvert varsel etterprøvd ─────────────────────── */}
        <Fasitlogg />

        {/* ── HVOR: den ærlige svakheten — signaturgrepet på hele siden ── */}
        <article className="rounded-xl border-2 border-forest-300 bg-forest-50 p-4">
          <h2 className="text-lg font-semibold text-forest-900">{t('spatialHeading')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{t('spatialP1')}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{t('spatialP2')}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{t('spatialP3')}</p>
        </article>

        {/* ── AI-identifiseringen ─────────────────────────────────────── */}
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-forest-900">{t('aiHeading')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {t('aiP1')}{' '}
            <a
              href="https://www.kindwise.com/post/production-release-insect-id-mushroom-id"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-forest-700 underline"
            >
              {t('aiKindwiseLink2024')}
            </a>
            {' · '}
            <a
              href="https://www.kindwise.com/post/meet-the-new-mushroom-id"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-forest-700 underline"
            >
              {t('aiKindwiseLink2023')}
            </a>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('aiP2')}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {t('aiP3')}{' '}
            <a
              href="https://pubmed.ncbi.nlm.nih.gov/36794335/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-forest-700 underline"
            >
              Hodgson m.fl. 2023
            </a>
            {' · '}
            <a
              href="https://www.nature.com/articles/s41538-026-00752-4"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-forest-700 underline"
            >
              Kuznetsov m.fl. 2026
            </a>
          </p>
          <p className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium leading-relaxed text-amber-900">
            {t('aiRule')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {t('aiP4')}{' '}
            <a
              href="https://www.kindwise.com/mushroom-id"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-forest-700 underline"
            >
              {t('aiKindwiseDataLink')}
            </a>
          </p>
        </article>

        {/* ── Slik måler vi ───────────────────────────────────────────── */}
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-forest-900">{t('methodHeading')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('methodP1')}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {t('methodP2')}{' '}
            <Link href="/sanketips/hva-viser-soppkartene" className="font-medium text-forest-700 underline">
              {t('methodArticleLink')}
            </Link>
          </p>
        </article>

        {/* ── Det vi ikke vet ennå ────────────────────────────────────── */}
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-forest-900">{t('unknownsHeading')}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
            <li>{t('unknown1')}</li>
            <li>{t('unknown2')}</li>
            <li>{t('unknown3')}</li>
            <li>{t('unknown4')}</li>
          </ul>
        </article>

        <p className="text-xs leading-relaxed text-gray-500">
          {t('datesNote')}{' '}
          <Link href="/datakilder" className="underline">
            {t('sourcesLink')}
          </Link>
        </p>

        <Link href="/" className="inline-flex text-sm font-medium text-forest-800 hover:underline">
          {t('backHome')}
        </Link>
      </section>
    </PageWrapper>
  );
}
