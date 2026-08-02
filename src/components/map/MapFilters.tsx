'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { PlaceResult, searchPlaces } from '@/lib/utils/place-search';

export interface MapFilterState {
  speciesId: number | null;
  period: 'month' | '3months' | 'year' | 'all';
  onlyMine: boolean;
}

interface SpeciesOption {
  id: number;
  norwegian_name: string;
  swedish_name: string | null;
  latin_name: string;
}

interface MapFiltersProps {
  filters: MapFilterState;
  onChange: (next: MapFilterState) => void;
  onSelectPlace: (lat: number, lng: number) => void;
}

export function MapFilters({ filters, onChange, onSelectPlace }: MapFiltersProps) {
  const t = useTranslations('MapFilters');
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SpeciesOption[]>([]);
  const [open, setOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  // Skiller «har ikke søkt ennå» fra «søkte, fant ingenting». Uten den ble et
  // tomt svar helt stille, og et stille søkefelt leses som at appen henger.
  const [placeSearched, setPlaceSearched] = useState(false);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCount = Number(Boolean(filters.speciesId)) + Number(filters.period !== 'all') + Number(filters.onlyMine);

  const searchSpecies = async (value: string) => {
    setQuery(value);

    if (value.trim().length < 2) {
      setOptions([]);
      return;
    }

    const { data } = await supabase
      .from('mushroom_species')
      .select('id,norwegian_name,swedish_name,latin_name')
      .or(
        `norwegian_name.ilike.%${value}%,swedish_name.ilike.%${value}%,latin_name.ilike.%${value}%,synonyms_text.ilike.%${value}%`
      )
      .order('norwegian_name', { ascending: true })
      .limit(10);

    setOptions(data ?? []);
  };

  // Uses the shared Nordic place search (via our /api/places proxy) — this
  // field used to call Kartverket directly, which answered Swedish queries
  // with wrong Norwegian places. Debounced so we don't fire per keystroke.
  const searchPlace = (value: string) => {
    setPlaceQuery(value);
    if (placeTimer.current) clearTimeout(placeTimer.current);
    setPlaceSearched(false);
    if (value.trim().length < 2) {
      setPlaceResults([]);
      return;
    }
    placeTimer.current = setTimeout(async () => {
      setPlaceResults(await searchPlaces(value));
      setPlaceSearched(true);
    }, 300);
  };

  // Collapsed: a small chip so the map stays the hero. Tap to reveal filters.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('title')}
        className="absolute left-3 top-3 z-[1000] inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full bg-white/95 p-0 text-sm font-medium text-gray-800 shadow-lg backdrop-blur hover:bg-white sm:w-auto sm:justify-start sm:px-3"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">{t('title')}</span>
        {activeCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-forest-100 px-1 text-center text-[10px] font-semibold text-forest-900 sm:static sm:px-1.5 sm:text-xs">{activeCount}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-[1100] max-h-[calc(100%-1.5rem)] space-y-2 overflow-y-auto overscroll-contain rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur sm:bottom-auto sm:left-3 sm:right-auto sm:top-3 sm:w-80">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{t('title')}</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-forest-100 px-2 py-1 text-xs font-medium text-forest-900">{t('activeCount', { count: activeCount })}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('closeFilters')}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-700">{t('searchPlace')}</label>
        <input
          value={placeQuery}
          onChange={(event) => searchPlace(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          placeholder={t('searchPlacePlaceholder')}
        />
        {placeResults.length > 0 ? (
          <div className="max-h-36 overflow-auto rounded-lg border border-gray-200">
            {placeResults.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onSelectPlace(p.lat, p.lng);
                  setPlaceResults([]);
                  setPlaceQuery(p.name);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start px-2 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                <span>{p.name}</span>
                {p.context ? <span className="text-xs text-gray-500">{p.context}</span> : null}
              </button>
            ))}
          </div>
        ) : placeSearched && placeQuery.trim().length >= 2 ? (
          <p className="text-xs text-gray-600">{t('noPlaceResults')}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-700">{t('speciesSearch')}</label>
        <input
          value={query}
          onChange={(event) => searchSpecies(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          placeholder={t('speciesSearchPlaceholder')}
        />

        {options.length > 0 ? (
          <div className="max-h-36 overflow-auto rounded-lg border border-gray-200">
            {options.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange({ ...filters, speciesId: item.id })}
                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                <span>{getSpeciesDisplayName(item, locale)}</span>
                <span className="text-xs text-gray-500 italic">{item.latin_name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {filters.speciesId ? (
          <button
            type="button"
            onClick={() => onChange({ ...filters, speciesId: null })}
            className="text-xs font-medium text-forest-800"
          >
            {t('resetSpecies')}
          </button>
        ) : null}
      </div>

      <label className="block text-xs font-medium text-gray-700">
        {t('period')}
        <select
          value={filters.period}
          onChange={(event) => onChange({ ...filters, period: event.target.value as MapFilterState['period'] })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="month">{t('periodMonth')}</option>
          <option value="3months">{t('periodThreeMonths')}</option>
          <option value="year">{t('periodYear')}</option>
          <option value="all">{t('periodAll')}</option>
        </select>
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={filters.onlyMine}
          onChange={(event) => onChange({ ...filters, onlyMine: event.target.checked })}
        />
        {t('onlyMine')}
      </label>
    </div>
  );
}
