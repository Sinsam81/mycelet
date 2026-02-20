import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { createClient } from '@/lib/supabase/server';

interface PredictionTileRow {
  id: string;
  tile_date: string;
  species_id: number | null;
  source: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  score: number;
  confidence: number | null;
  metadata: {
    region?: string;
    [key: string]: unknown;
  } | null;
}

interface SpeciesOption {
  id: number;
  norwegian_name: string;
  latin_name: string;
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function PredictionAdminPage({
  searchParams
}: {
  searchParams: {
    date?: string;
    region?: string;
    speciesId?: string;
    limit?: string;
  };
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/admin/prediction');
  }

  const { data: roleRow, error: roleError } = await supabase
    .from('moderator_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleError) {
    return (
      <PageWrapper>
        <section className="space-y-3">
          <h1 className="text-xl font-semibold">Prediction Tiles (Admin)</h1>
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            Kunne ikke validere tilgang: {roleError.message}
          </p>
          <Link href="/map" className="text-sm font-medium text-forest-800 hover:underline">
            Tilbake til kart
          </Link>
        </section>
      </PageWrapper>
    );
  }

  const userRole = roleRow?.role ?? null;
  const hasAccess = userRole === 'moderator' || userRole === 'admin';

  if (!hasAccess) {
    return (
      <PageWrapper>
        <section className="space-y-3">
          <h1 className="text-xl font-semibold">Prediction Tiles (Admin)</h1>
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Du har ikke tilgang til denne siden. Rollen din må være moderator eller admin.
          </p>
          <Link href="/map" className="text-sm font-medium text-forest-800 hover:underline">
            Tilbake til kart
          </Link>
        </section>
      </PageWrapper>
    );
  }

  const selectedDate = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const selectedRegion = (searchParams.region ?? '').trim();
  const selectedSpeciesId = parseNumber(searchParams.speciesId, 0);
  const limit = Math.max(20, Math.min(500, parseNumber(searchParams.limit, 150)));

  let query = supabase
    .from('prediction_tiles')
    .select('id,tile_date,species_id,source,center_lat,center_lng,radius_meters,score,confidence,metadata')
    .eq('tile_date', selectedDate)
    .order('score', { ascending: false })
    .limit(limit);

  if (selectedSpeciesId > 0) {
    query = query.eq('species_id', selectedSpeciesId);
  }

  const [{ data: tilesData, error: tilesError }, { data: speciesData }] = await Promise.all([
    query,
    supabase.from('mushroom_species').select('id,norwegian_name,latin_name').order('norwegian_name', { ascending: true }).limit(200)
  ]);

  let tiles = (tilesData ?? []) as PredictionTileRow[];
  if (selectedRegion) {
    tiles = tiles.filter((tile) => String(tile.metadata?.region ?? '') === selectedRegion);
  }

  const regions = Array.from(new Set(tiles.map((tile) => String(tile.metadata?.region ?? '')).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'nb')
  );
  const speciesOptions = (speciesData ?? []) as SpeciesOption[];

  const count = tiles.length;
  const avgScore = count > 0 ? Math.round(tiles.reduce((sum, tile) => sum + tile.score, 0) / count) : 0;
  const highScoreCount = tiles.filter((tile) => tile.score >= 70).length;
  const avgConfidence =
    count > 0 ? Math.round(tiles.reduce((sum, tile) => sum + Number(tile.confidence ?? 0), 0) / count) : 0;

  return (
    <PageWrapper>
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Prediction Tiles (Admin)</h1>
            <p className="text-sm text-gray-600">Inspeksjon av pregenererte heatmap-data for valgt dato.</p>
            <p className="text-xs text-gray-500">Innlogget rolle: {userRole}</p>
          </div>
          <Link href="/map" className="text-sm font-medium text-forest-800 hover:underline">
            Til SoppKart
          </Link>
        </div>

        <form className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-4">
          <label className="text-xs font-medium text-gray-700">
            Dato
            <input type="date" name="date" defaultValue={selectedDate} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Region
            <input
              type="text"
              name="region"
              defaultValue={selectedRegion}
              placeholder={regions[0] ?? 'Oslo'}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Art
            <select name="speciesId" defaultValue={selectedSpeciesId > 0 ? String(selectedSpeciesId) : ''} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Alle arter</option>
              {speciesOptions.map((species) => (
                <option key={species.id} value={species.id}>
                  {species.norwegian_name} ({species.latin_name})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-700">
            Limit
            <input type="number" name="limit" defaultValue={limit} min={20} max={500} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="md:col-span-4 rounded bg-forest-800 px-3 py-2 text-sm font-medium text-white hover:bg-forest-700">
            Oppdater
          </button>
        </form>

        {tilesError ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">Kunne ikke hente prediction_tiles: {tilesError.message}</p> : null}

        <div className="grid gap-2 md:grid-cols-4">
          <article className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Fliser</p>
            <p className="text-lg font-semibold">{count}</p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Snittscore</p>
            <p className="text-lg font-semibold">{avgScore}</p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Score ≥ 70</p>
            <p className="text-lg font-semibold">{highScoreCount}</p>
          </article>
          <article className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-600">Snitt confidence</p>
            <p className="text-lg font-semibold">{avgConfidence}</p>
          </article>
        </div>

        <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-700">
              <tr>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Koordinat</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Art ID</th>
                <th className="px-3 py-2">Kilde</th>
              </tr>
            </thead>
            <tbody>
              {tiles.map((tile) => (
                <tr key={tile.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold">{tile.score}</td>
                  <td className="px-3 py-2">{tile.confidence ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {tile.center_lat}, {tile.center_lng}
                  </td>
                  <td className="px-3 py-2 text-xs">{String(tile.metadata?.region ?? '-')}</td>
                  <td className="px-3 py-2">{tile.species_id ?? '-'}</td>
                  <td className="px-3 py-2">{tile.source}</td>
                </tr>
              ))}
              {tiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-600">
                    Ingen prediction tiles for valgt filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </PageWrapper>
  );
}
