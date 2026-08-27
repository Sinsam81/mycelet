'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { regionBandHex } from '@/lib/prediction/region-score';

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
 *
 * ETT LAND OM GANGEN. Lista blandet først norske og svenske regioner, og da
 * druknet den lokale rangeringen: 2026-08-04 lå fire av de fem øverste i Norge,
 * så en svensk bruker måtte lete nedover for å finne noe hen kunne kjøre til.
 * «Best i landet» skal bety brukerens eget land.
 *
 * Standardvalget følger SPRÅKET, som er det appen allerede bruker til å avgjøre
 * hvor brukeren hører hjemme (MYCELET_LOCALE → Accept-Language → nb). Men språk
 * er ikke posisjon — en nordmann kan stå i Värmland — så bryteren er der, og
 * valget huskes ikke lenger enn økta. Vi gjetter, vi låser ikke.
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
  const locale = useLocale();
  const [regions, setRegions] = useState<RegionRad[] | null>(null);
  const [land, setLand] = useState<'NO' | 'SE'>(locale === 'sv' ? 'SE' : 'NO');
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

  // Land som faktisk har regioner i rasteret. Uten dette ville bryteren tilbudt
  // et land der lista er tom — verre enn å ikke tilby valget.
  const tilgjengeligeLand = useMemo(
    () => (['NO', 'SE'] as const).filter((l) => (regions ?? []).some((r) => r.country === l)),
    [regions]
  );
  const iLandet = useMemo(
    () => (regions ?? []).filter((r) => r.country === land),
    [regions, land]
  );

  if (feilet || (regions && regions.length === 0)) return null;

  const vist = regions ? (utvidet ? iLandet : iLandet.slice(0, 5)) : [];

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{t('bestRegionsTitle')}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t('bestRegionsSubtitle')}</p>
        </div>
        {tilgjengeligeLand.length > 1 ? (
          <div className="flex shrink-0 gap-1 rounded-full bg-gray-100 p-0.5" role="group">
            {tilgjengeligeLand.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLand(l);
                  setUtvidet(false);
                }}
                aria-pressed={land === l}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  land === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {FLAGG[l]} {t(l === 'NO' ? 'bestRegionsNorway' : 'bestRegionsSweden')}
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
                // Navnet er ikke pynt: det gir kartet en værstripe med en
                // nullstillingsknapp, som er den eneste veien ut av utsnittet.
                href={`/map?lat=${r.lat}&lng=${r.lng}&zoom=10&sted=${encodeURIComponent(r.name)}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-forest-50"
              >
                <span className="w-4 shrink-0 text-xs font-semibold text-gray-400">{i + 1}</span>
                {/* Regionstigen, ikke rutestigen. Prikken kom tidligere fra
                    colorForScore, som er kalibrert på ENKELTRUTER — derfor
                    lyste et områdetall på 79 grønt ved siden av en dom som
                    egentlig sa «gode dager». Farge og dom leser nå samme
                    stige, som er hele poenget med å ha én. */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: regionBandHex(r.score) }}
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

      {regions && iLandet.length > 5 ? (
        <button
          type="button"
          onClick={() => setUtvidet((v) => !v)}
          className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-forest-800 transition hover:bg-forest-50"
        >
          {utvidet ? t('bestRegionsCollapse') : t('bestRegionsExpand', { count: iLandet.length - 5 })}
        </button>
      ) : null}

      {/* Veien videre. Uten disse to var /soppforhold UTILGJENGELIG inne fra
          appen — ingen lenke fra forsiden, ingen fra navigasjonen — og
          soppvarselets eneste påmeldingsknapp ligger nettopp der. Trakten
          «se at det er bra et sted → få beskjed neste gang» var brutt for
          alle som ikke kom inn utenfra. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/soppforhold" className="text-xs font-medium text-forest-800 hover:underline">
          {t('bestRegionsAllAreas')} →
        </Link>
        <Link href="/profile?vis=soppvarsel" className="text-xs font-medium text-forest-800 hover:underline">
          {t('bestRegionsAlert')} →
        </Link>
      </div>

      {/* Forbeholdet hører i detaljen, ikke i overskriften — men det skal stå. */}
      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{t('bestRegionsDisclaimer')}</p>
    </article>
  );
}
