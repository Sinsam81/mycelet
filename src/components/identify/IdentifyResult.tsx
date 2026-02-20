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

          <div className="mt-2">
            <EdibilityBadge edibility={normalizeEdibility(suggestion.edibility)} />
          </div>

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
