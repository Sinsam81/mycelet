import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties, buildSpeciesHabitatPreferences } from '@/lib/forest';
import { computeCellPrediction } from '@/lib/prediction/cell-score';
import { dayOfYearOf } from '@/lib/prediction/phenology';
import type { SpeciesContext } from '@/lib/utils/species-scoring';
import { createRequestLogger } from '@/lib/log/request';

/**
 * Daily prediction-tile generator.
 *
 * Precomputes a per-species probability grid from REAL data (NIBIO forest +
 * MET Frost weather + the shared cell scoring) and writes it to
 * prediction_tiles. The live /api/prediction route then serves these
 * precomputed scores instead of recomputing per request.
 *
 * Secured with CRON_SECRET (same pattern as the retention Edge Functions),
 * intended to be triggered daily by cron-job.org. Generate one region at a
 * time with ?region=Oslo to stay within serverless time limits.
 */

export const maxDuration = 300; // seconds (Vercel Pro); localhost is unbounded

interface Region {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  step: number;
}

const REGIONS: Region[] = [
  { name: 'Oslo', minLat: 59.72, maxLat: 60.05, minLng: 10.35, maxLng: 11.15, step: 0.06 },
  { name: 'Trondheim', minLat: 63.28, maxLat: 63.52, minLng: 10.2, maxLng: 10.65, step: 0.07 },
  { name: 'Bergen', minLat: 60.2, maxLat: 60.52, minLng: 5.05, maxLng: 5.6, step: 0.07 },
  { name: 'Stavanger', minLat: 58.85, maxLat: 59.05, minLng: 5.6, maxLng: 6.1, step: 0.07 },
  { name: 'Innlandet', minLat: 60.7, maxLat: 61.0, minLng: 11.0, maxLng: 11.6, step: 0.07 }
];

// Prediction species, looked up by latin name (so we don't depend on row ids
// being stable). Five autumn v1 species + two spring morels — together they
// give the map a useful species in season from spring through late autumn.
const V1_LATIN_NAMES = [
  'Cantharellus cibarius', // kantarell
  'Boletus edulis', // steinsopp
  'Craterellus tubaeformis', // traktkantarell
  'Hydnum repandum', // piggsopp
  'Craterellus cornucopioides', // svart trompetsopp
  'Morchella esculenta', // vanlig morkel (vår)
  'Morchella elata' // spiss morkel (vår)
];

interface SpeciesRow {
  id: number;
  latin_name: string;
  genus: string | null;
  season_start: number;
  season_end: number;
  peak_season_start: number | null;
  peak_season_end: number | null;
  habitat: string[] | null;
  mycorrhizal_partners: string[] | null;
}

function gridCells(region: Region): Array<{ lat: number; lng: number }> {
  const cells: Array<{ lat: number; lng: number }> = [];
  for (let lat = region.minLat; lat <= region.maxLat; lat += region.step) {
    for (let lng = region.minLng; lng <= region.maxLng; lng += region.step) {
      cells.push({ lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) });
    }
  }
  return cells;
}

/** Run an async fn over items with bounded concurrency (gentle on NIBIO). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    log.warn('generate_tiles.unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const regionFilter = new URL(request.url).searchParams.get('region');
  const regions = regionFilter
    ? REGIONS.filter((r) => r.name.toLowerCase() === regionFilter.toLowerCase())
    : REGIONS;
  if (regions.length === 0) {
    return NextResponse.json({ error: `Ukjent region: ${regionFilter}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: speciesData, error: speciesErr } = await supabase
    .from('mushroom_species')
    .select(
      'id,latin_name,genus,season_start,season_end,peak_season_start,peak_season_end,habitat,mycorrhizal_partners'
    )
    .in('latin_name', V1_LATIN_NAMES);

  if (speciesErr || !speciesData || speciesData.length === 0) {
    log.error('generate_tiles.species_load_failed', speciesErr);
    return NextResponse.json({ error: 'Kunne ikke laste v1-arter' }, { status: 500 });
  }
  const species = speciesData as SpeciesRow[];

  const tileDate = new Date().toISOString().slice(0, 10);
  const month = new Date().getMonth() + 1;
  const dayOfYear = dayOfYearOf(new Date());
  const generated: Record<string, number> = {};

  for (const region of regions) {
    // Weather is fetched once per region (it varies slowly over a city area).
    const weather = await fetchWeatherSummary({
      lat: (region.minLat + region.maxLat) / 2,
      lon: (region.minLng + region.maxLng) / 2
    });
    if (!weather) {
      log.warn('generate_tiles.no_weather', { region: region.name });
      generated[region.name] = 0;
      continue;
    }
    const weatherInput = {
      temperature: weather.temperatureC,
      humidity: weather.humidityPct,
      rain3dMm: weather.rain3dMm,
      soilMoistureIndex: weather.soilMoistureIndex
    };

    const cells = gridCells(region);
    // Forest is per cell but species-agnostic — fetch once per cell.
    const forests = await mapLimit(cells, 5, (c) => getForestProperties({ lat: c.lat, lon: c.lng }));

    const rows = cells.flatMap((cell, ci) => {
      const forest = forests[ci];
      return species.map((sp) => {
        const speciesCtx: SpeciesContext = {
          speciesId: sp.id,
          latinName: sp.latin_name,
          genus: sp.genus,
          seasonStart: sp.season_start,
          seasonEnd: sp.season_end,
          peakSeasonStart: sp.peak_season_start,
          peakSeasonEnd: sp.peak_season_end
        };
        const prediction = computeCellPrediction({
          lat: cell.lat,
          lon: cell.lng,
          month,
          dayOfYear,
          weather: weatherInput,
          forest,
          species: speciesCtx,
          speciesHabitat: buildSpeciesHabitatPreferences({
            mycorrhizalPartners: sp.mycorrhizal_partners,
            habitat: sp.habitat
          })
        });
        return {
          tile_date: tileDate,
          species_id: sp.id,
          source: 'hybrid' as const,
          center_lat: cell.lat,
          center_lng: cell.lng,
          radius_meters: 500,
          score: prediction.score,
          confidence: forest ? 70 : 45,
          components: {
            vegetation: prediction.factors.vegetation,
            moisture: prediction.factors.moisture,
            terrain: prediction.factors.terrain,
            soil: prediction.factors.soil,
            weatherTrend: prediction.factors.weatherTrend,
            history: prediction.components.historical,
            environment: prediction.components.environment,
            seasonal: prediction.components.seasonal,
            forest: forest
              ? {
                  forestType: forest.forestType,
                  productivity: forest.productivity,
                  volumePerHa: forest.volumePerHa,
                  source: forest.source
                }
              : null,
            habitat: prediction.habitat
              ? { score: prediction.habitat.score, reasons: prediction.habitat.reasons }
              : null
          },
          metadata: { region: region.name, grid_size_deg: region.step }
        };
      });
    });

    // Replace today's hybrid tiles for this region (idempotent re-runs).
    const { error: delErr } = await supabase
      .from('prediction_tiles')
      .delete()
      .eq('tile_date', tileDate)
      .eq('source', 'hybrid')
      .contains('metadata', { region: region.name });
    if (delErr) {
      log.error('generate_tiles.delete_failed', delErr);
      return NextResponse.json({ error: delErr.message, region: region.name }, { status: 500 });
    }

    const { error: insErr } = await supabase.from('prediction_tiles').insert(rows);
    if (insErr) {
      log.error('generate_tiles.insert_failed', insErr);
      return NextResponse.json({ error: insErr.message, region: region.name }, { status: 500 });
    }

    generated[region.name] = rows.length;
    log.info('generate_tiles.region_done', {
      region: region.name,
      tiles: rows.length,
      cells: cells.length,
      weatherSource: weather.source
    });
  }

  return NextResponse.json({ ok: true, tileDate, species: species.length, generated });
}

// Vercel Cron sends GET (with CRON_SECRET as a bearer when the env var is set).
// Delegate so the endpoint works from Vercel cron, cron-job.org (GET or POST),
// and manual testing alike. Auth + logic live in POST.
export async function GET(request: NextRequest) {
  return POST(request);
}
