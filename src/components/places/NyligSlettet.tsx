'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Loader2, Undo2 } from 'lucide-react';
import { gjenopprettFunn, utdatertGrunn } from '@/lib/findings/funn-kall';

/**
 * «Nylig slettet» nederst på Mine steder.
 *
 * Et slettet funn ligger i 30 dager før det ryddes (migrasjon 056), og
 * personvernerklæringen lover at det kan angres i den tida. Men den eneste
 * veien tilbake var angreknappen i kartets slettevarsel, som står i ti
 * sekunder. Oppdaget du feilklikket etter tjue, fantes funnet fortsatt — og du
 * kunne ikke nå det uten å skrive til support.
 *
 * Lista er hele angrefristen gjort synlig. Dagene som står igjen er regnet på
 * serveren av samme konstant som ryddejobben bruker (PURGE_AFTER_DAYS), så
 * lista og jobben kan ikke love hver sin frist.
 */

export interface SlettetFunn {
  id: string;
  artsnavn: string;
  /** Stedsnavnet brukeren ga funnet, når det finnes. */
  sted: string | null;
  /** Funndatoen, ferdig formatert på serveren. */
  funnetTekst: string;
  /** deleted_at. Skiller denne slettingen fra en senere sletting av samme funn. */
  slettetTid: string;
  dagerIgjen: number;
}

/**
 * Én SLETTING, ikke ett funn. Gjenopprettes et funn og slettes igjen, er det en
 * ny rad i lista — og den skal ikke være skjult fordi den forrige ble hentet
 * tilbake.
 */
const sletting = (f: SlettetFunn) => `${f.id}:${f.slettetTid}`;

export function NyligSlettet({
  funn,
  angrefristDager,
  avkortet = false
}: {
  funn: SlettetFunn[];
  angrefristDager: number;
  /** Sann når det finnes flere slettede funn enn siden hentet. */
  avkortet?: boolean;
}) {
  const t = useTranslations('MineSteder');
  // Samme kvittering som kartets angreknapp gir.
  const tKart = useTranslations('MushroomMap');
  const router = useRouter();
  const tittelId = useId();
  const [gjenoppretter, setGjenoppretter] = useState<string | null>(null);
  // Fjernet fra lista når serveren har bekreftet gjenopprettingen, til
  // router.refresh() har hentet siden på nytt.
  const [tilbake, setTilbake] = useState<ReadonlySet<string>>(new Set());

  const synlige = funn.filter((f) => !tilbake.has(sletting(f)));
  if (synlige.length === 0) return null;

  const gjenopprett = async (f: SlettetFunn) => {
    setGjenoppretter(f.id);
    try {
      await gjenopprettFunn(f.id, tKart('findingRestoreFailed'));
      setTilbake((forrige) => new Set(forrige).add(sletting(f)));
      toast.success(tKart('findingRestored'));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tKart('findingRestoreFailed'));
      // Finnes ikke lenger som slettet: gjenopprettet et annet sted, eller
      // ryddet for godt. Hent lista på nytt, så raden ikke blir stående og lyve.
      if (utdatertGrunn(error)) router.refresh();
    } finally {
      setGjenoppretter(null);
    }
  };

  return (
    <section aria-labelledby={tittelId} className="rounded-2xl bg-white p-4 shadow-card">
      <h2 id={tittelId} className="font-serif text-lg font-semibold text-forest-900">
        {t('recentlyDeletedHeading')}
      </h2>
      <p className="mt-1 text-sm text-gray-700">{t('recentlyDeletedIntro', { days: angrefristDager })}</p>
      <ul className="mt-3 divide-y divide-gray-100">
        {synlige.map((f, i) => (
          <li key={sletting(f)} className="flex items-center justify-between gap-3 py-2">
            {/* Alle knappene heter «Gjenopprett». Med id-en leser en
                skjermleser hvilket funn hver av dem gjelder. */}
            <div id={`${tittelId}-${i}`} className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{f.artsnavn}</p>
              <p className="truncate text-xs text-gray-600">
                {f.sted ? `${f.sted} · ` : ''}
                {t('recentlyDeletedFound', { date: f.funnetTekst })}
              </p>
              <p className="text-xs text-amber-800">{t('recentlyDeletedDaysLeft', { days: f.dagerIgjen })}</p>
            </div>
            <button
              type="button"
              aria-describedby={`${tittelId}-${i}`}
              onClick={() => void gjenopprett(f)}
              // Én om gangen: to samtidige ville kjempet om samme oppfrisking.
              disabled={gjenoppretter !== null}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-forest-300 bg-white px-3 text-xs font-semibold text-forest-900 hover:bg-forest-50 disabled:opacity-60"
            >
              {gjenoppretter === f.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
              )}
              {gjenoppretter === f.id ? t('restoring') : t('restore')}
            </button>
          </li>
        ))}
      </ul>
      {/* En liste som er kortet ned, skal si det — ellers ser de eldste
          slettingene ut som om de alt er ryddet for godt. */}
      {avkortet ? (
        <p className="mt-2 text-xs text-gray-600">{t('recentlyDeletedTruncated', { count: synlige.length })}</p>
      ) : null}
    </section>
  );
}
