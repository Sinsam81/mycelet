'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { intlLocale } from '@/lib/utils/intl-locale';
import { pickBestForecastDay } from '@/lib/utils/forecast-best-day';

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
export function PlaceForecastStrip({ place, onClear }: PlaceForecastStripProps) {
  const t = useTranslations('MushroomMap');
  const locale = useLocale();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    (async () => {
      try {
        // Grovkorn til ~1 km før posisjonen legges i en URL — se samme
        // kommentar i MushroomDayCard. Ruta runder selv til to desimaler for
        // cache-nøkkelen, og været er regionalt, så svaret er identisk.
        const res = await fetch(
          `/api/mushroom-forecast?lat=${place.lat.toFixed(2)}&lon=${place.lng.toFixed(2)}`,
          { cache: 'no-store' }
        );
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

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' }),
    [locale]
  );
  const days = data?.days ?? [];
  // The API returns Norwegian day labels; format from the ISO date instead so
  // Swedish users don't get «lør» in a Swedish sentence.
  const labelFor = (day: ForecastDay, index: number) =>
    index === 0 ? t('forecastToday') : dayFormatter.format(new Date(`${day.date}T12:00:00Z`)).replace('.', '');
  // Uavgjort skal leses som uavgjort. Se pickBestForecastDay: den gamle
  // reduce-en med streng `>` pekte alltid på «i dag» når hele uka lå likt.
  const bestPick = pickBestForecastDay(days);
  const bestIndex = bestPick.index;
  const best = bestIndex != null ? days[bestIndex] : null;
  const evenWeek = bestIndex == null && bestPick.score != null;

  return (
    <div className="pointer-events-auto rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Deliberately NOT labelled with the selected species: this strip
              shows the general weather-driven conditions from
              /api/mushroom-forecast, which has no per-species adjustment. The
              species-specific score lives in the prediction panel. */}
          <p className="truncate text-xs font-semibold text-forest-900">
            📍 {place.name} <span className="font-normal text-gray-600">· {t('forecastConditionsThisWeek')}</span>
          </p>
          {loading ? (
            <p className="text-[11px] text-gray-500">{t('forecastLoading')}</p>
          ) : best && bestIndex != null ? (
            <p className="text-[11px] text-gray-600">
              {t('forecastBestDay', { day: labelFor(best, bestIndex), score: best.score })}
            </p>
          ) : evenWeek ? (
            <p className="text-[11px] text-gray-600">{t('forecastEvenWeek', { score: bestPick.score ?? 0 })}</p>
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
          {days.map((day, index) => {
            // Bar height maps 0-100 → 10-34px so even a bad day stays visible.
            const safeScore = Number.isFinite(day.score) ? Math.max(0, Math.min(100, day.score)) : 0;
            const height = Math.max(10, Math.round((safeScore / 100) * 34));
            // Ingen dag utheves når flere deler toppscoren — uthevingen ER
            // påstanden om at nettopp den dagen er best.
            const isBest = bestIndex != null && index === bestIndex;
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-0.5">
                <span className={`text-[9px] font-semibold ${isBest ? 'text-forest-800' : 'text-gray-400'}`}>
                  {safeScore}
                </span>
                <div
                  style={{ height }}
                  className={`w-full rounded-sm ${day.optimal ? 'bg-forest-600' : safeScore >= 40 ? 'bg-amber-500' : 'bg-gray-300'}`}
                />
                <span className={`text-[9px] ${isBest ? 'font-bold text-forest-900' : 'text-gray-500'}`}>
                  {labelFor(day, index)}
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
