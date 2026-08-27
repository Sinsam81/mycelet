'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { buildReferencePhotos } from '@/lib/utils/reference-photos';
import { PhotoCredit } from '@/components/ui/PhotoCredit';
import { IdentifySuggestion } from '@/types/identify';

/**
 * «Ligner det på …?» — brukerens eget bilde side om side med kjente bilder av
 * den valgte arten (kuratert referansefoto + Kindwise sine lignende bilder).
 * Artsorakels mest etterspurte funksjon; hos oss henter den bare fram data
 * som allerede ligger i payloaden.
 *
 * Sikkerhetsrammen er bevisst:
 *  · Ingen spiselighetsmerker her — likhet skal aldri leses sammen med et
 *    grønt stempel. Spiselighet vurderes i kortlista og på artssiden.
 *  · Overskriften er et spørsmål, ikke en dom, og ansvarslinja under sier
 *    eksplisitt at likhet ikke er bekreftelse. Forvekslingssjekken rendres
 *    rett under denne seksjonen og får siste ord.
 *  · Mangler bildene, sier vi det — en tom seksjon som stille forsvinner
 *    ligner «ingenting å sammenligne med», som er noe annet enn sannheten.
 */
export function ReferencePhotos({
  suggestion,
  userPhotoUrl
}: {
  suggestion: IdentifySuggestion | undefined;
  /**
   * null når visningen er hydrert fra historikken og bildet mangler (gammel
   * rad, eller en opplasting som aldri kom fram). Sammenligningen skal fortsatt
   * vises — referansebildene er halve poenget — men uten å rendre et knekt
   * bilde der brukerens eget skulle stått.
   */
  userPhotoUrl: string | null;
}) {
  const t = useTranslations('ReferencePhotos');
  // Døde bilde-URL-er (CDN nede, CSP-blokkert, offline — kryssdomene-bilder
  // caches ikke av service workeren) rendres ellers som knekt-bilde-ikon med
  // alt-tekst. Plassholderen sier ærlig «bilde mangler» i stedet.
  const [brokenUrls, setBrokenUrls] = useState<ReadonlySet<string>>(new Set());
  if (!suggestion) return null;

  const displayName = suggestion.norwegianName ?? suggestion.commonNames?.[0] ?? suggestion.name;
  const photos = buildReferencePhotos(suggestion);

  // Kildelinja skal bare nevne kildene som faktisk vises: 8 av 80 arter
  // mangler kuratert foto (kun AI-bilder), og Kindwise kan la være å sende
  // similar_images (kun referansefoto). Å kreditere en kilde som ikke bidro
  // er en falsk kildepåstand.
  const hasCurated = photos.some((p) => p.kind === 'curated');
  const hasSimilar = photos.some((p) => p.kind === 'similar');
  const sourcesKey = hasCurated && hasSimilar ? 'sourcesBoth' : hasCurated ? 'sourcesCurated' : 'sourcesSimilar';

  return (
    <section
      aria-label={t('sectionLabel')}
      className="rounded-2xl border border-forest-200 bg-white p-4 shadow-card"
    >
      <h2 className="font-serif text-lg font-bold text-forest-900">{t('heading', { name: displayName })}</h2>

      {photos.length === 0 ? (
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{t('noPhotos')}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <figure className="overflow-hidden rounded-xl border border-forest-200 bg-white">
              {userPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userPhotoUrl} alt={t('yourPhoto')} className="h-32 w-full object-cover" />
              ) : (
                <div aria-hidden className="flex h-32 w-full items-center justify-center bg-gray-100 text-3xl">
                  🍄
                </div>
              )}
              <figcaption className="p-2.5 text-[11px] font-semibold uppercase tracking-wide text-forest-700">
                {t('yourPhoto')}
              </figcaption>
            </figure>
            {photos.map((photo) => (
              <figure key={photo.url} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {brokenUrls.has(photo.url) ? (
                  <div aria-hidden className="flex h-32 w-full items-center justify-center bg-gray-100 text-3xl">
                    🍄
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={t('photoAlt', { name: displayName })}
                    loading="lazy"
                    onError={() => setBrokenUrls((prev) => new Set(prev).add(photo.url))}
                    className="h-32 w-full object-cover"
                  />
                )}
                <figcaption className="space-y-1 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {photo.kind === 'curated' ? t('curatedLabel') : t('similarLabel')}
                  </p>
                  {/* Kun referansefotoet krediteres — Kindwise-bildene har
                      ingen kreditering vi kan videreformidle, og feltet
                      settes derfor aldri på dem (se buildReferencePhotos). */}
                  <PhotoCredit
                    photographer={photo.credit?.photographer}
                    license={photo.credit?.license}
                    sourceUrl={photo.credit?.sourceUrl}
                  />
                </figcaption>
              </figure>
            ))}
          </div>
          {/* Arter utenfor katalogen har ingen artsside — da må rådet peke på
              soppkontroll i stedet, ellers er seksjonens eneste anvisning
              uoppfyllbar akkurat for artene vi vet minst om. */}
          <p className="mt-3 text-xs leading-relaxed text-gray-700">
            {suggestion.speciesId ? t('disclaimer') : t('disclaimerNoSpeciesPage')}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">{t(sourcesKey)}</p>
        </>
      )}
    </section>
  );
}
