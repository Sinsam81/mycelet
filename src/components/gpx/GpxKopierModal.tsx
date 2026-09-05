'use client';

import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Copy, X } from 'lucide-react';

/**
 * GPX i appskallet: WKWebView uten nedlastingsdelegat avbryter nedlastinger i
 * stillhet (se GpxEksportKnapp), så der vises innholdet med en kopier-knapp.
 * Brukes av «Lovende områder» på kartet (samme tekster som Mine steder,
 * MineSteder-navnerommet; egen overskrift per kallsted).
 *
 * Rendres i en portal til <body>: kartets verktøyrad har en CSS-transform, og
 * en position:fixed inni en transformert forelder får forelderen som ramme —
 * bakteppet dekket bare verktøyraden, ikke skjermen.
 */
export function GpxKopierModal({ tittel, gpx, onClose }: { tittel: string; gpx: string; onClose: () => void }) {
  const t = useTranslations('MineSteder');

  const kopier = async () => {
    try {
      await navigator.clipboard.writeText(gpx);
      toast.success(t('gpxCopied'));
    } catch {
      toast.error(t('gpxCopyFailed'));
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gpx-kopier-tittel"
      onClick={onClose}
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h2 id="gpx-kopier-tittel" className="font-serif text-lg font-semibold text-forest-900">
            {tittel}
          </h2>
          <button type="button" aria-label={t('gpxModalClose')} onClick={onClose}>
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-700">{t('gpxModalBody')}</p>
        <textarea readOnly value={gpx} aria-label={tittel} className="mt-3 h-40 w-full rounded-lg border border-gray-300 p-2 font-mono text-[11px] text-gray-800" />
        <button
          type="button"
          onClick={() => void kopier()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-800"
        >
          <Copy className="h-4 w-4" aria-hidden />
          {t('gpxCopy')}
        </button>
      </div>
    </div>,
    document.body
  );
}
