'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { TILBUD_UTLOSERE } from '@/lib/bruk/bruksdag';
import { STRIPE_PROVEDAGER } from '@/lib/billing/plans';
import { meldTilbudsarkApent } from '@/lib/billing/tilbudsark-apent';
import { useProveLofte } from '@/lib/hooks/useProveLofte';

/** Hva som fikk arket til å vises — samme verdier som bruksdag-raden «tilbud» lagrer. */
export type TilbudUtloser = (typeof TILBUD_UTLOSERE)[number];

/**
 * «Start gratis uke» — arket som vises én gang (to, med et døgns mellomrom)
 * til en gratisbruker som nettopp har fått verdi i kartet, og én gang på
 * forsiden ved første innlogging. Reglene ligger i
 * src/lib/billing/provetilbud.ts. Knappen går til prissiden, som selger via
 * App Store i appen og Stripe på nett — samme sted for begge.
 *
 * Rekkefølgen i teksten er bevisst: først alle områdene med begrunnelsen bak
 * tallet (det NÅR-per-område-signalet som faktisk er validert), så offline-
 * kartet, og AI-soppkjenneren SIST — ingen hadde brukt den på sju dager da
 * arket ledet med «ubegrenset AI» (docs/konvertering-og-gjenbruk-2026-09.md).
 * «Gratis viser 3 av 12» sies bare når det er det brukeren ser (utløser
 * «begrenset»).
 *
 * Løftet om en gratis uke står bare når det er sant: på nett gir Stripe den
 * til nye abonnenter; i appen bare når App Store gir den (useProveLofte).
 *
 * Portal til <body>: kartets verktøyrad har en CSS-transform, og position:fixed
 * inni en transformert forelder får forelderen som ramme.
 */
export function ProvGratisArk({
  onIkkeNaa,
  onStart,
  utloser
}: {
  onIkkeNaa: () => void;
  onStart: () => void;
  utloser: TilbudUtloser;
}) {
  const t = useTranslations('ProvGratisArk');
  const lofte = useProveLofte();
  // Mens arket ligger her, skal ingen annen flate stille sitt eget spørsmål
  // under det (tilbudsark-apent.ts). Ett spørsmål om gangen.
  useEffect(() => meldTilbudsarkApent(), []);

  // Måling: at tilbudet ble vist, og hva som utløste det (bruksflate «tilbud»,
  // migrasjon 068; utløseren i omrade-kolonnen). Uten dette vet vi ikke om
  // null prøveperioder betyr «nei takk» eller «aldri sett» — og ikke hvilken
  // utløser som faktisk fører til prissiden.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    fetch('/api/me/bruksdag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flate: 'tilbud', omrade: utloser }),
      keepalive: true
    }).catch(() => {});
  }, [utloser]);
  if (typeof document === 'undefined') return null;

  const begrenset = utloser === 'begrenset';
  const harProve = lofte.kjent && lofte.harProve;
  const dager = harProve ? lofte.proveDager : null;
  const pris = lofte.kjent ? lofte.pris : null;

  const tittel = begrenset
    ? t('tittel')
    : !harProve
      ? t('tittelStartUtenProve')
      : dager === null
        ? t('tittelStartUkjentLengde')
        : t('tittelStart', { dager });
  const vilkaar = !harProve
    ? pris
      ? t('vilkaarPris', { pris })
      : t('vilkaarUtenProve')
    : dager === null
      ? t('vilkaarUkjentLengde')
      : t('vilkaar', { dager });
  const start = !harProve ? t('startUtenProve') : dager === STRIPE_PROVEDAGER ? t('start') : t('startProve');

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
            {tittel}
          </h2>
          <button type="button" aria-label={t('lukk')} onClick={onIkkeNaa} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{t(begrenset ? 'tekst' : 'tekstStart')}</p>
        <p className="mt-1 text-xs text-gray-500">{vilkaar}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/pricing"
            onClick={onStart}
            className="rounded-xl bg-forest-800 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-forest-900"
          >
            {start}
          </Link>
          <button type="button" onClick={onIkkeNaa} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            {t(utloser === 'start' ? 'fortsettGratis' : 'ikkeNaa')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
