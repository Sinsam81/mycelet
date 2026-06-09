'use client';

import { useEffect, useState } from 'react';

interface LastTrip {
  count: number;
  species: string[];
  at: string;
}

/**
 * Shows the user's most recent completed "sopptur" (saved to localStorage when
 * they end a trip on the map). Renders nothing until they've finished one.
 */
export function LastTripCard() {
  const [trip, setTrip] = useState<LastTrip | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('mycelet:last-trip');
    if (!raw) return;
    try {
      setTrip(JSON.parse(raw) as LastTrip);
    } catch {
      window.localStorage.removeItem('mycelet:last-trip');
    }
  }, []);

  if (!trip || trip.count <= 0) return null;

  const date = new Date(trip.at);
  const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' });
  const speciesText = trip.species.filter(Boolean).join(', ');

  return (
    <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">🎒 Din siste sopptur</h2>
      <p className="mt-1 text-sm text-amber-900">
        {trip.count} funn{when ? ` · ${when}` : ''}
      </p>
      {speciesText ? <p className="mt-0.5 truncate text-xs text-amber-800">{speciesText}</p> : null}
    </article>
  );
}
