'use client';

import { useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface MapFilterState {
  speciesId: number | null;
  period: 'month' | '3months' | 'year' | 'all';
  onlyMine: boolean;
}

interface SpeciesOption {
  id: number;
  norwegian_name: string;
  latin_name: string;
}

interface MapFiltersProps {
  filters: MapFilterState;
  onChange: (next: MapFilterState) => void;
}

export function MapFilters({ filters, onChange }: MapFiltersProps) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SpeciesOption[]>([]);
  const [open, setOpen] = useState(false);

  const activeCount = Number(Boolean(filters.speciesId)) + Number(filters.period !== 'all') + Number(filters.onlyMine);

  const searchSpecies = async (value: string) => {
    setQuery(value);

    if (value.trim().length < 2) {
      setOptions([]);
      return;
    }

    const { data } = await supabase
      .from('mushroom_species')
      .select('id,norwegian_name,latin_name')
      .or(`norwegian_name.ilike.%${value}%,latin_name.ilike.%${value}%`)
      .order('norwegian_name', { ascending: true })
      .limit(10);

    setOptions(data ?? []);
  };

  // Collapsed: a small chip so the map stays the hero. Tap to reveal filters.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 z-[1000] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-gray-800 shadow-lg backdrop-blur hover:bg-white"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtre
        {activeCount > 0 ? (
          <span className="rounded-full bg-forest-100 px-1.5 text-xs font-semibold text-forest-900">{activeCount}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="absolute left-3 right-3 top-3 z-[1000] space-y-2 rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Filtre</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-forest-100 px-2 py-1 text-xs font-medium text-forest-900">{activeCount} aktive</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Lukk filtre"
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-700">Art (søk)</label>
        <input
          value={query}
          onChange={(event) => searchSpecies(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Kantarell"
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
                <span>{item.norwegian_name}</span>
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
            Nullstill art
          </button>
        ) : null}
      </div>

      <label className="block text-xs font-medium text-gray-700">
        Periode
        <select
          value={filters.period}
          onChange={(event) => onChange({ ...filters, period: event.target.value as MapFilterState['period'] })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="month">Denne måneden</option>
          <option value="3months">Siste 3 mnd</option>
          <option value="year">I år</option>
          <option value="all">Alle</option>
        </select>
      </label>

      <label className="inline-flex items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={filters.onlyMine}
          onChange={(event) => onChange({ ...filters, onlyMine: event.target.checked })}
        />
        Kun mine funn
      </label>
    </div>
  );
}
