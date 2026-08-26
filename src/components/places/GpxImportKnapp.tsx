'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, X } from 'lucide-react';
import { lesGpx, type GpxFeil } from '@/lib/gpx/les-gpx';
import {
  DUPLIKAT_METER,
  MAKS_FILSTORRELSE_BYTES,
  MAKS_VEIPUNKTER,
  skillDuplikater,
  validerVeipunkt,
  type ValidertVeipunkt
} from '@/lib/steder/veipunkt';

/**
 * «Importer GPX-fil» på Mine steder — veipunktene fra en annen app inn i
 * Mycelet som markerte steder (saved_places), ikke som funn.
 *
 * ── FORHÅNDSVISNINGEN ER FUNKSJONEN ────────────────────────────────────────
 *
 * Ingenting skrives før brukeren har sett HVA som blir importert og hva som
 * ikke blir det: duplikater, punkter uten posisjon, avkorting ved taket, og
 * sporloggen som ligger i fila uten å bli med. En import som bare sier «131
 * steder lagt til» skjuler nettopp det brukeren trenger å vite for å stole på
 * at dataene hens kom helt fram.
 *
 * ── FILA FORLATER ALDRI ENHETEN ────────────────────────────────────────────
 *
 * Parsingen skjer her, i nettleseren. Serveren får ferdig validert JSON og ser
 * aldri XML — se filhodet i src/lib/gpx/les-gpx.ts for hvorfor det er en
 * sikkerhetsbeslutning og ikke en smakssak.
 */

interface Props {
  /** Stedene brukeren har fra før — kun koordinater, for duplikatsjekken. */
  eksisterende: { latitude: number; longitude: number }[];
  /** Totaltaket per bruker (migrasjon 055). */
  maks: number;
}

type Steg = 'tom' | 'leser' | 'forhandsvisning' | 'sender' | 'ferdig';

interface Resultat {
  importert: number;
  hoppetOver: number;
  batchId: string | null;
}

export function GpxImportKnapp({ eksisterende, maks }: Props) {
  const t = useTranslations('MineSteder');
  const router = useRouter();
  const filRef = useRef<HTMLInputElement>(null);
  const [steg, setSteg] = useState<Steg>('tom');
  const [filnavn, setFilnavn] = useState('');
  const [nye, setNye] = useState<ValidertVeipunkt[]>([]);
  const [duplikater, setDuplikater] = useState(0);
  const [ugyldige, setUgyldige] = useState(0);
  const [avkortet, setAvkortet] = useState(0);
  const [sporpunkter, setSporpunkter] = useState(0);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [angrer, setAngrer] = useState(false);

  const plass = Math.max(0, maks - eksisterende.length);

  const feilmelding = (feil: GpxFeil): string =>
    feil === 'ikke-gpx' ? t('gpxImportNotGpx') : t('gpxImportBrokenXml');

  const lukk = () => {
    setSteg('tom');
    setResultat(null);
    setNye([]);
  };

  const velgFil = async (fil: File) => {
    setFilnavn(fil.name);
    setSteg('leser');

    // Taket sjekkes på FILA, før den blir en streng i minnet. En sporlogg på
    // 40 MB skal ikke i det hele tatt leses inn på en gammel telefon.
    if (fil.size > MAKS_FILSTORRELSE_BYTES) {
      toast.error(t('gpxImportTooBig', { mb: Math.round(MAKS_FILSTORRELSE_BYTES / (1024 * 1024)) }));
      setSteg('tom');
      return;
    }

    let tekst: string;
    try {
      tekst = await fil.text();
    } catch {
      toast.error(t('gpxImportBrokenXml'));
      setSteg('tom');
      return;
    }

    const lesing = lesGpx(tekst);
    if (lesing.feil) {
      toast.error(feilmelding(lesing.feil));
      setSteg('tom');
      return;
    }

    // Navnet er påkrevd i basen. Fila gir det som regel; når den ikke gjør det,
    // settes et på LESERENS språk her — serveren kan ikke gjette bedre.
    const validerte = lesing.veipunkter
      .map((punkt, i) => validerVeipunkt(punkt, t('gpxImportUnnamed', { n: i + 1 })))
      .filter((punkt): punkt is ValidertVeipunkt => punkt !== null);

    const delt = skillDuplikater(validerte, eksisterende);

    setNye(delt.nye);
    setDuplikater(delt.duplikater.length);
    setUgyldige(lesing.ugyldige + (lesing.veipunkter.length - validerte.length));
    setAvkortet(lesing.avkortet);
    setSporpunkter(lesing.sporpunkter);

    if (lesing.funnet === 0) {
      toast.error(t('gpxImportEmpty'));
      setSteg('tom');
      return;
    }

    setSteg('forhandsvisning');
  };

  const importer = async () => {
    setSteg('sender');
    try {
      const res = await fetch('/api/me/steder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ punkter: nye, filnavn })
      });
      const svar = (await res.json().catch(() => null)) as
        | { importert?: number; hoppetOver?: number; batchId?: string | null; plass?: number }
        | null;

      if (!res.ok) {
        // 409 er det ene tilfellet der brukeren kan gjøre noe med det selv.
        toast.error(res.status === 409 ? t('gpxImportNoRoom', { maks }) : t('gpxImportFailed'));
        setSteg('forhandsvisning');
        return;
      }

      setResultat({
        importert: svar?.importert ?? 0,
        hoppetOver: svar?.hoppetOver ?? 0,
        batchId: svar?.batchId ?? null
      });
      setSteg('ferdig');
      toast.success(t('gpxImportDone', { count: svar?.importert ?? 0 }));
      router.refresh();
    } catch {
      toast.error(t('gpxImportFailed'));
      setSteg('forhandsvisning');
    }
  };

  const angre = async () => {
    if (!resultat?.batchId) return;
    setAngrer(true);
    try {
      const res = await fetch(`/api/me/steder?batch=${encodeURIComponent(resultat.batchId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        toast.error(t('placesDeleteFailed'));
        return;
      }
      toast.success(t('gpxImportUndone'));
      router.refresh();
      lukk();
    } catch {
      toast.error(t('placesDeleteFailed'));
    } finally {
      setAngrer(false);
    }
  };

  const åpent = steg === 'forhandsvisning' || steg === 'sender' || steg === 'ferdig';

  return (
    <>
      <button
        type="button"
        onClick={() => filRef.current?.click()}
        disabled={steg === 'leser'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
      >
        {steg === 'leser' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {steg === 'leser' ? t('gpxImportReading') : t('gpxImport')}
      </button>

      <input
        ref={filRef}
        type="file"
        // Både filendelse og MIME-typer: iOS' filvelger gråer ut filer den ikke
        // kjenner igjen fra endelsen alene, og noen apper eksporterer .gpx med
        // text/xml. Innholdet valideres uansett av lesGpx.
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const fil = e.target.files?.[0];
          // Nullstill med én gang, ellers gir det ingenting å velge SAMME fil
          // to ganger på rad (change fyrer ikke når verdien er uendret).
          e.target.value = '';
          if (fil) void velgFil(fil);
        }}
      />

      {åpent ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gpx-import-tittel"
          className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={steg === 'sender' ? undefined : lukk}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="gpx-import-tittel" className="font-serif text-lg font-semibold text-forest-900">
                {steg === 'ferdig' ? t('gpxImportDone', { count: resultat?.importert ?? 0 }) : t('gpxImportHeading')}
              </h2>
              {steg === 'sender' ? null : (
                <button type="button" aria-label={t('gpxModalClose')} onClick={lukk}>
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              )}
            </div>

            <p className="mt-0.5 text-xs text-gray-500">{t('gpxImportFrom', { filnavn })}</p>

            {steg === 'ferdig' ? (
              <div className="mt-3 space-y-3">
                {resultat?.hoppetOver ? (
                  <p className="text-sm text-gray-700">
                    {t('gpxImportDuplicates', { count: resultat.hoppetOver, meter: DUPLIKAT_METER })}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {resultat?.batchId ? (
                    <button
                      type="button"
                      onClick={() => void angre()}
                      disabled={angrer}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {angrer ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      {t('gpxImportUndo')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={lukk}
                    className="rounded-lg bg-forest-800 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-700"
                  >
                    {t('gpxModalClose')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm font-semibold text-forest-900">
                  {t('gpxImportCount', { count: nye.length })}
                </p>

                {/* Alt som IKKE blir med, sagt høyt. Stille avkorting av en fil
                    brukeren tror er komplett, leses som datatap. */}
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  {duplikater > 0 ? <li>{t('gpxImportDuplicates', { count: duplikater, meter: DUPLIKAT_METER })}</li> : null}
                  {ugyldige > 0 ? <li>{t('gpxImportInvalid', { count: ugyldige })}</li> : null}
                  {avkortet > 0 ? <li>{t('gpxImportTruncated', { maks: MAKS_VEIPUNKTER })}</li> : null}
                  {sporpunkter > 0 ? <li>{t('gpxImportTrackPoints', { count: sporpunkter })}</li> : null}
                  <li>{t('gpxImportCapacity', { plass })}</li>
                </ul>

                {nye.length > 0 ? (
                  <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                    <ul className="space-y-0.5 text-xs text-gray-800">
                      {nye.slice(0, 50).map((punkt, i) => (
                        <li key={`${punkt.latitude}-${punkt.longitude}-${i}`} className="truncate">
                          📍 {punkt.name}
                        </li>
                      ))}
                    </ul>
                    {nye.length > 50 ? (
                      <p className="mt-1 text-[11px] text-gray-500">{t('gpxImportMore', { count: nye.length - 50 })}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{t('gpxImportNothingNew')}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void importer()}
                    disabled={steg === 'sender' || nye.length === 0 || nye.length > plass}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-800 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-60"
                  >
                    {steg === 'sender' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {t('gpxImportConfirm', { count: nye.length })}
                  </button>
                  <button
                    type="button"
                    onClick={lukk}
                    disabled={steg === 'sender'}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {t('gpxImportCancel')}
                  </button>
                </div>

                {nye.length > plass ? (
                  <p className="mt-2 text-xs font-medium text-amber-800">{t('gpxImportNoRoom', { maks })}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
