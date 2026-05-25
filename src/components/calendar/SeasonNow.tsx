'use client';

import Link from 'next/link';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { useGeolocation } from '@/lib/hooks/useGeolocation';
import { seasonShiftDays, isInSeasonOn, shiftLabel } from '@/lib/utils/season-region';
import type { Edibility } from '@/types/species';

export interface CalendarSpecies {
  id: number;
  norwegian_name: string;
  latin_name: string;
  edibility: Edibility;
  season_start: number;
  season_end: number;
  peak_season_start: number | null;
  peak_season_end: number | null;
  primary_image_url: string | null;
}

const MONTH_NAMES = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember'
];

function SpeciesRowLink({ s, peak }: { s: CalendarSpecies; peak?: boolean }) {
  return (
    <Link
      href={`/species/${s.id}`}
      className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 hover:border-forest-700"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
        {s.primary_image_url ? (
          <img src={s.primary_image_url} alt={s.norwegian_name} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">{s.norwegian_name}</p>
        <p className="truncate text-xs italic text-gray-600">{s.latin_name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <EdibilityBadge edibility={s.edibility} />
          {peak ? (
            <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-semibold text-forest-900">Topp-sesong</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function SeasonNow({ species }: { species: CalendarSpecies[] }) {
  const { latitude } = useGeolocation();
  const shift = seasonShiftDays(latitude);
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const label = shiftLabel(shift);

  const inSeason = species.filter((s) => isInSeasonOn(now, s.season_start, s.season_end, shift));
  const comingSoon = species.filter(
    (s) =>
      !isInSeasonOn(now, s.season_start, s.season_end, shift) &&
      isInSeasonOn(soon, s.season_start, s.season_end, shift)
  );

  return (
    <>
      <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">I sesong nå ({MONTH_NAMES[now.getMonth()]})</h2>
          {label ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              📍 Tilpasset din posisjon — {label}
            </span>
          ) : null}
        </div>
        {inSeason.length === 0 ? (
          <p className="text-sm text-gray-700">Ingen av de registrerte artene er i sesong akkurat nå{label ? ' for ditt område' : ''}.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {inSeason.map((s) => (
              <li key={s.id}>
                <SpeciesRowLink
                  s={s}
                  peak={
                    s.peak_season_start !== null &&
                    s.peak_season_end !== null &&
                    isInSeasonOn(now, s.peak_season_start, s.peak_season_end, shift)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </article>

      {comingSoon.length > 0 ? (
        <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Kommer snart</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {comingSoon.map((s) => (
              <li key={s.id}>
                <SpeciesRowLink s={s} />
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </>
  );
}
