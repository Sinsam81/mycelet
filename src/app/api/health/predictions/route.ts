import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { assessTileFreshness, type RegionTileState } from '@/lib/prediction/tile-freshness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dedicated liveness check for the prediction product, separate from general
 * app availability. A stale tile batch should alert operators without making
 * the whole application look offline to deployment health checks.
 */
export async function GET() {
  const expectedDate = new Date().toISOString().slice(0, 10);
  const supabase = createAdminClient();

  const states = await Promise.all(
    PREDICTION_TILE_REGIONS.map(async (region): Promise<RegionTileState> => {
      const { data, error } = await supabase
        .from('prediction_tiles')
        .select('tile_date,updated_at')
        .eq('source', 'hybrid')
        .contains('metadata', { region: region.name })
        .order('tile_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        region: region.name,
        tileDate: (data?.tile_date as string | undefined) ?? null,
        updatedAt: (data?.updated_at as string | undefined) ?? null,
        ...(error ? { error: error.message } : {})
      };
    })
  );

  const assessment = assessTileFreshness(states, expectedDate);
  return NextResponse.json(
    {
      status: assessment.fresh ? 'ok' : 'degraded',
      expectedDate,
      schedule: '15 1 * * * (UTC)',
      regions: assessment.regions
    },
    {
      status: assessment.fresh ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
