'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { PredictionResponse } from '@/types/prediction';
import type { Explanation } from '@/lib/utils/prediction-explanation';
import { PredictionExplanation } from '@/components/prediction/PredictionExplanation';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { COMPONENT_MAX } from '@/lib/utils/prediction';

interface HotspotPanelProps {
  speciesId: number | null;
  data: PredictionResponse | undefined;
  explanations?: Explanation[] | null;
  isLoading: boolean;
  error: boolean;
}

// Verdict styling per condition bucket. The colored dot gives an at-a-glance
// read before the user even reads the label. The human-readable label is
// resolved at render time via the translation key `condition_<bucket>`.
const CONDITION: Record<string, { labelKey: string; dot: string; text: string }> = {
  poor: { labelKey: 'conditionPoor', dot: 'bg-gray-400', text: 'text-gray-700' },
  moderate: { labelKey: 'conditionModerate', dot: 'bg-amber-400', text: 'text-amber-700' },
  good: { labelKey: 'conditionGood', dot: 'bg-forest-500', text: 'text-forest-800' },
  excellent: { labelKey: 'conditionExcellent', dot: 'bg-forest-600', text: 'text-forest-900' }
};

// Alle leverandører vi kan kreditere. 'unavailable' er utelatt med vilje — da
// finnes det ingen leverandør, og «Kilder:»-linja skal droppe værdelen.
type CreditableWeatherSource = Exclude<
  NonNullable<PredictionResponse['weatherSource']>,
  'unavailable'
>;

// Typen er bevisst TOTAL (ikke Record<string, string>): mangler en leverandør
// her, blir det typefeil i stedet for en stille utelatelse. Det var nettopp den
// stille utelatelsen som traff 'open_meteo' — den keyless reserven som faktisk
// brukes når Frost/SMHI ikke svarer. Værleverandøren forsvant fra kildelinja
// akkurat når vi trengte å navngi den mest: Open-Meteo er CC BY 4.0, og
// kreditering er en lisensforpliktelse, ikke en detalj.
const WEATHER_SOURCE_LABEL: Record<CreditableWeatherSource, string> = {
  met_frost: 'MET Norge',
  smhi: 'SMHI',
  openweather: 'OpenWeather',
  open_meteo: 'Open-Meteo'
};

// Build a "Kilder: …" credit from the real providers behind this prediction.
// Naming the authoritative sources (MET, NIBIO) is both honest and a trust lever.
function sourceCredit(
  data: PredictionResponse,
  t: (key: string, values?: Record<string, string | number>) => string
): string | null {
  const parts: string[] = [];
  const weather =
    data.weatherSource && data.weatherSource !== 'unavailable'
      ? WEATHER_SOURCE_LABEL[data.weatherSource]
      : undefined;
  if (weather) parts.push(t('sourceWeather', { provider: weather }));
  if (data.forest?.source === 'sr16') parts.push(t('sourceForest'));
  if (data.nearbyOccurrences && data.nearbyOccurrences > 0) parts.push(t('sourceOccurrences'));
  return parts.length ? parts.join(' · ') : null;
}

export function HotspotPanel({ speciesId, data, explanations, isLoading, error }: HotspotPanelProps) {
  const t = useTranslations('HotspotPanel');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const condition = data ? CONDITION[data.condition] ?? CONDITION.moderate : null;
  const credit = data ? sourceCredit(data, t) : null;
  const hotspotCount = data?.hotspots?.length ?? 0;

  // Uten artsfilter er scoren den BESTE arten i området nå, ikke et snitt over
  // alle. Da må arten stå ved siden av tallet: «57/100 gode forhold» alene
  // leses som en påstand om sopp generelt, mens det i virkeligheten er 57 for
  // kantarell og 2 for vanlig morkel på nøyaktig samme rute.
  // Er det filtrert på art, står navnet allerede i overskriften.
  const leadingName =
    !data?.species && data?.leadingSpecies
      ? data.leadingSpecies.displayName ||
        getSpeciesDisplayName(
          { norwegian_name: data.leadingSpecies.norwegianName, swedish_name: data.leadingSpecies.swedishName },
          locale
        )
      : '';

  // Ingen art å navngi, og ingen valgt. Da må panelet si nettopp det.
  //
  // «Alle arter», som sto her før, leses som «tallet dekker alle artene» — og
  // det gjør det aldri. Det er enten den beste artens tall (flisbanen) eller et
  // generelt forholdstall for stedet (fallback-banen når den ikke fikk navngitt
  // noen). To ulike størrelser på samme 0-100-flate, og herfra kan vi ikke se
  // hvilken. Det ærlige er å si at arten mangler og at tallet derfor ikke kan
  // stilles opp mot et som bærer et artsnavn.
  const unnamedSpecies = Boolean(data) && !data?.species && !leadingName && !speciesId;

  // Ingen forhåndsberegnet flis OG ingen skogdata i punktet: da er det ingenting
  // igjen i tallet som handler om STEDET — bare vær og sesong. Gjelder hele
  // Sverige og alt av Norge utenfor de fem rasterregionene.
  const noPlaceData = Boolean(data) && data?.source === 'computed_fallback' && !data?.forest;

  // Collapsed: a compact pill that still shows the verdict at a glance, so the
  // map stays open. Tap to expand the full "hvorfor" + sources.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 bottom-20 z-[1000] inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur hover:bg-white"
      >
        {condition ? (
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${condition.dot}`} aria-hidden="true" />
        ) : null}
        {leadingName ? <span className="truncate font-semibold text-gray-900">{leadingName}</span> : null}
        {unnamedSpecies ? (
          <span className="truncate font-semibold text-gray-900">{t('noLeadingSpeciesShort')}</span>
        ) : null}
        <span className="shrink-0 font-semibold text-gray-900">
          {isLoading && !data ? t('calculatingShort') : data ? `${data.score}/100` : t('mushroomConditions')}
        </span>
        {condition ? (
          <span className={`shrink-0 text-xs font-medium ${condition.text}`}>{t(condition.labelKey)}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="absolute left-3 bottom-20 z-[1000] w-[min(380px,calc(100%-1.5rem))] max-h-[calc(100%-9rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {data?.species
            ? getSpeciesDisplayName(
                { norwegian_name: data.species.norwegianName, swedish_name: data.species.swedishName },
                locale
              )
            : t('conditionsHere')}
        </h3>
        <div className="flex items-center gap-2">
          {data ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-forest-900">{data.score}</span>
              {/* Say what the number is measured against. The home page shows a
                  different quantity on the same 0-100 face, and users reasonably
                  read them as one scale. */}
              <span className="text-[10px] leading-tight text-gray-500">{t('scaleNote')}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('close')}
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {data?.species ? (
        <p className="text-xs italic text-gray-600">{data.species.latinName}</p>
      ) : leadingName ? (
        <>
          <p className="text-xs font-medium text-gray-700">{t('leadingSpecies', { species: leadingName })}</p>
          <p className="text-[11px] text-gray-500">{t('leadingSpeciesNote')}</p>
        </>
      ) : unnamedSpecies ? (
        <>
          <p className="text-xs font-medium text-gray-700">{t('noLeadingSpecies')}</p>
          <p className="text-[11px] text-gray-500">{t('noLeadingSpeciesNote')}</p>
        </>
      ) : (
        <p className="text-xs text-gray-600">{speciesId ? t('speciesNumber', { id: speciesId }) : t('allSpecies')}</p>
      )}

      {isLoading ? <p className="mt-2 text-xs text-gray-700">{t('calculatingConditions')}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{t('predictionError')}</p> : null}

      {data ? (
        <>
          {condition ? (
            <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${condition.text}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${condition.dot}`} aria-hidden="true" />
              {t(condition.labelKey)}
            </p>
          ) : null}

          {data.access === 'free_limited' ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5">
              <p className="text-xs text-amber-800">{data.upsellMessage ?? t('freeLimited')}</p>
              <NonNativeOnly>
                <Link href="/pricing" className="text-xs font-medium text-amber-900 underline">
                  {t('upgradeVegetation')}
                </Link>
              </NonNativeOnly>
            </div>
          ) : null}

          {explanations && explanations.length > 0 ? (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('why')}</p>
              <PredictionExplanation explanations={explanations} inline />
            </div>
          ) : null}

          {hotspotCount > 0 ? (
            <p className="mt-2 text-xs text-gray-700">
              {t('hotspotsMarked', { count: hotspotCount })}
            </p>
          ) : (
            <p className="mt-2 text-xs text-gray-600">{t('noHotspots')}</p>
          )}

          {credit ? <p className="mt-2 text-[11px] text-gray-500">{t('sources', { credit })}</p> : null}

          {/* Rasteret dekker fem norske byområder og ingenting i Sverige. Uten
              fliser OG uten skogdata i punktet hviler tallet på vær og sesong
              alene — den validerte (tids-)delen av modellen, men uten noe som
              helst om STEDET. Det så tidligere nøyaktig ut som et tall bygget på
              ekte skog- og rasterdata. Si det høyt i stedet. */}
          {noPlaceData ? (
            <p className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700">
              {t('noPlaceData')}
            </p>
          ) : null}

          <p className="mt-1 text-[11px] italic text-gray-500">
            {t('habitatDisclaimer')}
          </p>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700"
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? t('hideTechnicalDetails') : t('showTechnicalDetails')}
          </button>

          {showDetails ? (
            <div className="mt-1 space-y-1 text-[11px] text-gray-600">
              {/* NEVNEREN MÅ MED. «Sesong: 15» på en augustdag er MAKSVERDIEN,
                  men leses som 15 av 100 ved siden av et hovedtall på 0-100.
                  Skalaene er faste og ulike (miljø 0-50, historikk 0-35, sesong
                  0-15), og leddene summerer heller ikke til hovedtallet på
                  flisbanen — det er et snitt over ruter. Begge deler står nå. */}
              {data.components ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded bg-forest-50 p-1.5">
                      {t('environment', { value: data.components.environment, max: COMPONENT_MAX.environment })}
                    </div>
                    <div className="rounded bg-forest-50 p-1.5">
                      {t('history', { value: data.components.historical, max: COMPONENT_MAX.historical })}
                    </div>
                    <div className="rounded bg-forest-50 p-1.5">
                      {t('season', { value: data.components.seasonal, max: COMPONENT_MAX.seasonal })}
                    </div>
                  </div>
                  <p className="text-gray-500">{t('componentsNote')}</p>
                </>
              ) : (
                <p className="text-gray-500">{t('componentsUnavailable')}</p>
              )}
              {data.model?.version ? <p className="text-gray-400">{t('model', { version: data.model.version })}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
