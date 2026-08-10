import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';

/**
 * Kvitteringen etter en avmelding.
 *
 * Selve avmeldingen skjer i /api/soppvarsel/av, som gjør jobben og sender hit
 * med ?ok=1 eller ?ok=0. Siden gjør derfor INGENTING selv — den bekrefter bare.
 * Det er med vilje: en side som utfører en endring på GET kan trigges av
 * lenkeforhåndsvisning i e-postklienter, og da ville folk blitt meldt av uten å
 * ha trykket på noe.
 *
 * Ingen innlogging. Se begrunnelsen i API-ruta.
 */

export const metadata: Metadata = {
  title: 'Soppvarsel avslått',
  robots: { index: false, follow: false }
};

export default async function AvmeldtPage({
  searchParams
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const lyktes = ok !== '0';

  return (
    <PageWrapper>
      <section className="mx-auto max-w-md space-y-4 py-10 text-center">
        {lyktes ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-forest-700" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-forest-900">Du får ikke flere soppvarsler</h1>
            <p className="text-sm leading-relaxed text-gray-700">
              Vi har slått av varselet. Området du hadde valgt er tatt vare på, så du kan slå det på
              igjen når som helst fra profilen din — uten å velge på nytt.
            </p>
            <p className="text-sm text-gray-700">
              Soppforholdene ligger fortsatt åpent for alle på{' '}
              <Link href="/soppforhold" className="font-medium text-forest-800 underline">
                mycelet.com/soppforhold
              </Link>
              , uten innlogging.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-forest-900">Lenken virket ikke</h1>
            <p className="text-sm leading-relaxed text-gray-700">
              Den kan være ufullstendig — noen e-postklienter deler lange lenker over to linjer.
              Prøv å kopiere hele adressen fra e-posten, eller slå av varselet fra profilen din.
            </p>
            <p className="text-sm text-gray-700">
              Får du det fortsatt ikke til, send en e-post til{' '}
              <a href="mailto:post@mycelet.com" className="font-medium text-forest-800 underline">
                post@mycelet.com
              </a>
              , så gjør vi det for deg.
            </p>
          </>
        )}

        <p className="pt-2">
          <Link href="/" className="text-sm font-medium text-forest-800 underline">
            Til forsiden
          </Link>
        </p>
      </section>
    </PageWrapper>
  );
}
