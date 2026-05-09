import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

type VerifiedRole = 'trusted_forager' | 'expert' | 'community_verifier' | 'moderator';

interface VerifiedForagerRow {
  user_id: string;
  role: VerifiedRole;
  badge_label: string | null;
  note: string | null;
}

async function requireModerator() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: 'Ikke autentisert' };
  }

  const { data: roleRow, error } = await supabase.from('moderator_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }

  const role = roleRow?.role ?? null;
  if (role !== 'moderator' && role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Ingen tilgang' };
  }

  return { ok: true as const, userId: user.id };
}

export async function GET(request: NextRequest) {
  const access = await requireModerator();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rateLimit = checkRateLimit(`admin-verified-foragers:get:${getClientKey(request, access.userId)}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const admin = createAdminClient();

  let profileQuery = admin.from('profiles').select('id,username,display_name,created_at').order('created_at', { ascending: false }).limit(200);
  if (q.length >= 2) {
    profileQuery = profileQuery.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  }

  const [{ data: profiles, error: profilesError }, { data: verifiedRows, error: verifiedError }] = await Promise.all([
    profileQuery,
    admin.from('verified_foragers').select('user_id,role,badge_label,note')
  ]);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (verifiedError) {
    return NextResponse.json({ error: verifiedError.message }, { status: 500 });
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

  const access = await requireModerator();
  if (!access.ok) {
    log.warn('admin.verified_forager.upsert.denied', { reason: access.error });
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const actorLog = log.child({ userId: access.userId });

  const rateLimit = checkRateLimit(`admin-verified-foragers:post:${getClientKey(request, access.userId)}`, 30, 60);
  if (!rateLimit.allowed) {
    actorLog.warn('admin.verified_forager.upsert.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  const body = (await request.json()) as {
    userId?: string;
    role?: VerifiedRole;
    badgeLabel?: string | null;
    note?: string | null;
  };

  if (!body.userId || !body.role) {
    actorLog.warn('admin.verified_forager.upsert.bad_request');
    return NextResponse.json({ error: 'Mangler userId eller role' }, { status: 400 });
  }

  const allowedRoles: VerifiedRole[] = ['trusted_forager', 'expert', 'community_verifier', 'moderator'];
  if (!allowedRoles.includes(body.role)) {
    actorLog.warn('admin.verified_forager.upsert.invalid_role', { role: body.role });
    return NextResponse.json({ error: 'Ugyldig role' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('verified_foragers').upsert(
    {
      user_id: body.userId,
      role: body.role,
      badge_label: body.badgeLabel?.trim() || null,
      note: body.note?.trim() || null
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    actorLog.error('admin.verified_forager.upsert.db_error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    actorId: access.userId,
    action: 'verified_forager.upsert',
    targetUserId: body.userId,
    metadata: {
      role: body.role,
      badgeLabel: body.badgeLabel?.trim() || null,
      note: body.note?.trim() || null
    },
    request
  });

  actorLog.info('admin.verified_forager.upsert.success', {
    targetUserId: body.userId,
    role: body.role
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('admin.verified_forager.delete.start');

  const access = await requireModerator();
  if (!access.ok) {
    log.warn('admin.verified_forager.delete.denied', { reason: access.error });
    return NextResponse.json({ error: access.error }, { status: access.status });
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
    return NextResponse.json({ error: 'Mangler userId' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('verified_foragers').delete().eq('user_id', userId);
  if (error) {
    actorLog.error('admin.verified_forager.delete.db_error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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

