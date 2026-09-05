'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellRing } from 'lucide-react';

/**
 * Kvitteringen etter bekreftet påmelding — vist PÅ områdesiden, ikke på et
 * tomt takk-skjema. Den som bekrefter midt i en lang godværsperiode må
 * forstå at stillheten er tilsiktet: varselet kommer når det snur, ikke
 * daglig. Under banneret ligger dagens tall og uka fremover — det er verdien.
 *
 * Klientkomponent med vilje: områdesiden er statisk cachet (revalidate 3600),
 * og en server-lest searchParam ville gjort den dynamisk for alle.
 */
const COPY = {
  NO: {
    tittel: (navn: string) => `Du er påmeldt soppvarselet for ${navn}`,
    tekst:
      'Under ser du dagens forhold og uka fremover. Neste e-post kommer den dagen forholdene krysser fra under til over terskelen etter en reell bedring — aldri oftere enn én gang i uka. Er det stille, er det fordi det ikke har snudd.'
  },
  SE: {
    tittel: (navn: string) => `Du är anmäld till svampvarningen för ${navn}`,
    tekst:
      'Nedan ser du dagens läge och veckan framöver. Nästa mejl kommer den dag förhållandena korsar tröskeln efter en verklig förbättring — aldrig oftare än en gång i veckan. Är det tyst är det för att det inte har vänt.'
  }
} as const;

function Banner({ navn, land }: { navn: string; land: 'NO' | 'SE' }) {
  const params = useSearchParams();
  if (params.get('status') !== 'bekreftet') return null;
  const t = COPY[land];
  return (
    <section
      id="pameldt"
      className="scroll-mt-24 rounded-xl border border-forest-300 bg-forest-50 p-4 text-forest-900"
      role="status"
    >
      <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
        <BellRing className="h-5 w-5" aria-hidden="true" />
        {t.tittel(navn)}
      </h2>
      <p className="mt-1 text-sm leading-relaxed">{t.tekst}</p>
    </section>
  );
}

export function PameldtBanner(props: { navn: string; land: 'NO' | 'SE' }) {
  // useSearchParams krever Suspense ved prerendering.
  return (
    <Suspense fallback={null}>
      <Banner {...props} />
    </Suspense>
  );
}
