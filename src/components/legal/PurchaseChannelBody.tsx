'use client';

import { useIsNative } from '@/lib/hooks/useIsNative';

/**
 * Avsnittet «Produkter og priser» i kjøpsvilkårene, i to utgaver.
 *
 * På nett må teksten beskrive BEGGE kjøpskanalene: web-kunden inngår avtale med
 * {legalName}, og angrerettloven § 8 / distansavtalslagen krever at prisen,
 * selgeren og betalingsmåten oppgis før avtalen inngås. Den plikten forsvinner
 * ikke.
 *
 * I iOS-skallet er kontrakten en annen: der er Apple selger, og teksten om at
 * «du kan også kjøpe på mycelet.com med kort via Stripe» beskriver en
 * betalingsvei utenom in-app-kjøp. Retningslinje 3.1.1 forbyr å peke kunder mot
 * andre kjøpsmekanismer enn App Store fra innsiden av appen — også når det står
 * i et vilkårsdokument. Derfor får appen en utgave som bare omtaler den kanalen
 * som faktisk gjelder der.
 *
 * Ingen forbrukerrettighet går tapt: en som kjøper i appen kjøper av Apple, og
 * punkt 4 og 5 (angrerett og refusjon) peker allerede dit.
 */
export function PurchaseChannelBody({ web, native }: { web: string; native: string }) {
  const isNative = useIsNative();
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{isNative ? native : web}</p>
  );
}
