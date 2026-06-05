'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { PredictionResponse } from '@/types/prediction';
import type { Explanation } from '@/lib/utils/prediction-explanation';
import { PredictionExplanation } from '@/components/prediction/PredictionExplanation';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';

interface HotspotPanelProps {
  speciesId: number | null;
  data: PredictionResponse | undefined;
  explanations?: Explanation[] | null;
  isLoading: boolean;
  error: boolean;
}

// Verdict styling per condition bucket. The colored dot gives an at-a-glance
// read before the user even reads the label.
const CONDITION: Record<string, { label: string; dot: string; text: string }> = {
  poor: { label: 'Lav sjanse', dot: 'bg-gray-400', text: 'text-gray-700' },
  moderate: { label: 'Moderat sjanse', dot: 'bg-amber-400', text: 'text-amber-700' },
  good: { label: 'God sjanse', dot: 'bg-forest-500', text: 'text-forest-800' },
  excellent: { label: 'Svært god sjanse', dot: 'bg-forest-600', text: 'text-forest-900' }
};

const WEATHER_SOURCE_LABEL: Record<string, string> = {
  met_frost: 'MET Norge',
  smhi: 'SMHI',
  openweather: 'OpenWeather'
};

// Build a "Kilder: …" credit from the real providers behind this prediction.
// Naming the authoritative sources (MET, NIBIO) is both honest and a trust lever.
function sourceCredit(data: PredictionResponse): string | null {
  const parts: string[] = [];
  const weather = data.weatherSource ? WEATHER_SOURCE_LABEL[data.weatherSource] : undefined;
  if (weather) parts.push(`${weather} (vær)`);
  if (data.forest?.source === 'sr16') parts.push('NIBIO (skog)');
  if (data.nearbyOccurrences && data.nearbyOccurrences > 0) parts.push('Artsdatabanken (funn)');
  return parts.length ? parts.join(' · ') : null;
}

export function HotspotPanel({ speciesId, data, explanations, isLoading, error }: HotspotPanelProps) {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const condition = data ? CONDITION[data.condition] ?? CONDITION.moderate : null;
  const credit = data ? sourceCredit(data) : null;
  const hotspotCount = data?.hotspots?.length ?? 0;

  // Collapsed: a compact pill that still shows the verdict at a glance, so the
  // map stays open. Tap to expand the full "hvorfor" + sources.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 bottom-20 z-[1000] inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur hover:bg-white"
      >
        {condition ? <span className={`h-2.5 w-2.5 rounded-full ${condition.dot}`} aria-hidden="true" /> : null}
        <span className="font-semibold text-gray-900">
          {isLoading && !data ? 'Beregner…' : data ? `${data.score}/100` : 'Soppforhold'}
        </span>
        {condition ? <span className={`text-xs font-medium ${condition.text}`}>{condition.label}</span> : null}
      </button>
    );
  }

  return (
    <div className="absolute left-3 bottom-20 z-[1000] w-[min(380px,calc(100%-1.5rem))] max-h-[calc(100%-9rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {data?.species ? data.species.norwegianName : 'Soppforhold her'}
        </h3>
        <div className="flex items-center gap-2">
          {data ? <span className="text-sm font-bold text-forest-900">{data.score}/100</span> : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Lukk"
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {data?.species ? (
        <p className="text-xs italic text-gray-600">{data.species.latinName}</p>
      ) : (
        <p className="text-xs text-gray-600">{speciesId ? `Art #${speciesId}` : 'Alle arter'}</p>
      )}

      {isLoading ? <p className="mt-2 text-xs text-gray-700">Beregner forhold...</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">Kunne ikke hente prediksjon.</p> : null}

      {data ? (
        <>
          {condition ? (
            <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${condition.text}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${condition.dot}`} aria-hidden="true" />
              {condition.label}
            </p>
          ) : null}

          {data.access === 'free_limited' ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5">
              <p className="text-xs text-amber-800">{data.upsellMessage ?? 'Gratis viser forenklet prediksjon.'}</p>
              <NonNativeOnly>
                <Link href="/pricing" className="text-xs font-medium text-amber-900 underline">
                  Oppgrader for full vegetasjonsanalyse
                </Link>
              </NonNativeOnly>
            </div>
          ) : null}

          {explanations && explanations.length > 0 ? (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Hvorfor</p>
              <PredictionExplanation explanations={explanations} inline />
            </div>
          ) : null}

          {hotspotCount > 0 ? (
            <p className="mt-2 text-xs text-gray-700">
              {hotspotCount} {hotspotCount === 1 ? 'sterkt område' : 'sterke områder'} markert på kartet (de lyse feltene).
            </p>
          ) : (
            <p className="mt-2 text-xs text-gray-600">Ingen tydelige hotspots i valgt område.</p>
          )}

          {credit ? <p className="mt-2 text-[11px] text-gray-500">Kilder: {credit}</p> : null}

          <p className="mt-1 text-[11px] italic text-gray-500">
            Områder som matcher habitat og værvindu — ingen garanti for at det er sopp der.
          </p>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700"
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? 'Skjul tekniske detaljer' : 'Vis tekniske detaljer'}
          </button>

          {showDetails ? (
            <div className="mt-1 space-y-1 text-[11px] text-gray-600">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded bg-forest-50 p-1.5">Miljø: {data.components.environment}</div>
                <div className="rounded bg-forest-50 p-1.5">Historikk: {data.components.historical}</div>
                <div className="rounded bg-forest-50 p-1.5">Sesong: {data.components.seasonal}</div>
              </div>
              {data.model?.version ? <p className="text-gray-400">Modell: {data.model.version}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
