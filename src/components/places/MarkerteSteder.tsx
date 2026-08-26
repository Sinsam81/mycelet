'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useTranslations } from 'next-intl';
import { Bookmark, Check, Loader2, MapPin, Pencil, Trash2, X } from 'lucide-react';
import { MAKS_NAVN } from '@/lib/steder/veipunkt';

/**
 * «Steder du har markert» på Mine steder — radene i saved_places, med
 * omdøping og sletting.
 *
 * ── SLETTING ER IKKE PYNT HER ───────────────────────────────────────────────
 *
 * Funn kan ikke slettes i appen i dag (RLS tillater det, men ingen rute eller
 * knapp finnes). Det var det tyngste argumentet mot å importere veipunkter som
 * private funn: en feilimport på 500 punkter ville vært permanent. Stedene
 * slipper unna det bare hvis sletting finnes fra dag én — både per sted og for
 * en hel import. Se docs/gpx-import-design.md.
 *
 * Bekreftelsen er innebygd i knappen, ikke en window.confirm: appskallet er en
 * WKWebView, der systemdialoger ser ut som noe annet enn appen — og ingen andre
 * steder i Mycelet bruker dem.
 */

export interface Sted {
  id: string;
  name: string;
  note: string | null;
  latitude: number;
  longitude: number;
  source_file: string | null;
  import_batch_id: string | null;
}

export function MarkerteSteder({ steder }: { steder: Sted[] }) {
  const t = useTranslations('MineSteder');
  const router = useRouter();
  const [bekrefter, setBekrefter] = useState<string | null>(null);
  const [jobber, setJobber] = useState<string | null>(null);
  const [endrer, setEndrer] = useState<string | null>(null);
  const [nyttNavn, setNyttNavn] = useState('');
  /**
   * Serveren eier lista; dette er bare det som er endret i DENNE fanen og ennå
   * ikke kommet tilbake fra router.refresh(). Å speile props inn i state ville
   * gjort serverens svar til en cascading render — og et sted brukeren nettopp
   * slettet ville blinket tilbake i det halve sekundet refresh-en tar.
   */
  const [slettede, setSlettede] = useState<Set<string>>(() => new Set());
  const [omdøpte, setOmdøpte] = useState<Record<string, string>>({});

  const liste = useMemo(
    () =>
      steder
        .filter((sted) => !slettede.has(sted.id))
        .map((sted) => (omdøpte[sted.id] ? { ...sted, name: omdøpte[sted.id] } : sted)),
    [steder, slettede, omdøpte]
  );

  /**
   * Én rad per import, slik at en hel fil kan angres lenge etter at
   * kvitteringsvinduet er lukket.
   */
  const importer = useMemo(() => {
    const grupper = new Map<string, { filnavn: string | null; antall: number }>();
    for (const sted of liste) {
      if (!sted.import_batch_id) continue;
      const gruppe = grupper.get(sted.import_batch_id);
      if (gruppe) gruppe.antall += 1;
      else grupper.set(sted.import_batch_id, { filnavn: sted.source_file, antall: 1 });
    }
    return [...grupper.entries()];
  }, [liste]);

  const slett = async (nøkkel: string, url: string, fjern: (sted: Sted) => boolean, antall: number) => {
    setJobber(nøkkel);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(t('placesDeleteFailed'));
        return;
      }
      const fjernede = liste.filter(fjern).map((sted) => sted.id);
      setSlettede((forrige) => new Set([...forrige, ...fjernede]));
      toast.success(antall > 1 ? t('placesDeletedMany', { count: antall }) : t('placesDeleted'));
      router.refresh();
    } catch {
      toast.error(t('placesDeleteFailed'));
    } finally {
      setJobber(null);
      setBekrefter(null);
    }
  };

  const lagreNavn = async (id: string) => {
    const navn = nyttNavn.trim();
    if (!navn) return;
    setJobber(id);
    try {
      const res = await fetch('/api/me/steder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: navn })
      });
      const svar = (await res.json().catch(() => null)) as { name?: string } | null;
      if (!res.ok) {
        toast.error(t('placesRenameFailed'));
        return;
      }
      setOmdøpte((forrige) => ({ ...forrige, [id]: svar?.name ?? navn }));
      toast.success(t('placesRenamed'));
      setEndrer(null);
      router.refresh();
    } catch {
      toast.error(t('placesRenameFailed'));
    } finally {
      setJobber(null);
    }
  };

  if (liste.length === 0) return null;

  return (
    <section className="space-y-2">
      <header>
        <h2 className="flex items-center gap-1.5 font-serif text-xl font-semibold text-forest-900">
          <Bookmark className="h-4 w-4 text-indigo-700" aria-hidden />
          {t('placesHeading')}
        </h2>
        <p className="text-xs text-gray-600">
          {t('placesCount', { count: liste.length })} · {t('placesIntro')}
        </p>
      </header>

      {importer.map(([batchId, gruppe]) => {
        const nøkkel = `batch:${batchId}`;
        return (
          <div
            key={batchId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-950"
          >
            <span className="truncate">
              {gruppe.filnavn ? t('placesFromFile', { filnavn: gruppe.filnavn }) : t('placesHeading')} ·{' '}
              {t('placesCount', { count: gruppe.antall })}
            </span>
            {bekrefter === nøkkel ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[11px]">{t('placesDeleteBatchConfirm', { count: gruppe.antall })}</span>
                <button
                  type="button"
                  onClick={() =>
                    void slett(
                      nøkkel,
                      `/api/me/steder?batch=${encodeURIComponent(batchId)}`,
                      (sted) => sted.import_batch_id === batchId,
                      gruppe.antall
                    )
                  }
                  disabled={jobber === nøkkel}
                  className="inline-flex items-center gap-1 rounded-full bg-red-700 px-2 py-1 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {jobber === nøkkel ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                  {t('placesDeleteBatch', { count: gruppe.antall })}
                </button>
                <button
                  type="button"
                  onClick={() => setBekrefter(null)}
                  className="rounded-full bg-white px-2 py-1 font-medium text-gray-700"
                >
                  {t('placesRenameCancel')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setBekrefter(nøkkel)}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-red-800 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
                {t('placesDeleteBatch', { count: gruppe.antall })}
              </button>
            )}
          </div>
        );
      })}

      <ul className="space-y-2">
        {liste.map((sted) => (
          <li key={sted.id} className="rounded-2xl bg-white p-3 shadow-card">
            <div className="flex items-start justify-between gap-2">
              {endrer === sted.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    value={nyttNavn}
                    onChange={(e) => setNyttNavn(e.target.value)}
                    maxLength={MAKS_NAVN}
                    aria-label={t('placesRename')}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void lagreNavn(sted.id);
                      if (e.key === 'Escape') setEndrer(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void lagreNavn(sted.id)}
                    disabled={jobber === sted.id || !nyttNavn.trim()}
                    className="rounded-lg bg-forest-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {t('placesRenameSave')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndrer(null)}
                    aria-label={t('placesRenameCancel')}
                    className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <h3 className="flex min-w-0 items-center gap-1.5 font-serif text-base font-semibold leading-tight text-forest-950">
                  <MapPin className="h-4 w-4 shrink-0 text-indigo-700" aria-hidden />
                  <span className="truncate">{sted.name}</span>
                </h3>
              )}

              {endrer === sted.id ? null : (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEndrer(sted.id);
                      setNyttNavn(sted.name);
                    }}
                    aria-label={t('placesRename')}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBekrefter(sted.id)}
                    aria-label={t('placesDelete')}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}
            </div>

            {sted.note ? <p className="mt-1 text-sm text-gray-700">{sted.note}</p> : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
              <Link
                href={`/map?sted=${sted.latitude.toFixed(5)},${sted.longitude.toFixed(5)}`}
                className="font-semibold text-forest-800 underline"
              >
                {t('placesOpenInMap')}
              </Link>
              <span className="text-gray-500">
                {sted.latitude.toFixed(5)}, {sted.longitude.toFixed(5)}
              </span>
            </div>

            {bekrefter === sted.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-950">
                <span>{t('placesDeleteConfirm', { name: sted.name })}</span>
                <button
                  type="button"
                  onClick={() =>
                    void slett(sted.id, `/api/me/steder?id=${encodeURIComponent(sted.id)}`, (s) => s.id === sted.id, 1)
                  }
                  disabled={jobber === sted.id}
                  className="inline-flex items-center gap-1 rounded-full bg-red-700 px-2 py-1 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {jobber === sted.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
                  {t('placesDelete')}
                </button>
                <button
                  type="button"
                  onClick={() => setBekrefter(null)}
                  className="rounded-full bg-white px-2 py-1 font-medium text-gray-700"
                >
                  {t('placesRenameCancel')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
