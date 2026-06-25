'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { SpeciesCard } from '@/components/species/SpeciesCard';
import { SpeciesSearch } from '@/components/species/SpeciesSearch';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useSpecies } from '@/lib/hooks/useSpecies';
import type { Edibility } from '@/types/species';

export default function SpeciesPage() {
  const t = useTranslations('Species');
  const EDIBILITY_OPTIONS: Array<{ label: string; value: 'all' | Edibility }> = [
    { label: t('edibilityAll'), value: 'all' },
    { label: t('edibilityEdible'), value: 'edible' },
    { label: t('edibilityToxic'), value: 'toxic' },
    { label: t('edibilityDeadly'), value: 'deadly' }
  ];
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

  const count = data?.length ?? 0;

  return (
    <PageWrapper wide>
      <section className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-forest-700">{t('eyebrow')}</p>
          <h1 className="font-serif text-3xl font-bold text-forest-900">{t('title')}</h1>
          {!isLoading && count > 0 ? (
            <p className="text-sm text-gray-700">{t('countSummary', { count })}</p>
          ) : null}
        </header>

        <SpeciesSearch value={query} onChange={setQuery} />

        <div className="grid gap-3 rounded-xl bg-white p-3 shadow-sm sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-800">
            {t('edibilityLabel')}
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
            {t('habitatLabel')}
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder={t('habitatPlaceholder')}
              value={habitat}
              onChange={(event) => setHabitat(event.target.value)}
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={inSeasonNow} onChange={(event) => setInSeasonNow(event.target.checked)} />
            {t('inSeasonOnly')}
          </label>
        </div>

        {isLoading ? <p className="text-sm text-gray-700">{t('loading')}</p> : null}
        {error ? <p className="text-sm text-red-600">{t('loadError')}</p> : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(data ?? []).map((species) => (
            <SpeciesCard key={species.id} species={species} imageUrl={species.primary_image_url} />
          ))}
        </div>

        {!isLoading && count === 0 ? (
          <p className="text-sm text-gray-700">{t('noMatches')}</p>
        ) : null}
      </section>
    </PageWrapper>
  );
}
