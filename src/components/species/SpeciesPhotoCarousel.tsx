'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PhotoCredit } from '@/components/ui/PhotoCredit';
import { Artsbilde } from './Artsbilde';

interface Photo {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  is_primary: boolean;
  /** Opphavsperson. Alle artsbildene er Commons-filer under CC BY / CC BY-SA. */
  photographer: string | null;
  /** Lisensens kortnavn, f.eks. «CC BY-SA 4.0». Ikke en kilde. */
  license: string | null;
  /** Filsiden på Wikimedia Commons. */
  source_url: string | null;
  /**
   * Bredere utgaver av samme bilde, som `srcset` — bygget på serveren
   * (hovedbildeSrcSet i src/lib/species/artsbilde.ts). Utelatt = bare
   * `image_url`, som før.
   */
  srcSet?: string | null;
}

interface SpeciesPhotoCarouselProps {
  photos: Photo[];
  speciesName: string;
  /** `sizes` til `srcSet`: hvor bredt bildet vises. Bare i bruk sammen med `srcSet`. */
  sizes?: string;
}

export function SpeciesPhotoCarousel({ photos, speciesName, sizes }: SpeciesPhotoCarouselProps) {
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
        {/* Hovedbildet er det leseren sammenligner soppen sin med, og sidens
            største element: lastes straks (ingen lazy), i den bredden skjermen
            trenger. `image_url` er utgaven som er lagret, og den Artsbilde
            faller tilbake på om en bredere utgave ikke lar seg laste. */}
        <Artsbilde
          src={photo.image_url}
          srcSet={photo.srcSet}
          sizes={sizes}
          alt={photo.caption ?? speciesName}
          className="h-full w-full object-cover"
        />

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

      <div className="mt-2 space-y-1">
        {/* Bare når det er noe å bla i. Hver art har i dag ett bilde, og linja
            «1 bilde» sto under samtlige uten å si noe. */}
        {count > 1 ? (
          <p className="text-center text-xs text-gray-600">{t('counter', { current: index + 1, total: count })}</p>
        ) : null}

        {photo.caption ? <p className="text-center text-xs italic text-gray-500">{photo.caption}</p> : null}

        {/* CC BY / CC BY-SA krever at fotograf og lisens navngis der bildet
            vises. Linja rendrer seg bort av seg selv når vi ikke har ekte
            verdier — se buildPhotoCredit. Krediteringen gjelder fila, så den
            er den samme uansett hvilken bredde nettleseren valgte. */}
        <PhotoCredit
          photographer={photo.photographer}
          license={photo.license}
          sourceUrl={photo.source_url}
          className="text-center"
        />
      </div>
    </div>
  );
}
