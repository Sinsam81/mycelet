'use client';

import dynamic from 'next/dynamic';

// Next 15+ disallows `ssr: false` on next/dynamic from Server Components
// (Leaflet has client-only globals so we need ssr:false). Extracting the
// dynamic call into this thin client-component wrapper satisfies the new
// constraint while keeping the map page a Server Component for the rest
// of its work (auth check, moderator role lookup, etc.).

export const MushroomMap = dynamic(
  () => import('@/components/map/MushroomMap').then((mod) => mod.MushroomMap),
  { ssr: false, loading: () => <p className="text-sm text-gray-700">Laster kart...</p> }
);
