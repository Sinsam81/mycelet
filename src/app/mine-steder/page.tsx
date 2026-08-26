import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getJoinedSpeciesName } from '@/lib/utils/species-name';
import { Camera, ExternalLink, Lock, Map as MapIcon, MapPin } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';
import { intlLocale } from '@/lib/utils/intl-locale';
import { MyPlacesFilter } from '@/components/places/MyPlacesFilter';
import { GpxEksportKnapp } from '@/components/places/GpxEksportKnapp';
import { GpxImportKnapp } from '@/components/places/GpxImportKnapp';
import { MarkerteSteder, type Sted } from '@/components/places/MarkerteSteder';
import { MAKS_STEDER_PER_BRUKER } from '@/lib/steder/veipunkt';
import { logger } from '@/lib/log';

export async function generateMetadata() {
  const t = await getTranslations('MineSteder');
  return {
    title: t('metaTitle')
  };
}

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
    | { norwegian_name: string | null; swedish_name: string | null }
    | { norwegian_name: string | null; swedish_name: string | null }[]
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

function speciesName(row: FindingRow, unknownLabel: string, locale: string): string {
  return getJoinedSpeciesName(row.mushroom_species, locale) || row.species_name_override || unknownLabel;
}

function groupFindings(
  rows: FindingRow[],
  labels: { unknownSpecies: string; nearPlace: (lat: string, lng: string) => string },
  locale: string
): Spot[] {
  const groups = new Map<string, Spot>();
  for (const row of rows) {
    const named = !!row.location_name?.trim();
    const key = named
      ? `name:${row.location_name!.trim().toLowerCase()}`
      : `geo:${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`;
    let spot = groups.get(key);
    if (!spot) {
      spot = {
        label: named ? row.location_name!.trim() : labels.nearPlace(row.latitude.toFixed(3), row.longitude.toFixed(3)),
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
    const name = speciesName(row, labels.unknownSpecies, locale);
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
  const t = await getTranslations('MineSteder');
  const locale = await getLocale();
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/mine-steder');

  const { data, error } = await supabase
    .from('findings')
    .select(
      'id, location_name, latitude, longitude, found_at, image_url, visibility, species_name_override, mushroom_species(norwegian_name,swedish_name)'
    )
    .eq('user_id', user.id)
    .eq('is_negative_observation', false)
    .order('found_at', { ascending: false })
    .limit(1000);

  // Markerte steder (saved_places) er en ANNEN ting enn funn: ingen art, ingen
  // observasjonsdato, ingen synlighetsmodell. De teller derfor ikke i
  // funnstatistikken under, og blåser ikke opp «X funn, Y arter» på forsida.
  // Se docs/gpx-import-design.md.
  const { data: stederData, error: stederError } = await supabase
    .from('saved_places')
    .select('id, name, note, latitude, longitude, source_file, import_batch_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(MAKS_STEDER_PER_BRUKER);

  if (stederError) {
    logger.error('mine_steder.saved_places_failed', { userId: user.id, message: stederError.message });
  }
  const steder = (stederData ?? []) as Sted[];

  const spots = groupFindings((data ?? []) as unknown as FindingRow[], {
    unknownSpecies: t('unknownSpecies'),
    nearPlace: (lat, lng) => t('nearPlace', { lat, lng })
  }, locale);
  const totalFinds = spots.reduce((sum, s) => sum + s.count, 0);

  return (
    <PageWrapper>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-forest-700">{t('onlyVisibleToYou')}</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-forest-900">{t('heading')}</h1>
          <p className="mt-1 text-sm text-gray-700">
            {t('intro')} {totalFinds > 0 ? t('summary', { finds: totalFinds, places: spots.length }) : ''}
          </p>
          {/* Egne funn ut som GPX-veipunkter (Garmin, UT.no, Organic Maps),
              generert av /api/me/gpx. Gratis med vilje: dette er brukerens
              egne data, og å ta betalt for å få dem UT ville stått i mot både
              GDPR-eksport-presedensen og ærlighets-merkevaren. */}
          {/* Import står ved siden av eksport, og er synlig UANSETT om
              brukeren har funn fra før: en som kommer rett fra en annen app har
              null funn her, og det er nettopp da importen er verdt mest. */}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Fila inneholder BÅDE funn og markerte steder, så tallet må telle
                begge — og knappen må finnes for en bruker som bare har
                importert steder. Ellers ville importen vært en enveisdør. */}
            <GpxEksportKnapp antall={totalFinds + steder.length} />
            <GpxImportKnapp
              eksisterende={steder.map((sted) => ({ latitude: sted.latitude, longitude: sted.longitude }))}
              maks={MAKS_STEDER_PER_BRUKER}
            />
          </div>
        </header>

        {stederError ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t('placesLoadError')}
          </p>
        ) : (
          <MarkerteSteder steder={steder} />
        )}

        {/* Tom er ikke det samme som feilet. Ved en forbigående spørrefeil
            (RLS-endring, pool-metning, timeout) rendret siden tidligere
            tom-tilstanden med «du har ikke lagret noen steder ennå» — for en
            betalende bruker hvis eneste grunn til å betale ER de lagrede
            stedene, ser det ut som at dataene er slettet. */}
        {error ? (
          <article className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="font-serif text-lg font-semibold text-amber-900">{t('loadErrorHeading')}</h2>
            <p className="mt-1 text-sm text-amber-900">{t('loadErrorBody')}</p>
          </article>
        ) : spots.length === 0 && steder.length === 0 ? (
          <article className="rounded-2xl bg-white p-6 text-center shadow-card">
            <p className="text-4xl">🍄</p>
            <h2 className="mt-2 font-serif text-xl font-semibold text-forest-900">{t('emptyHeading')}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-700">
              {t('emptyBody')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/identify"
                className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
              >
                <Camera className="h-4 w-4" /> {t('identifyFinding')}
              </Link>
              <Link
                href="/map"
                className="inline-flex items-center gap-1.5 rounded-full border border-forest-300 bg-white px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-forest-50"
              >
                <MapIcon className="h-4 w-4" /> {t('logOnMap')}
              </Link>
            </div>
          </article>
        ) : (
          <MyPlacesFilter
            places={spots.map((s) => ({
              key: `${s.label}-${s.lat}`,
              label: s.label,
              species: [...s.species.keys()],
              count: s.count,
              lastVisit: s.lastVisit
            }))}
          >
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
                            <Lock className="h-3 w-3" /> {t('secretPlace')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {t('cardStats', { finds: spot.count, species: spot.species.size })}{' '}
                        {new Date(spot.lastVisit).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' })}
                        {years.length > 1 ? t('cardSeasons', { seasons: years.length, first: years[years.length - 1], last: years[0] }) : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {shown.map(([name, n]) => (
                          <span key={name} className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-900">
                            {name}
                            {n > 1 ? ` ×${n}` : ''}
                          </span>
                        ))}
                        {more > 0 ? <span className="px-1 py-0.5 text-[11px] text-gray-500">{t('moreSpecies', { count: more })}</span> : null}
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest-800 underline"
                      >
                        <ExternalLink className="h-3 w-3" /> {t('openInMap')}
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </MyPlacesFilter>
        )}

        <p className="text-xs text-gray-500">
          🔒 {t('privacyNote')}
        </p>
      </section>
    </PageWrapper>
  );
}
