'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { colorForScore } from '@/lib/utils/condition-colors';

/**
 * «Hvor i landet er det best i dag?»
 *
 * DETTE ER DEN ENE ROMLIGE SAMMENLIGNINGEN MODELLEN BÆRER — og den brukeren
 * aldri fikk se, fordi kartet bare viser ett utsnitt om gangen.
 *
 * Målt 2026-08-04: spennet MELLOM regioner er 47 poeng (Bergen 81, Oslo 34),
 * mot median 7 poeng INNE i ett kartutsnitt. Sju ganger større. Kartet kan ikke
 * rangere skogholt mot skogholt (romlig AUC ~0,52), men landsdel mot landsdel er
 * en helt annen og mye grovere påstand — og den handler om FORHOLD (vær, sesong,
 * fukt), ikke om at vi vet hvor soppen står.
 *
 * En som står i Oslo skal få vite at Vestlandet ligger 47 poeng over, selv om
 * det er fem timer å kjøre. Det er brukerens valg om det er verdt turen; vår
 * jobb er å ikke skjule at forskjellen finnes.
 */

interface RegionRad {
  name: string;
  country: 'NO' | 'SE' | null;
  score: number;
  leadingSpecies: string | null;
  verdict: string;
  lat: number;
  lng: number;
}

const FLAGG: Record<string, string> = { NO: '🇳🇴', SE: '🇸🇪' };

export function BestRegionsCard() {
  const t = useTranslations('Home');
  const [regions, setRegions] = useState<RegionRad[] | null>(null);
  const [utvidet, setUtvidet] = useState(false);
  const [feilet, setFeilet] = useState(false);

  useEffect(() => {
    let avbrutt = false;
    fetch('/api/prediction/regions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!avbrutt) setRegions(Array.isArray(d.regions) ? d.regions : []);
      })
      .catch(() => {
        // Kortet forsvinner helt hvis kallet feiler. En tom ramme med en
        // feilmelding på forsiden er verre enn ingen ramme.
        if (!avbrutt) setFeilet(true);
      });
    return () => {
      avbrutt = true;
    };
  }, []);

  if (feilet || (regions && regions.length === 0)) return null;

  const vist = regions ? (utvidet ? regions : regions.slice(0, 5)) : [];

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{t('bestRegionsTitle')}</h2>
      <p className="mt-0.5 text-xs text-gray-500">{t('bestRegionsSubtitle')}</p>

      {!regions ? (
        <div className="mt-3 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {vist.map((r, i) => (
            <li key={r.name}>
              <Link
                href={`/map?lat=${r.lat}&lng=${r.lng}&zoom=10`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-forest-50"
              >
                <span className="w-4 shrink-0 text-xs font-semibold text-gray-400">{i + 1}</span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForScore(r.score).hex }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {r.country ? `${FLAGG[r.country]} ` : ''}
                    {r.name}
                  </span>
                  {/* Dommen, ikke bare tallet — «34» alene sier ingenting. */}
                  <span className="block truncate text-xs text-gray-500">{r.verdict}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">{r.score}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {regions && regions.length > 5 ? (
        <button
          type="button"
          onClick={() => setUtvidet((v) => !v)}
          className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-forest-800 transition hover:bg-forest-50"
        >
          {utvidet ? t('bestRegionsCollapse') : t('bestRegionsExpand', { count: regions.length - 5 })}
        </button>
      ) : null}

      {/* Forbeholdet hører i detaljen, ikke i overskriften — men det skal stå. */}
      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{t('bestRegionsDisclaimer')}</p>
    </article>
  );
}
