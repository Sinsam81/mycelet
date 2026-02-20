import Link from 'next/link';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { Species } from '@/types/species';

interface SpeciesCardProps {
  species: Species;
  imageUrl?: string | null;
}

export function SpeciesCard({ species, imageUrl }: SpeciesCardProps) {
  return (
    <Link href={`/species/${species.id}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-40 w-full bg-gray-100">
        {imageUrl ? (
          <img src={imageUrl} alt={species.norwegian_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Ingen bilde</div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div>
          <h3 className="font-semibold text-gray-900">{species.norwegian_name}</h3>
          <p className="text-sm italic text-gray-600">{species.latin_name}</p>
        </div>
        <EdibilityBadge edibility={species.edibility} />
      </div>
    </Link>
  );
}
