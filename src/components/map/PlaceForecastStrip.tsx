'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

interface ForecastDay {
  date: string;
  label: string;
  score: number;
  optimal: boolean;
}

interface ForecastResponse {
  days?: ForecastDay[];
  flush?: { title?: string; message?: string } | null;
  hasForecast?: boolean;
}

interface PlaceForecastStripProps {
  place: { name: string; lat: number; lng: number };
  speciesName: string | null;
  onClear: () => void;
}

/**
 * «Hvordan blir det her denne uka?» for a searched place.
 *
 * The 7-day outlook already existed on the home page, but only for the user's
 * OWN position — so «skal jeg dra til Hamar på lørdag?» was unanswerable in
 * the app even though the API could answer it. This strip appears when you
 * search a place on the map and answers it there.
 */
export function PlaceForecastStrip({ place, speciesName, onClear }: PlaceForecastStripProps) {
  const t = useTranslations('MushroomMap');
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/mushroom-forecast?lat=${place.lat}&lon=${place.lng}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('forecast failed');
        const json = (await res.json()) as ForecastResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [place.lat, place.lng]);

  const days = data?.days ?? [];
  const best = days.reduce<ForecastDay | null>((top, day) => (!top || day.score > top.score ? day : top), null);

  return (
    <div className="pointer-events-auto rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-forest-900">
            📍 {place.name}
            {speciesName ? <span className="font-normal text-gray-600"> · {speciesName}</span> : null}
          </p>
          {loading ? (
            <p className="text-[11px] text-gray-500">{t('forecastLoading')}</p>
          ) : best ? (
            <p className="text-[11px] text-gray-600">{t('forecastBestDay', { day: best.label, score: best.score })}</p>
          ) : (
            <p className="text-[11px] text-gray-500">{t('forecastUnavailable')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label={t('reset')}
          className="shrink-0 rounded-full p-1 text-gray-500 hover:bg-gray-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {days.length > 0 ? (
        <div className="mt-2 flex items-end justify-between gap-1">
          {days.map((day) => {
            // Bar height maps 0-100 → 10-34px so even a bad day stays visible.
            const height = Math.max(10, Math.round((day.score / 100) * 34));
            const isBest = best?.date === day.date;
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-0.5">
                <span className={`text-[9px] font-semibold ${isBest ? 'text-forest-800' : 'text-gray-400'}`}>
                  {day.score}
                </span>
                <div
                  style={{ height }}
                  className={`w-full rounded-sm ${day.optimal ? 'bg-forest-600' : day.score >= 40 ? 'bg-amber-500' : 'bg-gray-300'}`}
                />
                <span className={`text-[9px] ${isBest ? 'font-bold text-forest-900' : 'text-gray-500'}`}>
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {data?.flush?.title ? (
        <p className="mt-2 border-t border-gray-100 pt-1.5 text-[10px] leading-snug text-gray-600">
          <span className="font-semibold text-forest-900">{data.flush.title}</span>
          {data.flush.message ? ` — ${data.flush.message}` : ''}
        </p>
      ) : null}
    </div>
  );
}
