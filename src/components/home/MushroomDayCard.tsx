'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

interface Assessment {
  optimal: boolean;
  score: number;
  title: string;
  message: string;
  reasons: string[];
}

// Default region (Sør-Norge) used until the visitor opts to share their position —
// we never prompt for location on the landing page.
const DEFAULT = { lat: 59.91, lon: 10.75, label: 'Sør-Norge' };

function colorFor(score: number): string {
  if (score >= 65) return '#15803d'; // forest green — great
  if (score >= 40) return '#d97706'; // amber — moderate
  return '#6b7280'; // gray — quiet
}

/**
 * "Soppforhold i dag" — a daily foraging-conditions gauge on the home page.
 * Calls /api/mushroom-day and shows a color-coded score ring + verdict + the
 * data-backed "why". Personalizes silently only if location is already granted.
 */
export function MushroomDayCard() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaLabel, setAreaLabel] = useState(DEFAULT.label);
  const [usingDefault, setUsingDefault] = useState(true);

  const load = async (lat: number, lon: number, label: string, isDefault: boolean) => {
    setLoading(true);
    setAreaLabel(label);
    setUsingDefault(isDefault);
    try {
      const res = await fetch(`/api/mushroom-day?lat=${lat}&lon=${lon}`, { cache: 'no-store' });
      setAssessment(res.ok ? ((await res.json()) as Assessment) : null);
    } catch {
      setAssessment(null);
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
            if (!cancelled) void load(pos.coords.latitude, pos.coords.longitude, 'din posisjon', false);
          },
          () => {
            if (!cancelled) void load(DEFAULT.lat, DEFAULT.lon, DEFAULT.label, true);
          },
          { timeout: 6000, maximumAge: 600000 }
        );
      } else if (!cancelled) {
        void load(DEFAULT.lat, DEFAULT.lon, DEFAULT.label, true);
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
      void load(pos.coords.latitude, pos.coords.longitude, 'din posisjon', false)
    );
  };

  if (loading && !assessment) {
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">Sjekker soppforholdene …</div>
    );
  }
  // Weather unavailable → render nothing rather than a broken card.
  if (!assessment) return null;

  const color = colorFor(assessment.score);
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - assessment.score / 100);

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm">
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
            {assessment.score}
          </text>
          <text x="55" y="70" textAnchor="middle" fontSize="10" fill="#6b7280">
            av 100
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-forest-900">{assessment.title}</h2>
          <p className="mt-0.5 text-sm text-gray-700">{assessment.message}</p>
          {assessment.reasons.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {assessment.reasons.slice(0, 2).map((reason, i) => (
                <li key={i} className="truncate text-xs text-gray-600">
                  ✓ {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">📍 {areaLabel}</span>
        <div className="flex items-center gap-3">
          {usingDefault ? (
            <button
              type="button"
              onClick={useMyLocation}
              className="inline-flex items-center gap-1 font-medium text-forest-800 hover:underline"
            >
              <MapPin className="h-3 w-3" /> Min posisjon
            </button>
          ) : null}
          <Link href="/map" className="font-medium text-forest-800 hover:underline">
            Se kartet →
          </Link>
        </div>
      </div>
    </article>
  );
}
