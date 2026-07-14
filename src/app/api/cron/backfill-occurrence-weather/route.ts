import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger } from '@/lib/log/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRegion } from '@/lib/utils/region';
import { fetchHistoricalFrostFeatures } from '@/lib/weather/historical-frost';

export const maxDuration = 300;

const CORE_SPECIES_IDS = new Set([1, 2, 3, 4, 7]);
const SCAN_LIMIT = 1000;

interface OccurrenceRow {
  id: number;
  species_id: number | null;
  latitude: number;
  longitude: number;
  observed_at: string;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    log.warn('occurrence_weather_backfill.unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const speciesId = boundedInteger(params.get('speciesId'), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = boundedInteger(params.get('limit'), 10, 1, 25);
  const offset = boundedInteger(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  if (!CORE_SPECIES_IDS.has(speciesId)) {
    return NextResponse.json({ error: 'speciesId må være en støttet kjerneart' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('species_occurrences')
    .select('id,species_id,latitude,longitude,observed_at')
    .eq('species_id', speciesId)
    .not('observed_at', 'is', null)
    .gte('latitude', 57.7)
    .lte('latitude', 71.5)
    .gte('longitude', 4)
    .lte('longitude', 31.5)
    .order('id')
    .range(offset, offset + SCAN_LIMIT - 1);

  if (error) {
    log.error('occurrence_weather_backfill.occurrence_load_failed', error);
    return NextResponse.json({ error: 'Kunne ikke laste funnhistorikk' }, { status: 500 });
  }

  const norwegian = ((data ?? []) as OccurrenceRow[]).filter(
    (row) => getRegion(Number(row.latitude), Number(row.longitude)) === 'NO'
  );
  const existing = new Set<number>();
  for (let index = 0; index < norwegian.length; index += 200) {
    const ids = norwegian.slice(index, index + 200).map((row) => row.id);
    const { data: features, error: featureError } = await supabase
      .from('occurrence_weather_features')
      .select('occurrence_id')
      .in('occurrence_id', ids);
    if (featureError) {
      log.error('occurrence_weather_backfill.feature_load_failed', featureError);
      return NextResponse.json({ error: 'Kunne ikke kontrollere eksisterende værdata' }, { status: 500 });
    }
    for (const feature of features ?? []) existing.add(Number(feature.occurrence_id));
  }

  const attempted = norwegian.filter((row) => !existing.has(row.id)).slice(0, limit);
  const results = await mapLimit(attempted, 2, async (occurrence) => {
    try {
      const weather = await fetchHistoricalFrostFeatures({
        lat: Number(occurrence.latitude),
        lon: Number(occurrence.longitude),
        observedAt: occurrence.observed_at
      });
      return {
        row: {
          occurrence_id: occurrence.id,
          species_id: occurrence.species_id,
          observed_at: occurrence.observed_at,
          latitude: occurrence.latitude,
          longitude: occurrence.longitude,
          region: 'NO',
          provider: weather.provider,
          temperature_c: weather.temperatureC,
          humidity_pct: weather.humidityPct,
          rain_3d_mm: weather.rain3dMm,
          rain_7d_mm: weather.rain7dMm,
          rain_14d_mm: weather.rain14dMm,
          min_temp_7d_c: weather.minTemp7dC,
          max_temp_7d_c: weather.maxTemp7dC,
          soil_moisture_index: weather.soilMoistureIndex,
          source_station_ids: weather.sourceStationIds,
          error: null,
          updated_at: new Date().toISOString()
        },
        error: null
      };
    } catch (caught) {
      return {
        row: null,
        error: caught instanceof Error ? caught.message : 'unknown_error'
      };
    }
  });

  const rows = results.flatMap((result) => (result.row ? [result.row] : []));
  if (rows.length) {
    const { error: upsertError } = await supabase
      .from('occurrence_weather_features')
      .upsert(rows, { onConflict: 'occurrence_id' });
    if (upsertError) {
      log.error('occurrence_weather_backfill.upsert_failed', upsertError);
      return NextResponse.json({ error: 'Kunne ikke lagre historiske værdata' }, { status: 500 });
    }
  }

  const errors: Record<string, number> = {};
  for (const result of results) {
    if (result.error) errors[result.error] = (errors[result.error] ?? 0) + 1;
  }
  const report = {
    ok: true,
    speciesId,
    limit,
    offset,
    scanned: data?.length ?? 0,
    regionMatched: norwegian.length,
    existingSkipped: existing.size,
    attempted: attempted.length,
    featuresReady: rows.length,
    errors
  };
  log.info('occurrence_weather_backfill.completed', report);
  return NextResponse.json(report);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
