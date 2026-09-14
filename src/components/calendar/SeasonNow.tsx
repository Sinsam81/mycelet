'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import {
  isMonthInMask,
  latitudeBand,
  nextMonth,
  peakMask,
  seasonMask,
  type LatitudeBand
} from '@/lib/utils/season-region';
import type { Edibility } from '@/types/species';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import {
  getCurrentPositionIfGranted,
  getCurrentPositionOnce,
  isGeolocationAvailable
} from '@/lib/hooks/useGeolocation';
import { lagreHusketPosisjon, lesHusketPosisjon } from '@/lib/map/husket-posisjon';

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

const BAND_KEYS: Record<LatitudeBand, 'regionSouth' | 'regionCentral' | 'regionNorth'> = {
  south: 'regionSouth',
  central: 'regionCentral',
  north: 'regionNorth'
};

export function SeasonNow({ species }: { species: CalendarSpecies[] }) {
  const t = useTranslations('SeasonNow');
  const [band, setBand] = useState<LatitudeBand | null>(null);
  const [personalized, setPersonalized] = useState(false);
  const [canRequest, setCanRequest] = useState(false);
  /** Kom båndet fra en fersk måling i denne åpningen? En husket posisjon kan være ei uke gammel. */
  const [bekreftet, setBekreftet] = useState(false);

  // Vi spør aldri om posisjon bare for å bla i kalenderen. Vi tilpasser stille
  // KUN hvis brukeren allerede har gitt tilgang (kartet er den som spør) —
  // gjennom Capacitor-laget, så det virker i skallet også: iOS-WKWebView har
  // ikke navigator.geolocation, og da sto alle app-brukere på hele-Norden-
  // vinduet uten noen knapp. En husket posisjon fra kartet (husket-posisjon.ts)
  // brukes med én gang. Den frivillige knappen står så lenge ingen fersk måling
  // fra denne åpningen har bekreftet båndet — også med husket posisjon: den kan
  // være ei uke gammel, og på Safari (ingen Permissions API) eller etter trukket
  // tilgang kommer det aldri en fersk av seg selv (samme regel som forsidekortet).
  useEffect(() => {
    let cancelled = false;
    const bruk = (lat: number, fersk: boolean) => {
      setBand(latitudeBand(lat));
      setPersonalized(true);
      setBekreftet(fersk);
    };
    const start = async () => {
      const husket = lesHusketPosisjon();
      if (husket) bruk(husket.lat, false);
      const fersk = await getCurrentPositionIfGranted();
      if (cancelled) return;
      if (fersk) {
        lagreHusketPosisjon(fersk.latitude, fersk.longitude);
        bruk(fersk.latitude, true);
      } else {
        setCanRequest(isGeolocationAvailable());
      }
    };
    void start();
    return () => { cancelled = true; };
  }, []);

  // Brukerens eget trykk — da får vi be om tillatelse, via samme lag.
  const requestPosition = async () => {
    try {
      const pos = await getCurrentPositionOnce();
      lagreHusketPosisjon(pos.latitude, pos.longitude);
      setBand(latitudeBand(pos.latitude));
      setPersonalized(true);
      setBekreftet(true);
    } catch {
      // Avslått eller utilgjengelig — knappen blir stående.
    }
  };

  const now = new Date();
  const month = now.getMonth() + 1;
  const soon = nextMonth(month);
  const label = band ? t(BAND_KEYS[band]) : '';

  // Vinduene er månedsgrove fordi datagrunnlaget er månedsgrovt — vi later ikke
  // som vi vet at sesongen starter en bestemt dag.
  const masks = new Map(species.map((s) => [s.id, seasonMask(s, band)]));
  const maskOf = (s: CalendarSpecies) => masks.get(s.id) ?? 0;
  const inSeason = species.filter((s) => isMonthInMask(maskOf(s), month));
  const comingSoon = species.filter((s) => !isMonthInMask(maskOf(s), month) && isMonthInMask(maskOf(s), soon));

  return (
    <>
      <article className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-bold text-forest-900">{t('inSeasonNowHeading', { month: t(MONTH_KEYS[now.getMonth()]) })}</h2>
          {(personalized && label) || (canRequest && !bekreftet) ? (
            <div className="flex flex-wrap items-center gap-2">
              {personalized && label ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                  <MapPin className="h-3 w-3" /> {t('personalizedToPosition', { label })}
                </span>
              ) : null}
              {/* Står ved siden av merket når båndet kom fra en husket posisjon. */}
              {canRequest && !bekreftet ? (
                <button
                  type="button"
                  onClick={() => void requestPosition()}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-700 transition hover:border-forest-400 hover:text-forest-800"
                >
                  <MapPin className="h-3 w-3" /> {t('adaptToPosition')}
                </button>
              ) : null}
            </div>
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
                <SpeciesRowLink s={s} peak={isMonthInMask(peakMask(s), month)} />
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
