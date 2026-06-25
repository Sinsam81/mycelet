'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DayPoint {
  date: string;
  label: string;
  score: number;
  optimal: boolean;
}

type FlushStatus = 'fruiting' | 'soon' | 'building' | 'dry' | 'dormant';

interface Flush {
  status: FlushStatus;
  daysUntil: number | null;
  title: string;
  message: string;
}

interface Forecast {
  today: { optimal: boolean; score: number; title: string; message: string; reasons: string[] };
  days: DayPoint[];
  flush?: Flush;
  hasForecast: boolean;
}

// Tint the flush banner by status — green when ripe, amber when on the way,
// muted when dry/dormant. The flush title already carries its own emoji.
const FLUSH_TINT: Record<FlushStatus, string> = {
  fruiting: 'border-forest-200 bg-forest-50 text-forest-900',
  soon: 'border-amber-200 bg-amber-50 text-amber-900',
  building: 'border-amber-200 bg-amber-50 text-amber-900',
  dry: 'border-gray-200 bg-gray-50 text-gray-700',
  dormant: 'border-gray-200 bg-gray-50 text-gray-600'
};

// Default region (Sør-Norge) used until the visitor opts to share their position —
// we never prompt for location on the landing page. The display label is resolved
// via i18n inside the component.
const DEFAULT = { lat: 59.91, lon: 10.75 };

function colorFor(score: number): string {
  if (score >= 65) return '#15803d'; // forest green — great
  if (score >= 40) return '#d97706'; // amber — moderate
  return '#9ca3af'; // gray — quiet
}

/**
 * "Soppforhold i dag" + 7-day trend on the home page. Calls /api/mushroom-forecast
 * and shows a color-coded score ring + verdict + the data-backed "why" for today,
 * plus a small bar chart of the days ahead. Personalizes silently only if location
 * is already granted (never prompts on load).
 */
export function MushroomDayCard() {
  const t = useTranslations('MushroomDayCard');
  const defaultLabel = t('defaultRegion');
  const myLocationLabel = t('yourPosition');
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaLabel, setAreaLabel] = useState(defaultLabel);
  const [usingDefault, setUsingDefault] = useState(true);

  const load = async (lat: number, lon: number, label: string, isDefault: boolean) => {
    setLoading(true);
    setAreaLabel(label);
    setUsingDefault(isDefault);
    try {
      const res = await fetch(`/api/mushroom-forecast?lat=${lat}&lon=${lon}`, { cache: 'no-store' });
      setData(res.ok ? ((await res.json()) as Forecast) : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      let granted = false;
      try {
        const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
        granted = perm?.state === 'granted';
      } catch {
        granted = false;
      }
      if (granted && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) void load(pos.coords.latitude, pos.coords.longitude, myLocationLabel, false);
          },
          () => {
            if (!cancelled) void load(DEFAULT.lat, DEFAULT.lon, defaultLabel, true);
          },
          { timeout: 6000, maximumAge: 600000 }
        );
      } else if (!cancelled) {
        void load(DEFAULT.lat, DEFAULT.lon, defaultLabel, true);
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) =>
      void load(pos.coords.latitude, pos.coords.longitude, myLocationLabel, false)
    );
  };

  if (loading && !data) {
    // Reserve the loaded card's height so content below doesn't jump when the
    // forecast arrives (was the main layout-shift / CLS source on the home page).
    return (
      <div className="flex min-h-[15rem] items-center justify-center rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
        {t('checkingConditions')}
      </div>
    );
  }
  // Weather unavailable → render nothing rather than a broken card.
  if (!data) return null;

  const { today, days } = data;
  const color = colorFor(today.score);
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - today.score / 100);

  return (
    <article className="min-h-[15rem] rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 110 110" className="h-24 w-24 shrink-0" aria-hidden>
          <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 55 55)"
          />
          <text x="55" y="52" textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>
            {today.score}
          </text>
          <text x="55" y="70" textAnchor="middle" fontSize="10" fill="#6b7280">
            {t('outOf100')}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-forest-900">{today.title}</h2>
          <p className="mt-0.5 text-sm text-gray-700">{today.message}</p>
          {today.reasons.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {today.reasons.slice(0, 2).map((reason, i) => (
                <li key={i} className="truncate text-xs text-gray-600">
                  ✓ {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {data.flush ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 ${FLUSH_TINT[data.flush.status]}`}>
          <p className="text-sm font-semibold">{data.flush.title}</p>
          <p className="mt-0.5 text-xs opacity-90">{data.flush.message}</p>
        </div>
      ) : null}

      {data.hasForecast && days.length > 1 ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-xs font-medium text-gray-500">{t('outlookAhead')}</p>
          <div className="flex h-16 items-end justify-between gap-1.5">
            {days.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.score}/100`}>
                <div className="flex h-12 w-full items-end">
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(10, d.score)}%`, backgroundColor: colorFor(d.score) }}
                  />
                </div>
                <span className={`text-[9px] ${d.label === 'I dag' ? 'font-semibold text-forest-900' : 'text-gray-500'}`}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">📍 {areaLabel}</span>
        <div className="flex items-center gap-3">
          {usingDefault ? (
            <button
              type="button"
              onClick={useMyLocation}
              className="inline-flex items-center gap-1 font-medium text-forest-800 hover:underline"
            >
              <MapPin className="h-3 w-3" /> {t('myPosition')}
            </button>
          ) : null}
          <Link href="/map" className="font-medium text-forest-800 hover:underline">
            {t('seeMap')}
          </Link>
        </div>
      </div>
    </article>
  );
}
