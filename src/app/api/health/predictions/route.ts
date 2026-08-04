import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import {
  assessTileFreshness,
  previousDate,
  withinCronGraceWindow,
  type RegionTileState
} from '@/lib/prediction/tile-freshness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dedicated liveness check for the prediction product, separate from general
 * app availability. A stale tile batch should alert operators without making
 * the whole application look offline to deployment health checks.
 */
export async function GET(request: NextRequest) {
  // Ett kall = fem spørringer mot prediction_tiles MED tjenestenøkkelen, uten
  // innlogging. Ruta er offentlig og gjettbar, så en løkke mot den kunne presse
  // Supabase-poolen for ekte brukere. 10/min holder for enhver overvåkingsprobe.
  const rl = checkRateLimit(`health-predictions:${getClientKey(request, null)}`, 10, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  const now = new Date();
  const expectedDate = now.toISOString().slice(0, 10);
  // Mellom midnatt UTC og cron-en har kjørt finnes det ingen fliser for dagens
  // dato. Det er normalt, ikke degradert — se tile-freshness.ts.
  const graceDate = withinCronGraceWindow(now) ? previousDate(expectedDate) : null;
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

  const assessment = assessTileFreshness(states, expectedDate, graceDate);
  return NextResponse.json(
    {
      status: assessment.fresh ? 'ok' : 'degraded',
      expectedDate,
      // Står her når gårsdagens fliser fortsatt teller som ferske, så en
      // operatør ser hvorfor svaret er 200 uten dagens dato i regions.
      acceptedFallbackDate: graceDate,
      // To kjøringer siden 2026-08-03: det svenske skogoppslaget er elleve
      // ganger tregere enn det norske, og landene får ikke plass i samme
      // maxDuration. Se vercel.json og tile-regions.ts.
      schedule: 'NO 15 1 * * * · SE 45 1 * * * (UTC)',
      regions: assessment.regions
    },
    {
      status: assessment.fresh ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
}
