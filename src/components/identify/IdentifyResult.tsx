'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { normalizeEdibility } from '@/lib/utils/edibility';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';
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

  return (
    <div className="space-y-2">
      {suggestions.map((suggestion, index) => {
        const isSelected = selectable && index === selectedIndex;
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
              {/*
                Bevisst asymmetri, og kjernen i hele denne komponenten:

                Et AI-forslag sier «bildet ligner på denne arten», ikke «dette
                ER denne arten». Da er de to utfallene ikke likeverdige:

                  • En ADVARSEL er nyttig selv når arts-ID-en er feil. Får du
                    vite at noe i dette landskapet av forslag er dødelig,
                    skjerper du deg — det er riktig respons uansett.
                  • Et GRØNT «spiselig» er skadelig når arts-ID-en er feil.
                    Det er nettopp da folk blir forgiftet.

                Derfor: alt som IKKE er en invitasjon til å spise beholder det
                tydelige merket — giftig, dødelig, uspiselig og ukjent. (Ukjent
                må være med: normalizeEdibility gjør alt ukjent om til 'unknown',
                og SafetyWarning behandler det allerede som farlig.) Bare de to
                spiselige klassene mister stempelet sitt her; de får en nøytral
                «ikke matvurdert»-merking, og spiselighet leses på artssiden,
                der dataene er kuraterte og arten er valgt av et menneske.

                Merk at predikatet er isRecommendableSpecies, ikke
                isHazardSpecies: sistnevnte dekker bare giftig/dødelig, og ville
                gitt «ikke matvurdert» til ukjente arter — for mykt.
              */}
              {!isRecommendableSpecies(suggestion.edibility) ? (
                <EdibilityBadge edibility={normalizeEdibility(suggestion.edibility)} />
              ) : (
                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">
                  {t('notFoodAssessed')}
                </span>
              )}
              {suggestion.inSeason === true ? (
                <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-900">
                  {suggestion.peakSeason ? t('peakSeasonNow') : t('inSeasonNow')}
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
                trygghetserklæring. */}
            {suggestion.dangerousLookAlikes && suggestion.dangerousLookAlikes.length > 0 ? (
              <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-900">
                ⚠️ {t('lookAlikeWarning', { names: suggestion.dangerousLookAlikes.map((d) => d.name).join(', ') })}
              </p>
            ) : suggestion.lookAlikeData === 'none_recorded' ? (
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
