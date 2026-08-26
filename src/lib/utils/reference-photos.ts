import type { IdentifySuggestion } from '@/types/identify';

/**
 * Referansebilder for et AI-forslag — grunnlaget for «Ligner det på …?»-
 * seksjonen i identifiseringsresultatet (Artsorakels mest etterspurte
 * funksjon: å kunne sammenligne eget bilde med kjente bilder av arten).
 *
 * To kilder, med bevisst rangering:
 *  · `curated`  — artsbibliotekets håndplukkede foto (mushroom_species.
 *    primary_image_url, i praksis Wikimedia Commons). Vist først: det er
 *    verifisert å faktisk vise arten.
 *  · `similar`  — Kindwise sine «similar images»: bilder av den foreslåtte
 *    arten som ligner på brukerens eget bilde. Sterke til sammenligning,
 *    men ikke kuratert av oss — derfor etter referansefotoet, og merket
 *    med egen kilde i UI-et.
 */
export interface ReferencePhoto {
  url: string;
  kind: 'curated' | 'similar';
}

/**
 * Maks referansebilder per forslag. Sammen med brukerens eget bilde gir det
 * et 2×2-rutenett på mobil — flere celler skyver forvekslingssjekken (den
 * viktigste delen av siden) under folden.
 */
export const MAX_REFERENCE_PHOTOS = 3;

export function buildReferencePhotos(
  suggestion: Pick<IdentifySuggestion, 'imageUrl' | 'similarImages'> | null | undefined
): ReferencePhoto[] {
  if (!suggestion) return [];

  const photos: ReferencePhoto[] = [];
  const seen = new Set<string>();

  if (suggestion.imageUrl) {
    photos.push({ url: suggestion.imageUrl, kind: 'curated' });
    seen.add(suggestion.imageUrl);
  }

  for (const url of suggestion.similarImages ?? []) {
    if (photos.length >= MAX_REFERENCE_PHOTOS) break;
    // Tomme strenger og duplikater gir døde celler i rutenettet.
    if (!url || seen.has(url)) continue;
    photos.push({ url, kind: 'similar' });
    seen.add(url);
  }

  return photos;
}
