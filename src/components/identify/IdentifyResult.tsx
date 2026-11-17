'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AiEdibilityBadge } from '@/components/identify/AiEdibilityBadge';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import { IdentifySuggestion } from '@/types/identify';

interface IdentifyResultProps {
  suggestions: IdentifySuggestion[];
  /** When provided, suggestions become selectable (radio-style) for confirming the find. */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

export function IdentifyResult({ suggestions, selectedIndex, onSelect }: IdentifyResultProps) {
  const t = useTranslations('IdentifyResult');
  const selectable = typeof onSelect === 'function';
  // Døde bilde-URL-er (CDN nede, offline — kryssdomene-bilder caches ikke av
  // service workeren) skal falle tilbake til plassholderen, ikke bli et
  // knekt-bilde-ikon. Samme mønster som ReferencePhotos.
  const [brokenThumbs, setBrokenThumbs] = useState<ReadonlySet<string>>(new Set());

  return (
    <div className="space-y-2">
      {suggestions.map((suggestion, index) => {
        const isSelected = selectable && index === selectedIndex;
        // Kuratert artsfoto foran Kindwise sitt lignende bilde — samme
        // rangering som LookAlikeCheck og ReferencePhotos, så kortet og
        // sammenligningen under viser samme bilde for samme art. Bevisst
        // avveining: Kindwise-fallbacken er uverifisert og umerket her (for
        // liten flate for kildeetikett), men de samme bildene står merket
        // «AI-databasen» i sammenligningsseksjonen rett under.
        const thumbUrl = suggestion.imageUrl ?? suggestion.similarImages?.[0] ?? null;
        // Giftig, dødelig eller ukjent: sesongpilla blir nøytral og sier aldri
        // «Topp-sesong». Samme regel som kalenderen (SeasonNow, YearTable) —
        // «topp» og grønt leses som en anbefaling, og en grønn «Topp-sesong
        // nå» ved et dødelig forslag i august var nettopp det.
        const farlig = isDangerousEdibility(suggestion.edibility);
        // Mat etter katalogen (spiselig eller betinget spiselig) — samme
        // predikat som AiEdibilityBadge. Avgjør hvilke forvekslingsnotater
        // kortet har lov til å vise; se under.
        const mat = isRecommendableSpecies(suggestion.edibility);
        return (
          <article
            key={suggestion.name}
            onClick={selectable ? () => onSelect?.(index) : undefined}
            className={`rounded-2xl border bg-white p-3 shadow-card transition ${selectable ? 'cursor-pointer hover:border-forest-300' : ''} ${
              isSelected ? 'border-forest-700 ring-2 ring-forest-200' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {selectable ? (
                  <span
                    aria-hidden
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                      isSelected ? 'border-forest-700 bg-forest-700' : 'border-gray-300'
                    }`}
                  />
                ) : null}
                {/* Dekorativ (alt="") — artsnavnet står rett ved siden av. */}
                {thumbUrl && !brokenThumbs.has(thumbUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl}
                    alt=""
                    onError={() => setBrokenThumbs((prev) => new Set(prev).add(thumbUrl))}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xl"
                  >
                    🍄
                  </div>
                )}
                <div>
                  <h3 className="font-serif text-base font-bold text-forest-900">
                    {suggestion.norwegianName ?? suggestion.commonNames?.[0] ?? suggestion.name}
                  </h3>
                  <p className="text-sm italic text-gray-600">{suggestion.name}</p>
                </div>
              </div>
              <span className="whitespace-nowrap text-sm font-medium text-gray-600">
                {suggestion.probability}% {t('matchLabel')}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Aldri et rått EdibilityBadge her: et AI-forslag får aldri et
                  grønt «spiselig»-stempel. Regelen og begrunnelsen bor i
                  AiEdibilityBadge. */}
              <AiEdibilityBadge edibility={suggestion.edibility} />
              {suggestion.inSeason === true ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    farlig ? 'bg-gray-100 text-gray-700' : 'bg-forest-100 text-forest-900'
                  }`}
                >
                  {suggestion.peakSeason && !farlig ? t('peakSeasonNow') : t('inSeasonNow')}
                </span>
              ) : suggestion.inSeason === false ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  {t('outOfSeason')}
                </span>
              ) : null}
              {suggestion.nearbyFindings && suggestion.nearbyFindings > 0 ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {t('nearbyFindings', { count: suggestion.nearbyFindings })}
                </span>
              ) : null}
            </div>

            {/* Tre tilstander, ikke to. Et forslag uten registrerte
                forvekslingsarter rendret før nøyaktig likt som et vi har
                sjekket — og 24 av 45 spiselige arter i katalogen har ingen
                rader. Fravær av advarsel må aldri kunne leses som en
                trygghetserklæring.

                «Ikke ført inn ennå» står bare under et forslag som er mat.
                Under et forslag som ikke er mat var setningen usann: enrich.ts
                filtrerer bort speilradene som peker på en matsopp, og hvit
                fluesopp, spiss giftslørsopp, karbol-sjampinjong og falsk
                kantarell sto da uten rader og fikk «ikke ført inn» — mens
                artssiden ett trykk unna lister paret. Der er forslagets eget
                merke (Uspiselig, Giftig, Dødelig, Ukjent) advarselen, samme
                regel som artssiden. Matsoppens navn skal ikke tilbake ved
                siden av et dødelig forslag.

                Den røde linja følger også forslagets egen klasse. «Sjekk nøye
                før du spiser» under et forslag katalogen kaller giftig eller
                uspiselig (svovelsopp ↔ honningsopp, honningsopp →
                flatklokkehatt) leses som «spiselig om du er nøye» — det
                migrasjon 047 tok bort for honningsopp. Der står «ikke spis
                den», som bare sier noe om forslaget: et resultat lagt i økta
                før speilregelen kan fortsatt liste en matsopp, og den skal
                ikke kalles uspiselig. */}
            {suggestion.dangerousLookAlikes && suggestion.dangerousLookAlikes.length > 0 ? (
              <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-900">
                ⚠️{' '}
                {t(mat ? 'lookAlikeWarning' : 'lookAlikeWarningNotFood', {
                  names: suggestion.dangerousLookAlikes.map((d) => d.name).join(', ')
                })}
              </p>
            ) : suggestion.lookAlikeData === 'none_recorded' && mat ? (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                {t('lookAlikeNoneRecorded')}
              </p>
            ) : suggestion.lookAlikeData === 'unavailable' ? (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                {t('lookAlikeUnknown')}
              </p>
            ) : null}

            {suggestion.speciesId ? (
              <Link
                href={`/species/${suggestion.speciesId}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-flex text-sm font-medium text-forest-800 hover:underline"
              >
                {t('viewSpeciesPage')}
              </Link>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
