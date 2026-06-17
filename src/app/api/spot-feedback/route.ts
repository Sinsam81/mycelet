import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * "Var du her? Fant du sopp?" — one tap of ground truth per Lovende steder-pin.
 * Inserts run as the logged-in user so RLS guarantees user_id integrity.
 * Coordinates are rounded to ~1 m precision as sent; the row is only readable
 * by the user themselves + the service role (see migration 021).
 */

export const runtime = 'nodejs';

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

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180 ||
      typeof found !== 'boolean'
    ) {
      return NextResponse.json({ error: 'Ugyldig tilbakemelding' }, { status: 400 });
    }

    const { error } = await supabase.from('spot_feedback').insert({
      user_id: user.id,
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      found,
      score_shown: scoreRaw != null && Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : null,
      species_id: speciesRaw != null && Number.isFinite(speciesRaw) ? speciesRaw : null
    });

    if (error) {
      // 42P01 = table missing (migration 021 not applied yet) — degrade politely.
      log.error('spot_feedback.insert_failed', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'Kunne ikke lagre tilbakemeldingen' }, { status: 500 });
    }

    log.info('spot_feedback.saved', { found, scoreShown: scoreRaw });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error('spot_feedback.failed', error);
    return NextResponse.json({ error: 'Kunne ikke lagre tilbakemeldingen' }, { status: 500 });
  }
}
