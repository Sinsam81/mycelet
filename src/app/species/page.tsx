'use client';

import { useMemo, useState } from 'react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SpeciesCard } from '@/components/species/SpeciesCard';
import { SpeciesSearch } from '@/components/species/SpeciesSearch';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useSpecies } from '@/lib/hooks/useSpecies';
import type { Edibility } from '@/types/species';

const EDIBILITY_OPTIONS: Array<{ label: string; value: 'all' | Edibility }> = [
  { label: 'Alle', value: 'all' },
  { label: 'Spiselig', value: 'edible' },
  { label: 'Giftig', value: 'toxic' },
  { label: 'Dødelig', value: 'deadly' }
];

export default function SpeciesPage() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [edibility, setEdibility] = useState<'all' | Edibility>('all');
  const [inSeasonNow, setInSeasonNow] = useState(false);
  const [habitat, setHabitat] = useState('');

  const filters = useMemo(
    () => ({
      query: debouncedQuery,
      edibility,
      inSeasonNow,
      habitat
    }),
    [debouncedQuery, edibility, inSeasonNow, habitat]
  );

  const { data, isLoading, error } = useSpecies(filters);

  return (
    <PageWrapper>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Soppdatabase</h1>

        <SpeciesSearch value={query} onChange={setQuery} />

        <div className="grid gap-3 rounded-xl bg-white p-3 shadow-sm sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-800">
            Spiselighet
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={edibility}
              onChange={(event) => setEdibility(event.target.value as 'all' | Edibility)}
            >
              {EDIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-800">
            Habitat
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="f.eks. barskog"
              value={habitat}
              onChange={(event) => setHabitat(event.target.value)}
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={inSeasonNow} onChange={(event) => setInSeasonNow(event.target.checked)} />
            Kun i sesong nå
          </label>
        </div>

        {isLoading ? <p className="text-sm text-gray-700">Laster arter...</p> : null}
        {error ? <p className="text-sm text-red-600">Kunne ikke hente arter.</p> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(data ?? []).map((species) => (
            <SpeciesCard key={species.id} species={species} />
          ))}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-700">Ingen arter matcher filtrene dine.</p>
        ) : null}
      </section>
    </PageWrapper>
  );
}
