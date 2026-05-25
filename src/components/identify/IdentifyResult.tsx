'use client';

import Link from 'next/link';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { IdentifySuggestion } from '@/types/identify';

interface IdentifyResultProps {
  suggestions: IdentifySuggestion[];
}

function normalizeEdibility(edibility: string): 'edible' | 'conditionally_edible' | 'inedible' | 'toxic' | 'deadly' {
  if (edibility === 'edible') return 'edible';
  if (edibility === 'conditionally_edible') return 'conditionally_edible';
  if (edibility === 'inedible') return 'inedible';
  if (edibility === 'toxic') return 'toxic';
  if (edibility === 'deadly') return 'deadly';
  return 'inedible';
}

export function IdentifyResult({ suggestions }: IdentifyResultProps) {
  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => (
        <article key={suggestion.name} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900">{suggestion.norwegianName ?? suggestion.commonNames?.[0] ?? suggestion.name}</h3>
              <p className="text-sm italic text-gray-600">{suggestion.name}</p>
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
            <Link href={`/species/${suggestion.speciesId}`} className="mt-2 inline-flex text-sm font-medium text-forest-800 hover:underline">
              Se artside
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}
