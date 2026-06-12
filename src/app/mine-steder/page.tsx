import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, ExternalLink, Lock, Map as MapIcon, MapPin } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Mine steder — Mycelet'
};

/**
 * "Mine steder" — the user's own finds grouped by place. This is the secret-
 * spots vault: it reads the user's OWN findings (all visibilities) via RLS,
 * so nothing here is ever visible to anyone else. Groups by location_name
 * when present, else by a ~1 km coordinate bucket.
 */

interface FindingRow {
  id: string;
  location_name: string | null;
  latitude: number;
  longitude: number;
  found_at: string;
  image_url: string | null;
  visibility: string;
  species_name_override: string | null;
  mushroom_species:
    | { norwegian_name: string | null }
    | { norwegian_name: string | null }[]
    | null;
}

interface Spot {
  label: string;
  unnamed: boolean;
  count: number;
  species: Map<string, number>;
  lastVisit: string;
  years: Set<number>;
  allPrivate: boolean;
  thumb: string | null;
  lat: number;
  lng: number;
}

function speciesName(row: FindingRow): string {
  const ms = Array.isArray(row.mushroom_species) ? row.mushroom_species[0] : row.mushroom_species;
  return ms?.norwegian_name ?? row.species_name_override ?? 'Ukjent art';
}

function groupFindings(rows: FindingRow[]): Spot[] {
  const groups = new Map<string, Spot>();
  for (const row of rows) {
    const named = !!row.location_name?.trim();
    const key = named
      ? `name:${row.location_name!.trim().toLowerCase()}`
      : `geo:${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`;
    let spot = groups.get(key);
    if (!spot) {
      spot = {
        label: named ? row.location_name!.trim() : `Sted nær ${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}`,
        unnamed: !named,
        count: 0,
        species: new Map(),
        lastVisit: row.found_at,
        years: new Set(),
        allPrivate: true,
        thumb: null,
        lat: 0,
        lng: 0
      };
      groups.set(key, spot);
    }
    spot.count += 1;
    const name = speciesName(row);
    spot.species.set(name, (spot.species.get(name) ?? 0) + 1);
    if (row.found_at > spot.lastVisit) spot.lastVisit = row.found_at;
    spot.years.add(new Date(row.found_at).getFullYear());
    if (row.visibility !== 'private') spot.allPrivate = false;
    if (!spot.thumb && row.image_url) spot.thumb = row.image_url;
    // Running average keeps the pin centred on the actual finds.
    spot.lat += (row.latitude - spot.lat) / spot.count;
    spot.lng += (row.longitude - spot.lng) / spot.count;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.lastVisit < b.lastVisit ? 1 : -1));
}

export default async function MineStederPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/mine-steder');

  const { data } = await supabase
    .from('findings')
    .select(
      'id, location_name, latitude, longitude, found_at, image_url, visibility, species_name_override, mushroom_species(norwegian_name)'
    )
    .eq('user_id', user.id)
    .order('found_at', { ascending: false })
    .limit(1000);

  const spots = groupFindings((data ?? []) as unknown as FindingRow[]);
  const totalFinds = spots.reduce((sum, s) => sum + s.count, 0);

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">Bare synlig for deg</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">Mine steder</h1>
          <p className="mt-1 text-sm text-gray-700">
            Soppstedene dine, samlet på ett sted — også de hemmelige. {totalFinds > 0 ? `${totalFinds} funn fordelt på ${spots.length} steder.` : ''}
          </p>
        </header>

        {spots.length === 0 ? (
          <article className="rounded-2xl bg-white p-6 text-center shadow-card">
            <p className="text-4xl">🍄</p>
            <h2 className="mt-2 font-serif text-xl font-semibold text-forest-900">Ingen steder ennå</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-700">
              Når du logger funn, bygger Mycelet automatisk din private oversikt over hvor du finner sopp — år etter år.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/identify"
                className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
              >
                <Camera className="h-4 w-4" /> Identifiser et funn
              </Link>
              <Link
                href="/map"
                className="inline-flex items-center gap-1.5 rounded-full border border-forest-300 bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50"
              >
                <MapIcon className="h-4 w-4" /> Logg på kartet
              </Link>
            </div>
          </article>
        ) : (
          <ul className="space-y-3">
            {spots.map((spot) => {
              const topSpecies = [...spot.species.entries()].sort((a, b) => b[1] - a[1]);
              const shown = topSpecies.slice(0, 4);
              const more = topSpecies.length - shown.length;
              const years = [...spot.years].sort((a, b) => b - a);
              return (
                <li key={`${spot.label}-${spot.lat}`} className="overflow-hidden rounded-2xl bg-white shadow-card">
                  <div className="flex">
                    {spot.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={spot.thumb} alt="" className="h-auto w-24 shrink-0 object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="flex min-w-0 items-center gap-1.5 font-serif text-lg font-semibold leading-tight text-forest-950">
                          <MapPin className="h-4 w-4 shrink-0 text-forest-700" />
                          <span className="truncate">{spot.label}</span>
                        </h2>
                        {spot.allPrivate ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-forest-100 px-2 py-0.5 text-[11px] font-semibold text-forest-900">
                            <Lock className="h-3 w-3" /> Hemmelig sted
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {spot.count} funn · {spot.species.size} arter · sist{' '}
                        {new Date(spot.lastVisit).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {years.length > 1 ? ` · ${years.length} sesonger (${years[years.length - 1]}–${years[0]})` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {shown.map(([name, n]) => (
                          <span key={name} className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-900">
                            {name}
                            {n > 1 ? ` ×${n}` : ''}
                          </span>
                        ))}
                        {more > 0 ? <span className="px-1 py-0.5 text-[11px] text-gray-500">+{more} til</span> : null}
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest-800 underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Åpne i kart
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-gray-500">
          🔒 Steder der alle funn er private, er merket som hemmelige. Posisjonene her vises aldri til andre — offentlige funn
          deles kun med den synligheten du valgte da du logget dem.
        </p>
      </section>
    </PageWrapper>
  );
}
