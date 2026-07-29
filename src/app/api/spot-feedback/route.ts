import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { fetchWeatherSummary } from '@/lib/weather';
import { getForestProperties } from '@/lib/forest';
import { bestEffortFieldContext } from '@/lib/findings/field-context';

/**
 * "Etter at du besøkte stedet: fant du sopp?" — one tap of ground truth per
 * Lovende steder-pin.
 * Inserts run as the logged-in user so RLS guarantees user_id integrity.
 * Coordinates are rounded to ~1 m precision as sent; the row is only readable
 * by the user themselves + the service role (see migration 021).
 */

export const runtime = 'nodejs';
export const maxDuration = 15;

function shortText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 100)
    : fallback;
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    const rl = checkRateLimit(`spot-feedback:${getClientKey(request, user.id)}`, 30, 60);
    if (!rl.allowed) {
      return rateLimitResponse(rl);
    }

    const body = await request.json().catch(() => null);
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const found = body?.found;
    const scoreRaw = body?.scoreShown == null ? null : Math.round(Number(body.scoreShown));
    const speciesRaw = body?.speciesId == null ? null : Number(body.speciesId);
    const visitedRaw = typeof body?.visitedAt === 'string' ? Date.parse(body.visitedAt) : Date.now();

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180 ||
      typeof found !== 'boolean' ||
      !Number.isFinite(visitedRaw) ||
      visitedRaw > Date.now() + 24 * 60 * 60 * 1000 ||
      visitedRaw < Date.now() - 90 * 24 * 60 * 60 * 1000
    ) {
      return NextResponse.json({ error: 'Ugyldig tilbakemelding' }, { status: 400 });
    }

    const capturedAt = new Date().toISOString();
    const { weather, forest } = await bestEffortFieldContext(
      fetchWeatherSummary({ lat, lon: lng }),
      getForestProperties({ lat, lon: lng })
    );

    const { error } = await supabase.from('spot_feedback').insert({
      user_id: user.id,
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      found,
      score_shown: scoreRaw != null && Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : null,
      species_id: speciesRaw != null && Number.isInteger(speciesRaw) && speciesRaw > 0 ? speciesRaw : null,
      visited_at: new Date(visitedRaw).toISOString(),
      model_version: shortText(body?.modelVersion, 'v4_species_spots_habitat'),
      prediction_source: shortText(body?.predictionSource, 'computed_top_spots'),
      weather_source: weather?.source ?? null,
      score_components: {
        weather,
        forest
      },
      context: {
        schemaVersion: 1,
        capturedAt
      }
    });

    if (error) {
      // 42P01 = table missing (migration 021 not applied yet) — degrade politely.
      log.error('spot_feedback.insert_failed', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'Kunne ikke lagre tilbakemeldingen' }, { status: 500 });
    }

    log.info('spot_feedback.saved', {
      found,
      scoreShown: scoreRaw,
      weatherCaptured: weather !== null,
      habitatCaptured: forest !== null
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('spot_feedback.failed', error);
    return NextResponse.json({ error: 'Kunne ikke lagre tilbakemeldingen' }, { status: 500 });
  }
}
