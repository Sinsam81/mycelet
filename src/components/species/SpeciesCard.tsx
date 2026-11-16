'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { Artsnavn } from '@/components/species/Artsnavn';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { Species } from '@/types/species';

interface SpeciesCardProps {
  /** Kortet viser aldri beskrivelsen; biblioteket henter den ikke (artskatalog.ts). */
  species: Omit<Species, 'description'>;
  imageUrl?: string | null;
}

export function SpeciesCard({ species, imageUrl }: SpeciesCardProps) {
  const t = useTranslations('SpeciesCard');
  const locale = useLocale();
  const displayName = getSpeciesDisplayName(species, locale);
  return (
    <Link
      href={`/species/${species.id}`}
      className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:border-forest-600 hover:shadow-lg"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
        {imageUrl ? (
          // Biblioteket er ~80 kort, og uten `loading="lazy"` startet alle
          // bildene samtidig — også de som ligger mange skjermhøyder nede på en
          // telefon. Rammen rundt har fast kvadratisk form, så ingenting hopper
          // når bildet kommer.
          <img
            src={imageUrl}
            alt={displayName}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">{t('noImage')}</div>
        )}
        <div className="absolute bottom-2 right-2 drop-shadow-sm">
          <EdibilityBadge edibility={species.edibility} />
        </div>
      </div>
      <div className="space-y-0.5 p-3">
        {/* To kolonner på en telefon gir navnet ~132–147 px, og kortet har
            overflow-hidden: «Brunkjøttbukkesopp» og «Snöbollschampinjon» mistet
            slutten. Artsnavn bryter ordet i stedet (se komponenten). */}
        <Artsnavn
          as="h3"
          navn={displayName}
          className="font-serif text-base font-bold leading-tight text-forest-900"
        />
        <p className="break-words text-xs italic text-gray-600">{species.latin_name}</p>
      </div>
    </Link>
  );
}
