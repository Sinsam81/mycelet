'use client';

import Link from 'next/link';
import { PredictionResponse } from '@/types/prediction';

interface HotspotPanelProps {
  speciesId: number | null;
  data: PredictionResponse | undefined;
  isLoading: boolean;
  error: boolean;
}

const conditionLabel: Record<string, string> = {
  poor: 'Lav sjanse',
  moderate: 'Moderat sjanse',
  good: 'God sjanse',
  excellent: 'Svært god sjanse'
};

const sourceLabel: Record<string, string> = {
  prediction_tiles: 'Datakilde: pregenererte prediksjonsfliser',
  computed_fallback: 'Datakilde: live beregning (vær + historikk)'
};

export function HotspotPanel({ speciesId, data, isLoading, error }: HotspotPanelProps) {
  return (
    <div className="absolute left-3 bottom-20 z-[1000] w-[min(380px,calc(100%-1.5rem))] rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <h3 className="text-sm font-semibold text-gray-900">Vegetasjonsbasert soppestimat</h3>
      <p className="text-xs text-gray-600">{speciesId ? `Filter: art #${speciesId}` : 'Filter: alle arter'}</p>
      {data?.source ? <p className="mt-0.5 text-[11px] text-gray-500">{sourceLabel[data.source] ?? data.source}</p> : null}
      {data?.model?.version ? <p className="text-[11px] text-gray-500">Modell: {data.model.version}</p> : null}

      {isLoading ? <p className="mt-2 text-xs text-gray-700">Beregner prediksjon...</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">Kunne ikke hente prediksjon.</p> : null}
      {data?.access === 'free_limited' ? (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5">
          <p className="text-xs text-amber-800">{data.upsellMessage ?? 'Gratis viser forenklet prediksjon.'}</p>
          <Link href="/pricing" className="text-xs font-medium text-amber-900 underline">
            Oppgrader for full vegetasjonsanalyse
          </Link>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-600">Total score</p>
            <p className="text-sm font-bold text-forest-900">{data.score}/100</p>
          </div>
          <p className="text-xs text-forest-800">{conditionLabel[data.condition] ?? data.condition}</p>

          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded bg-forest-50 p-2">Miljø: {data.components.environment}</div>
            <div className="rounded bg-forest-50 p-2">Historikk: {data.components.historical}</div>
            <div className="rounded bg-forest-50 p-2">Sesong: {data.components.seasonal}</div>
          </div>

          {data.model ? (
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-gray-700">
              <div className="rounded bg-gray-50 px-2 py-1">Vegetasjon: {data.model.factors.vegetation}</div>
              <div className="rounded bg-gray-50 px-2 py-1">Fukt: {data.model.factors.moisture}</div>
              <div className="rounded bg-gray-50 px-2 py-1">Terreng: {data.model.factors.terrain}</div>
              <div className="rounded bg-gray-50 px-2 py-1">Jord: {data.model.factors.soil}</div>
            </div>
          ) : null}

          <div className="mt-2">
            <p className="text-xs font-medium text-gray-800">Hotspots</p>
            <div className="mt-1 max-h-28 space-y-1 overflow-auto">
              {(data.hotspots ?? []).map((spot, index) => (
                <div key={`${spot.lat}-${spot.lng}-${index}`} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-xs">
                  <span>
                    {spot.lat}, {spot.lng}
                  </span>
                  <span>{spot.score}%</span>
                </div>
              ))}
              {(data.hotspots?.length ?? 0) === 0 ? <p className="text-xs text-gray-600">Ingen tydelige hotspots i valgt område.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
