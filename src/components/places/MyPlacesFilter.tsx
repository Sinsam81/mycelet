'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Søk og sortering over «Mine steder».
 *
 * Lista var sortert på siste besøk og ellers uten inngang. Det holder for fem
 * steder. Med tjue eller femti — som er der en aktiv plukker havner etter én
 * sesong — er den eneste måten å finne igjen et sted på å scrolle og lete etter
 * et navn man kanskje ikke husker.
 *
 * Søket treffer BÅDE stedsnavnet og artene på stedet, fordi det er de to
 * måtene folk husker et sted på: «det ved Sørkedalen» eller «der jeg fant
 * traktkantarell». Uten artstreff ville man måtte huske navnet man selv ga det.
 *
 * Sorteringen har to valg og ikke flere: siste besøk (hva skjedde nylig) og
 * flest funn (hvilke steder som faktisk leverer). Et tredje valg ville krevd
 * posisjon, og siden lista er en serverside-render har vi ikke den her.
 *
 * Komponenten eier BARE filtreringen. Selve kortene sendes inn ferdig rendret
 * fra serversiden, så all datahenting og RLS blir liggende der den var.
 */

export interface PlaceForFilter {
  key: string;
  label: string;
  species: string[];
  count: number;
  lastVisit: string;
}

export function MyPlacesFilter({
  places,
  children
}: {
  places: PlaceForFilter[];
  /** Kortene, i samme rekkefølge som `places`. */
  children: React.ReactNode[];
}) {
  const t = useTranslations('MineSteder');
  const [sok, setSok] = useState('');
  const [sortering, setSortering] = useState<'sist' | 'flest'>('sist');

  const synlige = useMemo(() => {
    const q = sok.trim().toLowerCase();
    const treff = places
      .map((p, i) => ({ p, i }))
      .filter(({ p }) =>
        !q ||
        p.label.toLowerCase().includes(q) ||
        p.species.some((s) => s.toLowerCase().includes(q))
      );
    treff.sort((a, b) =>
      sortering === 'flest'
        ? b.p.count - a.p.count || b.p.lastVisit.localeCompare(a.p.lastVisit)
        : b.p.lastVisit.localeCompare(a.p.lastVisit)
    );
    return treff;
  }, [places, sok, sortering]);

  // Under fem steder er søk og sortering bare støy — da ser man hele lista.
  if (places.length < 5) return <ul className="space-y-3">{children}</ul>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={sok}
            onChange={(e) => setSok(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-full border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <div className="flex shrink-0 gap-1 rounded-full bg-gray-100 p-0.5">
          {(['sist', 'flest'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSortering(v)}
              aria-pressed={sortering === v}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                sortering === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t(v === 'sist' ? 'sortRecent' : 'sortMostFinds')}
            </button>
          ))}
        </div>
      </div>

      {synlige.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-gray-600">{t('noSearchHits', { query: sok })}</p>
      ) : (
        <>
          {sok.trim() ? (
            <p className="text-xs text-gray-500">{t('searchHits', { count: synlige.length, total: places.length })}</p>
          ) : null}
          <ul className="space-y-3">{synlige.map(({ i }) => children[i])}</ul>
        </>
      )}
    </div>
  );
}
