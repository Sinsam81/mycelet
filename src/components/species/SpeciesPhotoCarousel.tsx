'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Photo {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  is_primary: boolean;
}

interface SpeciesPhotoCarouselProps {
  photos: Photo[];
  speciesName: string;
}

export function SpeciesPhotoCarousel({ photos, speciesName }: SpeciesPhotoCarouselProps) {
  const t = useTranslations('SpeciesPhotoCarousel');
  const [index, setIndex] = useState(0);
  const count = photos.length;

  if (count === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-gray-200 bg-gray-100 text-sm text-gray-500">
        {t('noPhotosYet')}
      </div>
    );
  }

  const photo = photos[index];

  function prev() {
    setIndex((i) => (i - 1 + count) % count);
  }

  function next() {
    setIndex((i) => (i + 1) % count);
  }

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-card">
        <img src={photo.image_url} alt={photo.caption ?? speciesName} className="h-full w-full object-cover" />

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label={t('previousPhoto')}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md backdrop-blur-sm transition hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5 text-forest-900" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label={t('nextPhoto')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md backdrop-blur-sm transition hover:bg-white"
            >
              <ChevronRight className="h-5 w-5 text-forest-900" />
            </button>
          </>
        ) : null}
      </div>

      <p className="mt-2 text-center text-xs text-gray-600">
        {count > 1 ? t('counter', { current: index + 1, total: count }) : t('counterSingle')}
      </p>

      {photo.caption ? (
        <p className="mt-1 text-center text-xs italic text-gray-500">{photo.caption}</p>
      ) : null}
    </div>
  );
}
