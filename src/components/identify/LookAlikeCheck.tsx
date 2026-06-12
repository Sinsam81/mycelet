'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { IdentifySuggestion } from '@/types/identify';
import { Edibility } from '@/types/species';

/**
 * Side-by-side confusion check for the selected AI suggestion.
 *
 * Shows the most dangerous look-alike (API sorts critical first) next to the
 * chosen species, with the curated "why they get confused" and "how to tell
 * them apart" texts from the look_alikes table. This is the safety moment of
 * the whole identify flow — never let a user walk away without seeing the
 * dangerous twin.
 */

const EDIBILITY_VALUES: Edibility[] = ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly'];

function asEdibility(value: string | null | undefined): Edibility | null {
  return EDIBILITY_VALUES.includes(value as Edibility) ? (value as Edibility) : null;
}

function PhotoCard({
  label,
  name,
  imageUrl,
  edibility,
  tone
}: {
  label: string;
  name: string;
  imageUrl: string | null | undefined;
  edibility: Edibility | null;
  tone: 'chosen' | 'danger';
}) {
  return (
    <figure
      className={`overflow-hidden rounded-xl border ${
        tone === 'danger' ? 'border-red-200 bg-red-50/50' : 'border-forest-200 bg-white'
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-gray-100 text-3xl">🍄</div>
      )}
      <figcaption className="space-y-1 p-2.5">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone === 'danger' ? 'text-red-700' : 'text-forest-700'}`}>
          {label}
        </p>
        <p className="text-sm font-semibold leading-tight text-gray-900">{name}</p>
        {edibility ? <EdibilityBadge edibility={edibility} /> : null}
      </figcaption>
    </figure>
  );
}

export function LookAlikeCheck({ suggestion }: { suggestion: IdentifySuggestion | undefined }) {
  const lookAlike = suggestion?.dangerousLookAlikes?.[0];
  if (!suggestion || !lookAlike) return null;

  const critical = lookAlike.danger === 'critical';
  const others = (suggestion.dangerousLookAlikes ?? []).slice(1);
  const chosenName = suggestion.norwegianName ?? suggestion.name;

  return (
    <section
      aria-label="Forvekslingssjekk"
      className={`rounded-2xl border-2 p-4 shadow-card ${critical ? 'border-red-300 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${critical ? 'text-red-700' : 'text-orange-600'}`} />
        <div>
          <h2 className={`font-serif text-lg font-bold ${critical ? 'text-red-900' : 'text-orange-900'}`}>
            Sjekk forvekslingen før du plukker
          </h2>
          <p className={`text-xs ${critical ? 'text-red-800' : 'text-orange-800'}`}>
            {chosenName} forveksles med {lookAlike.name}
            {critical ? ' — en forveksling som kan være livsfarlig.' : '.'}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <PhotoCard
          label="Ditt forslag"
          name={chosenName}
          imageUrl={suggestion.imageUrl ?? suggestion.similarImages?.[0] ?? null}
          edibility={asEdibility(suggestion.edibility)}
          tone="chosen"
        />
        <PhotoCard
          label="Farlig dobbeltgjenger"
          name={lookAlike.name}
          imageUrl={lookAlike.imageUrl}
          edibility={asEdibility(lookAlike.edibility)}
          tone="danger"
        />
      </div>

      {lookAlike.whySimilar ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-700">
          <span className="font-semibold text-gray-900">Hvorfor de forveksles:</span> {lookAlike.whySimilar}
        </p>
      ) : null}
      {lookAlike.howToTell ? (
        <p className={`mt-2 rounded-xl p-3 text-sm leading-relaxed ${critical ? 'bg-red-100 text-red-900' : 'bg-orange-100 text-orange-900'}`}>
          <span className="font-bold">Slik skiller du dem:</span> {lookAlike.howToTell}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {lookAlike.speciesId ? (
          <Link
            href={`/species/${lookAlike.speciesId}`}
            className={`font-semibold underline ${critical ? 'text-red-800' : 'text-orange-800'}`}
          >
            Les alt om {lookAlike.name} →
          </Link>
        ) : null}
        {others.length > 0 ? (
          <span className="text-gray-600">Også lett å forveksle med: {others.map((o) => o.name).join(', ')}</span>
        ) : null}
      </div>
    </section>
  );
}
