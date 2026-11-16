import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { apiFeil, loggFeil, type ApiFeilKode } from '@/lib/api/feil';
import { inneholderMonster } from '@/lib/api/postgrest-filter';
import type { Logger } from '@/lib/log';

type VerifiedRole = 'trusted_forager' | 'expert' | 'community_verifier' | 'moderator';

interface VerifiedForagerRow {
  user_id: string;
  role: VerifiedRole;
  badge_label: string | null;
  note: string | null;
}

/**
 * `user_id` er en uuid-kolonne. Alt annet enn en uuid ga 22P02 fra Postgres —
 * en 500 for det som er et ugyldig kall — og verdien gikk urørt inn i en
 * spørring med tjenesterollen. Avvises nå før databasen ser den.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lengste søketekst vi sender videre. Brukernavn og visningsnavn er langt kortere. */
const MAKS_SOKELENGDE = 80;

/** Fritekstfeltene fra skjemaet: tekst, eller ingenting. Aldri et tall eller et objekt. */
function valgfriTekst(verdi: unknown): string | null {
  return typeof verdi === 'string' ? verdi.trim() || null : null;
}

/**
 * Hvem som slipper inn. Et avslag er en KODE, ikke en setning: handlerne
 * bygger svaret med apiFeil, så teksten følger leserens språk.
 *
 * Rolleoppslaget svarte før med `error.message` — den rå databasemeldingen —
 * til en hvilken som helst innlogget bruker som traff ruta mens oppslaget
 * feilet. Den logges nå her, og svaret er den generelle feilen.
 */
async function requireModerator(
  log: Logger
): Promise<{ ok: true; userId: string } | { ok: false; status: number; kode: ApiFeilKode }> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, kode: 'unauthenticated' };
  }

  const { data: roleRow, error } = await supabase.from('moderator_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (error) {
    loggFeil(log, 'admin.verified_forager.role_lookup_failed', error, { userId: user.id });
    return { ok: false, status: 500, kode: 'unexpected' };
  }

  const role = roleRow?.role ?? null;
  if (role !== 'moderator' && role !== 'admin') {
    return { ok: false, status: 403, kode: 'forbidden' };
  }

  return { ok: true, userId: user.id };
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const access = await requireModerator(log);
  if (!access.ok) {
    return apiFeil(access.kode, access.status);
  }

  const rateLimit = checkRateLimit(`admin-verified-foragers:get:${getClientKey(request, access.userId)}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAKS_SOKELENGDE);
  const admin = createAdminClient();

  let profileQuery = admin.from('profiles').select('id,username,display_name,created_at').order('created_at', { ascending: false }).limit(200);
  if (q.length >= 2) {
    // Søketeksten sto rett i filterstrengen: `...ilike.%${q}%`. `.or()` tar
    // hele filteret som tekst, så et komma i søket var et nytt vilkår, og
    // klienten her er tjenesterollen. inneholderMonster gjør teksten til ÉN
    // verdi som bare matcher seg selv — se src/lib/api/postgrest-filter.ts.
    const monster = inneholderMonster(q);
    profileQuery = profileQuery.or(`username.ilike.${monster},display_name.ilike.${monster}`);
  }

  const [{ data: profiles, error: profilesError }, { data: verifiedRows, error: verifiedError }] = await Promise.all([
    profileQuery,
    admin.from('verified_foragers').select('user_id,role,badge_label,note')
  ]);

  // Begge svarte med den rå databasemeldingen, og ingen av dem ble logget.
  if (profilesError) {
    loggFeil(log, 'admin.verified_forager.list.profiles_failed', profilesError, { userId: access.userId });
    return apiFeil('admin_load_failed', 500);
  }

  if (verifiedError) {
    loggFeil(log, 'admin.verified_forager.list.verified_failed', verifiedError, { userId: access.userId });
    return apiFeil('admin_load_failed', 500);
  }

  const verifiedMap = new Map<string, VerifiedForagerRow>();
  for (const row of (verifiedRows ?? []) as VerifiedForagerRow[]) {
    verifiedMap.set(row.user_id, row);
  }

  const users = (profiles ?? []).map((profile) => {
    const verified = verifiedMap.get(profile.id) ?? null;
    return {
      id: profile.id as string,
      username: (profile.username as string | null) ?? null,
      displayName: (profile.display_name as string | null) ?? null,
      verified
    };
  });

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('admin.verified_forager.upsert.start');

  const access = await requireModerator(log);
  if (!access.ok) {
    log.warn('admin.verified_forager.upsert.denied', { reason: access.kode });
    return apiFeil(access.kode, access.status);
  }

  const actorLog = log.child({ userId: access.userId });

  const rateLimit = checkRateLimit(`admin-verified-foragers:post:${getClientKey(request, access.userId)}`, 30, 60);
  if (!rateLimit.allowed) {
    actorLog.warn('admin.verified_forager.upsert.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  // En kropp som ikke er JSON kastet her, utenfor enhver try — en 500 fra
  // plattformen i stedet for rutens eget svar. Samme utfall som et tomt kall.
  const raa: unknown = await request.json().catch(() => null);
  const body = (raa && typeof raa === 'object' ? raa : {}) as {
    userId?: unknown;
    role?: unknown;
    badgeLabel?: unknown;
    note?: unknown;
  };

  if (!body.userId || !body.role) {
    actorLog.warn('admin.verified_forager.upsert.bad_request');
    return apiFeil('invalid_request', 400, { hint: 'Mangler userId eller role' });
  }

  if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
    actorLog.warn('admin.verified_forager.upsert.invalid_userId');
    return apiFeil('invalid_request', 400, { hint: 'Ugyldig userId' });
  }
  const userId = body.userId;

  const allowedRoles: VerifiedRole[] = ['trusted_forager', 'expert', 'community_verifier', 'moderator'];
  if (typeof body.role !== 'string' || !(allowedRoles as string[]).includes(body.role)) {
    actorLog.warn('admin.verified_forager.upsert.invalid_role', { role: typeof body.role === 'string' ? body.role : null });
    return apiFeil('invalid_request', 400, { hint: 'Ugyldig role' });
  }
  const role = body.role as VerifiedRole;
  // `.trim()` på noe som ikke var tekst kastet — også det en 500.
  const badgeLabel = valgfriTekst(body.badgeLabel);
  const note = valgfriTekst(body.note);

  const admin = createAdminClient();
  const { error } = await admin.from('verified_foragers').upsert(
    {
      user_id: userId,
      role,
      badge_label: badgeLabel,
      note
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    loggFeil(actorLog, 'admin.verified_forager.upsert.db_error', error);
    return apiFeil('admin_save_failed', 500);
  }

  await logAdminAction({
    actorId: access.userId,
    action: 'verified_forager.upsert',
    targetUserId: userId,
    metadata: {
      role,
      badgeLabel,
      note
    },
    request
  });

  actorLog.info('admin.verified_forager.upsert.success', {
    targetUserId: userId,
    role
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('admin.verified_forager.delete.start');

  const access = await requireModerator(log);
  if (!access.ok) {
    log.warn('admin.verified_forager.delete.denied', { reason: access.kode });
    return apiFeil(access.kode, access.status);
  }

  const actorLog = log.child({ userId: access.userId });

  const rateLimit = checkRateLimit(`admin-verified-foragers:delete:${getClientKey(request, access.userId)}`, 30, 60);
  if (!rateLimit.allowed) {
    actorLog.warn('admin.verified_forager.delete.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    actorLog.warn('admin.verified_forager.delete.missing_userId');
    return apiFeil('invalid_request', 400, { hint: 'Mangler userId' });
  }
  if (!UUID.test(userId)) {
    actorLog.warn('admin.verified_forager.delete.invalid_userId');
    return apiFeil('invalid_request', 400, { hint: 'Ugyldig userId' });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('verified_foragers').delete().eq('user_id', userId);
  if (error) {
    loggFeil(actorLog, 'admin.verified_forager.delete.db_error', error);
    return apiFeil('admin_remove_failed', 500);
  }

  await logAdminAction({
    actorId: access.userId,
    action: 'verified_forager.delete',
    targetUserId: userId,
    request
  });

  actorLog.info('admin.verified_forager.delete.success', { targetUserId: userId });

  return NextResponse.json({ ok: true });
}

