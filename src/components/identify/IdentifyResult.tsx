'use client';

import Link from 'next/link';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { IdentifySuggestion } from '@/types/identify';

interface IdentifyResultProps {
  suggestions: IdentifySuggestion[];
  /** When provided, suggestions become selectable (radio-style) for confirming the find. */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

function normalizeEdibility(edibility: string): 'edible' | 'conditionally_edible' | 'inedible' | 'toxic' | 'deadly' {
  if (edibility === 'edible') return 'edible';
  if (edibility === 'conditionally_edible') return 'conditionally_edible';
  if (edibility === 'inedible') return 'inedible';
  if (edibility === 'toxic') return 'toxic';
  if (edibility === 'deadly') return 'deadly';
  return 'inedible';
}

export function IdentifyResult({ suggestions, selectedIndex, onSelect }: IdentifyResultProps) {
  const selectable = typeof onSelect === 'function';

  return (
    <div className="space-y-2">
      {suggestions.map((suggestion, index) => {
        const isSelected = selectable && index === selectedIndex;
        return (
          <article
            key={suggestion.name}
            onClick={selectable ? () => onSelect?.(index) : undefined}
            className={`rounded-2xl border bg-white p-3 shadow-card transition ${selectable ? 'cursor-pointer hover:border-forest-300' : ''} ${
              isSelected ? 'border-forest-700 ring-2 ring-forest-200' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {selectable ? (
                  <span
                    aria-hidden
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                      isSelected ? 'border-forest-700 bg-forest-700' : 'border-gray-300'
                    }`}
                  />
                ) : null}
                <div>
                  <h3 className="font-serif text-base font-bold text-forest-900">
                    {suggestion.norwegianName ?? suggestion.commonNames?.[0] ?? suggestion.name}
                  </h3>
                  <p className="text-sm italic text-gray-600">{suggestion.name}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-forest-800">{suggestion.probability}%</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EdibilityBadge edibility={normalizeEdibility(suggestion.edibility)} />
              {suggestion.inSeason === true ? (
                <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-900">
                  {suggestion.peakSeason ? 'Topp-sesong nå' : 'I sesong nå'}
                </span>
              ) : suggestion.inSeason === false ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  Utenom sesong
                </span>
              ) : null}
              {suggestion.nearbyFindings && suggestion.nearbyFindings > 0 ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {suggestion.nearbyFindings} funn i nærheten
                </span>
              ) : null}
            </div>

            {suggestion.dangerousLookAlikes && suggestion.dangerousLookAlikes.length > 0 ? (
              <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-900">
                ⚠️ Kan forveksles med {suggestion.dangerousLookAlikes.map((d) => d.name).join(', ')} — sjekk nøye før du spiser.
              </p>
            ) : null}

            {suggestion.speciesId ? (
              <Link
                href={`/species/${suggestion.speciesId}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-flex text-sm font-medium text-forest-800 hover:underline"
              >
                Se artside
              </Link>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
