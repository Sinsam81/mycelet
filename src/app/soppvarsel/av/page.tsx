import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { getUserLocale } from '@/i18n/locale';
import type { Locale } from '@/i18n/config';

/**
 * Kvitteringen etter en avmelding.
 *
 * Selve avmeldingen skjer i /api/soppvarsel/av, som gjør jobben og sender hit
 * med ?ok=1 eller ?ok=0. Siden gjør derfor INGENTING selv — den bekrefter bare.
 * Det er med vilje: en side som utfører en endring når den vises, kan trigges
 * av lenkeforhåndsvisning og e-postskannere, og da ville folk blitt meldt av
 * uten å ha trykket på noe. API-ruta har det samme vernet på sin side: en
 * henting som ikke er et menneske som navigerer, melder ingen av — den får en
 * side med én knapp (se src/lib/alerts/lenkeside.ts).
 *
 * Språk: mottakeren er som regel IKKE innlogget, så cookien finnes ofte ikke.
 * API-ruta sender derfor med abonnementets lagrede språk (?sprak=sv|nb) —
 * samme kilde som e-posten selv. Uten parameteren faller vi tilbake på
 * getUserLocale (cookie, deretter Accept-Language), som treffer riktig for
 * svenske telefoner. En svensk mottaker som fulgte «Avregistrera dig här» skal
 * ikke lande på en norsk kvittering.
 *
 * Veien tilbake: de fleste abonnentene har ingen konto (påmeldingen på
 * /soppvarsel krever ingen), så kvitteringen peker dit først. «Fra profilen
 * din» alene var en blindvei for dem.
 *
 * Ingen innlogging. Se begrunnelsen i API-ruta.
 */

interface SideParams {
  ok?: string;
  sprak?: string;
}

async function sideLocale(sprak: string | undefined): Promise<Locale> {
  if (sprak === 'sv' || sprak === 'nb') return sprak;
  return getUserLocale();
}

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<SideParams>;
}): Promise<Metadata> {
  const { sprak } = await searchParams;
  const t = await getTranslations({ locale: await sideLocale(sprak), namespace: 'SoppvarselAv' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function AvmeldtPage({
  searchParams
}: {
  searchParams: Promise<SideParams>;
}) {
  const { ok, sprak } = await searchParams;
  const t = await getTranslations({ locale: await sideLocale(sprak), namespace: 'SoppvarselAv' });

  // Bare en eksplisitt ?ok=1 fra API-ruta er en bekreftelse. Å lande her uten
  // parameter (avkortet lenke, direkte besøk) skal IKKE se ut som suksess —
  // det var nettopp den falske tryggheten som gjorde avmeldingen verdiløs.
  const lyktes = ok === '1';

  return (
    <PageWrapper>
      <section className="mx-auto max-w-md space-y-4 py-10 text-center">
        {lyktes ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-forest-700" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-forest-900">{t('successHeading')}</h1>
            <p className="text-sm leading-relaxed text-gray-700">
              {t.rich('successBody', {
                varsel: (chunks) => (
                  <Link href="/soppvarsel" className="font-medium text-forest-800 underline">
                    {chunks}
                  </Link>
                )
              })}
            </p>
            <p className="text-sm text-gray-700">
              {t('mapBefore')}{' '}
              <Link href="/soppforhold" className="font-medium text-forest-800 underline">
                mycelet.com/soppforhold
              </Link>
              {t('mapAfter')}
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-forest-900">{t('errorHeading')}</h1>
            <p className="text-sm leading-relaxed text-gray-700">{t('errorBody')}</p>
            <p className="text-sm text-gray-700">
              {t('contactBefore')}{' '}
              <a href="mailto:post@mycelet.com" className="font-medium text-forest-800 underline">
                post@mycelet.com
              </a>
              {t('contactAfter')}
            </p>
          </>
        )}

        <p className="pt-2">
          <Link href="/" className="text-sm font-medium text-forest-800 underline">
            {t('toFrontpage')}
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}
