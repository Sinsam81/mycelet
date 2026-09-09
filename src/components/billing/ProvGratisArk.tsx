'use client';

import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

/**
 * «Start gratis uke» — arket som vises én gang (to, med et døgns mellomrom)
 * til en gratisbruker som nettopp har fått verdi i kartet. Reglene ligger i
 * src/lib/billing/provetilbud.ts. Knappen går til prissiden, som selger via
 * App Store i appen og Stripe på nett — samme sted for begge.
 *
 * Portal til <body>: kartets verktøyrad har en CSS-transform, og position:fixed
 * inni en transformert forelder får forelderen som ramme.
 */
export function ProvGratisArk({ onIkkeNaa, onStart }: { onIkkeNaa: () => void; onStart: () => void }) {
  const t = useTranslations('ProvGratisArk');
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provetilbud-tittel"
      onClick={onIkkeNaa}
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/40 p-3 sm:items-center"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="provetilbud-tittel" className="font-serif text-xl font-semibold text-forest-900">
            {t('tittel')}
          </h2>
          <button type="button" aria-label={t('lukk')} onClick={onIkkeNaa} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{t('tekst')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('vilkaar')}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/pricing"
            onClick={onStart}
            className="rounded-xl bg-forest-800 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-forest-900"
          >
            {t('start')}
          </Link>
          <button type="button" onClick={onIkkeNaa} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            {t('ikkeNaa')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
