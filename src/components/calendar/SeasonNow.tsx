'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { seasonShiftDays, isInSeasonOn, shiftLabel } from '@/lib/utils/season-region';
import type { Edibility } from '@/types/species';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';

export interface CalendarSpecies {
  id: number;
  norwegian_name: string;
  swedish_name: string | null;
  latin_name: string;
  edibility: Edibility;
  season_start: number;
  season_end: number;
  peak_season_start: number | null;
  peak_season_end: number | null;
  primary_image_url: string | null;
}

const MONTH_KEYS = [
  'monthJanuary', 'monthFebruary', 'monthMarch', 'monthApril', 'monthMay', 'monthJune',
  'monthJuly', 'monthAugust', 'monthSeptember', 'monthOctober', 'monthNovember', 'monthDecember'
] as const;

function SpeciesRowLink({ s, peak }: { s: CalendarSpecies; peak?: boolean }) {
  const t = useTranslations('SeasonNow');
  const locale = useLocale();
  const displayName = getSpeciesDisplayName(s, locale);
  return (
    <Link
      href={`/species/${s.id}`}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-card transition hover:-translate-y-0.5 hover:border-forest-300 hover:shadow-lg"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {s.primary_image_url ? (
          <img src={s.primary_image_url} alt={displayName} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-base font-bold text-forest-900">{displayName}</p>
        <p className="truncate text-xs italic text-gray-600">{s.latin_name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <EdibilityBadge edibility={s.edibility} />
          {peak ? (
            <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-semibold text-forest-900">{t('peakSeason')}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function SeasonNow({ species }: { species: CalendarSpecies[] }) {
  const t = useTranslations('SeasonNow');
  const [shift, setShift] = useState(0);
  const [personalized, setPersonalized] = useState(false);
  const [canRequest, setCanRequest] = useState(false);

  const applyPosition = (lat: number) => {
    setShift(seasonShiftDays(lat));
    setPersonalized(true);
  };

  // Never prompt for location just to browse the calendar. Personalize silently
  // ONLY if the user has already granted geolocation; otherwise show an opt-in
  // button (mirrors the home page's MushroomDayCard). navigator.geolocation is
  // absent in the iOS WKWebView, so native simply stays on the Sør-Norge baseline.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setCanRequest(true);
    let cancelled = false;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        if (perm?.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            (pos) => { if (!cancelled) applyPosition(pos.coords.latitude); },
            () => {},
            { timeout: 6000, maximumAge: 600000 }
          );
        }
      } catch {
        // permissions API unavailable — leave the opt-in button as the only path
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const requestPosition = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => applyPosition(pos.coords.latitude),
      () => {},
      { timeout: 8000, maximumAge: 600000 }
    );
  };

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
      <article className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-bold text-forest-900">{t('inSeasonNowHeading', { month: t(MONTH_KEYS[now.getMonth()]) })}</h2>
          {personalized && label ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
              <MapPin className="h-3 w-3" /> {t('personalizedToPosition', { label })}
            </span>
          ) : canRequest ? (
            <button
              type="button"
              onClick={requestPosition}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-700 transition hover:border-forest-400 hover:text-forest-800"
            >
              <MapPin className="h-3 w-3" /> {t('adaptToPosition')}
            </button>
          ) : null}
        </div>
        {inSeason.length === 0 ? (
          <p className="text-sm text-gray-700">
            {personalized ? t('noneInSeasonForArea') : t('noneInSeason')}
          </p>
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
        <article className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
          <h2 className="font-serif text-xl font-bold text-forest-900">{t('comingSoon')}</h2>
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
