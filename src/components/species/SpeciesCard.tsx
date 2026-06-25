'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { Species } from '@/types/species';

interface SpeciesCardProps {
  species: Species;
  imageUrl?: string | null;
}

export function SpeciesCard({ species, imageUrl }: SpeciesCardProps) {
  const t = useTranslations('SpeciesCard');
  return (
    <Link
      href={`/species/${species.id}`}
      className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:border-forest-600 hover:shadow-lg"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={species.norwegian_name}
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
        <h3 className="font-serif text-base font-bold text-forest-900">{species.norwegian_name}</h3>
        <p className="text-xs italic text-gray-600">{species.latin_name}</p>
      </div>
    </Link>
  );
}
