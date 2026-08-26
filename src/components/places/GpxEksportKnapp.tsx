'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Copy, Download, Loader2, X } from 'lucide-react';
import { useIsNative } from '@/lib/hooks/useIsNative';

/**
 * «Last ned som GPX» på Mine steder — brukerens egne funn som veipunkter,
 * klare for Garmin, UT.no og Organic Maps.
 *
 * Fila bygges av /api/me/gpx (owner-RLS, paginerer forbi sidevisningens
 * 1000-raders tak, artsnavn på leserens språk) — ikke av props: notatene til
 * opptil tusenvis av funn skal ikke fraktes i RSC-payloaden på hver eneste
 * sidevisning for en fil de færreste laster ned.
 *
 * Nedlastingsveien er GDPR-eksportens (AccountDataActions):
 *  · nett: fetch → blob + a[download].
 *  · appskallet: WKWebView uten nedlastingsdelegat avbryter nedlastinger i
 *    STILLHET (dokumentert App Review-smell i AccountDataActions) — der vises
 *    innholdet i et vindu med kopier-knapp i stedet. Ingen nye plugins; det
 *    ville krevd et nytt native-bygg.
 */
export function GpxEksportKnapp({ antall }: { antall: number }) {
  const t = useTranslations('MineSteder');
  const native = useIsNative();
  const [henter, setHenter] = useState(false);
  const [gpxTekst, setGpxTekst] = useState<string | null>(null);

  if (antall === 0) return null;

  const handleEksport = async () => {
    setHenter(true);
    try {
      const res = await fetch('/api/me/gpx');
      if (!res.ok) {
        toast.error(t('gpxFailed'));
        return;
      }
      const gpx = await res.text();
      if (native) {
        setGpxTekst(gpx);
        return;
      }
      const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mycelet-mine-steder.gpx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('gpxDownloaded'), { duration: 3000 });
    } catch {
      toast.error(t('gpxFailed'));
    } finally {
      setHenter(false);
    }
  };

  const kopier = async () => {
    if (!gpxTekst) return;
    try {
      await navigator.clipboard.writeText(gpxTekst);
      toast.success(t('gpxCopied'));
    } catch {
      toast.error(t('gpxCopyFailed'));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleEksport()}
        disabled={henter}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
      >
        {henter ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        {t('gpxExport', { count: antall })}
      </button>

      {gpxTekst ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gpx-eksport-tittel"
          onClick={() => setGpxTekst(null)}
          className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 id="gpx-eksport-tittel" className="font-serif text-lg font-semibold text-forest-900">
                {t('gpxModalHeading')}
              </h2>
              <button type="button" aria-label={t('gpxModalClose')} onClick={() => setGpxTekst(null)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-700">{t('gpxModalBody')}</p>
            <textarea
              readOnly
              value={gpxTekst}
              aria-label={t('gpxModalHeading')}
              className="mt-3 h-40 w-full rounded-lg border border-gray-300 p-2 font-mono text-[11px] text-gray-800"
            />
            <button
              type="button"
              onClick={() => void kopier()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-800"
            >
              <Copy className="h-4 w-4" aria-hidden />
              {t('gpxCopy')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
