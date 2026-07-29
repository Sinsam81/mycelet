import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties } from '@/lib/forest';
import {
  bestEffortFieldContext,
  buildWeatherSnapshot,
  deriveHabitatTags
} from '@/lib/findings/field-context';
import { parseFindingRequest } from '@/lib/findings/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * Owner-scoped finding insert with best-effort field instrumentation.
 * The browser uploads any image first, then this route snapshots weather and
 * public forest attributes while inserting through the user's RLS session.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });

    const rateLimit = checkRateLimit(`findings:${getClientKey(request, user.id)}`, 20, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const parsed = parseFindingRequest(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const finding = parsed.data;
    const capturedAt = new Date().toISOString();
    const { weather, forest } = await bestEffortFieldContext(
      fetchWeatherSummary({ lat: finding.latitude, lon: finding.longitude }),
      getForestProperties({ lat: finding.latitude, lon: finding.longitude })
    );

    const { data, error } = await supabase
      .from('findings')
      .insert({
        user_id: user.id,
        species_id: finding.speciesId,
        species_name_override: finding.speciesNameOverride,
        latitude: finding.latitude,
        longitude: finding.longitude,
        notes: finding.notes,
        visibility: finding.visibility,
        image_url: finding.imageUrl,
        thumbnail_url: finding.thumbnailUrl,
        is_zone_finding: finding.isZoneFinding,
        zone_label: finding.zoneLabel,
        zone_precision_km: finding.zonePrecisionKm,
        is_negative_observation: finding.isNegativeObservation,
        habitat_tags: deriveHabitatTags(forest),
        weather_at_observation: buildWeatherSnapshot(weather, capturedAt),
        ai_used: finding.aiUsed,
        ai_top_suggestion: finding.aiTopSuggestion,
        ai_confidence: finding.aiConfidence,
        ai_raw_response: finding.aiRawResponse,
        user_confirmed_species: finding.userConfirmedSpecies
      })
      .select('id')
      .single();

    if (error) {
      log.error('findings.insert_failed', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'Kunne ikke lagre funnet' }, { status: 500 });
    }

    log.info('findings.saved', {
      negative: finding.isNegativeObservation,
      weatherCaptured: weather !== null,
      habitatCaptured: forest !== null
    });
    return NextResponse.json({
      ok: true,
      id: data.id,
      instrumentation: {
        weatherCaptured: weather !== null,
        habitatCaptured: forest !== null
      }
    });
  } catch (error) {
    log.error('findings.failed', error);
    return NextResponse.json({ error: 'Kunne ikke lagre funnet' }, { status: 500 });
  }
}
