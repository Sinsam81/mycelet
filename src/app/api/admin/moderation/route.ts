import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { apiFeil, loggFeil, type ApiFeilKode } from '@/lib/api/feil';
import {
  AAPNE_RAPPORTSTATUSER,
  byggRapportvisning,
  erModerationAction,
  oppsummerAapneRapporter,
  type ModerationCommentRow,
  type ModerationFindingRow,
  type ModerationPostRow,
  type ModerationProfileRow,
  type ModerationReportRow
} from '@/lib/moderation/moderering';

/**
 * Moderasjon av meldt innhold.
 *
 * Før denne ruten kunne en moderator bare endre statusen på en rapport: hva som
 * var meldt ble aldri vist, og ingenting i appen kunne skjule et innlegg —
 * UPDATE-policyene på forum_posts og comments gjelder kun eieren. Et farlig råd
 * om en dødelig forvekslingsart kunne altså bare fjernes med håndskrevet SQL.
 * Apple (retningslinje 1.2) venter at en melding kan følges opp ved å fjerne
 * innholdet.
 *
 * Tilgangen sjekkes med øktklienten (moderator_roles), og selve arbeidet gjøres
 * med tjenesterollen: skjulte rader, og rader fra noen moderatoren selv har
 * blokkert, er usynlige gjennom RLS.
 *
 * Målet for en handling utledes ALLTID fra rapportraden på serveren. Klienten
 * sender bare rapport-id og handling — aldri tabell eller innholds-id — så
 * ruten ikke kan brukes til å skjule vilkårlig innhold.
 *
 * Funn har ingen `is_hidden` ennå og kan ikke skjules herfra; `deleted_at` er
 * eierens egen angrefrist (opprydningsjobben sletter raden og bildene for godt)
 * og skal ikke lånes til moderasjon. En funnrapport avsluttes derfor med
 * «løst» (`resolve`) når funnet er tatt hånd om for hånd, eller «avvist».
 *
 * Rapportens gang: pending → reviewed (sett, fortsatt åpen) → resolved eller
 * dismissed (avsluttet, med `resolved_at`). Skjuling løser alle åpne rapporter
 * på innholdet; vises innholdet igjen, åpnes de på nytt.
 */

async function requireModerator() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, kode: 'unauthenticated' as ApiFeilKode };
  }

  const { data: roleRow, error } = await supabase.from('moderator_roles').select('role').eq('user_id', user.id).maybeSingle();
  // Feilet oppslaget, vet vi ikke om brukeren er moderator. Da er svaret nei.
  if (error) {
    return { ok: false as const, status: 500, kode: 'moderation_access_check_failed' as ApiFeilKode };
  }

  const role = roleRow?.role ?? null;
  if (role !== 'moderator' && role !== 'admin') {
    return { ok: false as const, status: 403, kode: 'forbidden' as ApiFeilKode };
  }

  return { ok: true as const, userId: user.id };
}

const REPORT_COLUMNS = 'id,reason,description,status,created_at,post_id,comment_id,finding_id';
const MAKS_RAPPORTER = 100;

function unike(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0)));
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  const access = await requireModerator();
  if (!access.ok) {
    return apiFeil(access.kode, access.status);
  }

  const rateLimit = checkRateLimit(`admin-moderation:get:${getClientKey(request, access.userId)}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const visAlle = request.nextUrl.searchParams.get('status') === 'all';
  const admin = createAdminClient();

  // «Åpne» er pending OG reviewed — se AAPNE_RAPPORTSTATUSER. Lista og
  // tellingen under må bruke samme regel, ellers sier banneret noe annet enn
  // lista rett under det.
  const aapne = [...AAPNE_RAPPORTSTATUSER];
  let reportQuery = admin.from('reports').select(REPORT_COLUMNS).order('created_at', { ascending: false }).limit(MAKS_RAPPORTER);
  if (!visAlle) reportQuery = reportQuery.in('status', aapne);

  const [reportsRes, eldsteRes] = await Promise.all([
    reportQuery,
    admin
      .from('reports')
      .select('created_at', { count: 'exact' })
      .in('status', aapne)
      .order('created_at', { ascending: true })
      .limit(1)
  ]);

  if (reportsRes.error) {
    loggFeil(log, 'admin.moderation.list.db_error', reportsRes.error);
    return apiFeil('moderation_reports_load_failed', 500);
  }

  const reports = (reportsRes.data ?? []) as ModerationReportRow[];

  const commentIds = unike(reports.map((r) => r.comment_id));
  const findingIds = unike(reports.map((r) => r.finding_id));

  const [commentsRes, findingsRes] = await Promise.all([
    commentIds.length > 0
      ? admin.from('comments').select('id,user_id,post_id,content,is_hidden').in('id', commentIds)
      : Promise.resolve({ data: [], error: null }),
    findingIds.length > 0
      ? admin
          .from('findings')
          // Ingen koordinater, verken rå eller maskerte — se moderering.ts.
          // `is_zone_finding` må med: uten den kan ikke byggeren følge viewets
          // regel for når notatet er synlig.
          .select(
            'id,user_id,species_name_override,found_at,visibility,is_zone_finding,zone_label,notes,thumbnail_url,deleted_at,mushroom_species:species_id(norwegian_name,swedish_name)'
          )
          .in('id', findingIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const comments = (commentsRes.data ?? []) as ModerationCommentRow[];
  const findings = (findingsRes.data ?? []) as unknown as ModerationFindingRow[];

  // Innleggene som er meldt direkte, pluss trådene de meldte kommentarene står i.
  const postIds = unike([...reports.map((r) => r.post_id), ...comments.map((c) => c.post_id)]);
  const postsRes =
    postIds.length > 0
      ? await admin.from('forum_posts').select('id,user_id,title,content,images,is_hidden').in('id', postIds)
      : { data: [], error: null };
  const posts = (postsRes.data ?? []) as ModerationPostRow[];

  const authorIds = unike([...posts.map((p) => p.user_id), ...comments.map((c) => c.user_id), ...findings.map((f) => f.user_id)]);
  const profilesRes =
    authorIds.length > 0 ? await admin.from('profiles').select('id,username').in('id', authorIds) : { data: [], error: null };
  const profiles = (profilesRes.data ?? []) as ModerationProfileRow[];

  // Et oppslag som feiler gir «innholdet finnes ikke lenger» på de radene i
  // stedet for en tom konsoll — rapportene selv er det viktigste å få fram.
  for (const [navn, res] of [
    ['comments', commentsRes],
    ['findings', findingsRes],
    ['forum_posts', postsRes],
    ['profiles', profilesRes]
  ] as const) {
    if (res.error) log.warn('admin.moderation.list.enrich_failed', { table: navn, message: res.error.message });
  }

  const pending = oppsummerAapneRapporter({
    antall: eldsteRes.error ? 0 : eldsteRes.count ?? 0,
    eldsteOpprettet: (eldsteRes.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null,
    naa: new Date()
  });

  return NextResponse.json({
    reports: byggRapportvisning({ reports, posts, comments, findings, profiles }),
    pending
  });
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);

  const access = await requireModerator();
  if (!access.ok) {
    log.warn('admin.moderation.action.denied', { reason: access.kode });
    return apiFeil(access.kode, access.status);
  }

  const actorLog = log.child({ userId: access.userId });

  const rateLimit = checkRateLimit(`admin-moderation:post:${getClientKey(request, access.userId)}`, 30, 60);
  if (!rateLimit.allowed) {
    actorLog.warn('admin.moderation.action.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  let body: { reportId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiFeil('invalid_request', 400);
  }

  const reportId = typeof body.reportId === 'string' ? body.reportId : '';
  const action = body.action;
  if (!reportId || !erModerationAction(action)) {
    actorLog.warn('admin.moderation.action.bad_request');
    return apiFeil('invalid_request', 400, { hint: 'reportId (string) og action (moderation action) kreves' });
  }

  const admin = createAdminClient();

  const { data: reportRow, error: reportError } = await admin.from('reports').select(REPORT_COLUMNS).eq('id', reportId).maybeSingle();
  if (reportError) {
    loggFeil(actorLog, 'admin.moderation.action.report_lookup_failed', reportError);
    return apiFeil('moderation_report_load_failed', 500);
  }
  if (!reportRow) {
    return apiFeil('moderation_report_not_found', 404);
  }
  const report = reportRow as ModerationReportRow;

  // Målet kommer fra rapportraden, aldri fra forespørselen.
  const maal = report.post_id
    ? ({ table: 'forum_posts', id: report.post_id, column: 'post_id' } as const)
    : report.comment_id
      ? ({ table: 'comments', id: report.comment_id, column: 'comment_id' } as const)
      : null;

  let authorId: string | null = null;
  let varSkjult = false;
  if (maal) {
    const { data: targetRow, error: targetError } = await admin
      .from(maal.table)
      .select('id,user_id,is_hidden')
      .eq('id', maal.id)
      .maybeSingle();
    if (targetError) {
      loggFeil(actorLog, 'admin.moderation.action.target_lookup_failed', targetError);
      return apiFeil('moderation_content_load_failed', 500);
    }
    const target = targetRow as { user_id?: string | null; is_hidden?: boolean | null } | null;
    authorId = target?.user_id ?? null;
    varSkjult = target?.is_hidden === true;
    if (!targetRow && (action === 'hide' || action === 'unhide')) {
      return apiFeil('moderation_content_gone', 404);
    }
  }

  const naa = new Date().toISOString();
  const aapneStatuser = [...AAPNE_RAPPORTSTATUSER];

  if (action === 'hide' || action === 'unhide') {
    if (!maal) {
      return apiFeil('moderation_finding_not_hideable', 400);
    }

    const { error: hideError } = await admin.from(maal.table).update({ is_hidden: action === 'hide' }).eq('id', maal.id);
    if (hideError) {
      loggFeil(actorLog, 'admin.moderation.action.hide_failed', hideError);
      return apiFeil('moderation_content_update_failed', 500);
    }

    if (action === 'hide') {
      // Alle åpne rapporter på samme innhold er besvart av den samme handlingen.
      const { error: siblingsError } = await admin
        .from('reports')
        .update({ status: 'resolved', resolved_at: naa })
        .eq(maal.column, maal.id)
        .in('status', aapneStatuser);
      if (siblingsError) actorLog.warn('admin.moderation.action.resolve_failed', { message: siblingsError.message });

      // Ble innholdet skjult fra en rapport som alt var avvist, skal også den
      // stå som løst — ellers sier rapporten «avvist» om innhold som er fjernet.
      if (report.status === 'dismissed') {
        const { error: ownError } = await admin.from('reports').update({ status: 'resolved', resolved_at: naa }).eq('id', report.id);
        if (ownError) actorLog.warn('admin.moderation.action.resolve_failed', { message: ownError.message });
      }
    } else if (varSkjult) {
      // Skjulingen var svaret på rapportene. Vises innholdet igjen, er de
      // ikke lenger besvart: tilbake til «gjennomgått», så de står blant de
      // åpne og kan løses eller avvises. Uten dette sto de som «løst» om
      // innhold som er synlig, uten en knapp som kunne endre det. Avviste
      // rapporter røres ikke, og `resolved_at` nullstilles sammen med
      // statusen — den datoen styrer når rapporten slettes.
      const { error: reopenError } = await admin
        .from('reports')
        .update({ status: 'reviewed', resolved_at: null })
        .eq(maal.column, maal.id)
        .eq('status', 'resolved');
      if (reopenError) actorLog.warn('admin.moderation.action.reopen_failed', { message: reopenError.message });
    }
  } else {
    // `resolved_at` settes bare ved avslutning: opprydningsjobben sletter
    // rapporten ett år etter den datoen (docs/retention-policy.md).
    const update =
      action === 'reviewed' ? { status: 'reviewed' } : { status: action === 'dismiss' ? 'dismissed' : 'resolved', resolved_at: naa };
    const { error: statusError } = await admin.from('reports').update(update).eq('id', report.id);
    if (statusError) {
      loggFeil(actorLog, 'admin.moderation.action.status_failed', statusError);
      return apiFeil('moderation_report_update_failed', 500);
    }
  }

  await logAdminAction({
    actorId: access.userId,
    action: `moderation.${action}`,
    targetUserId: authorId,
    metadata: {
      reportId: report.id,
      postId: report.post_id,
      commentId: report.comment_id,
      findingId: report.finding_id,
      reason: report.reason
    },
    request
  });

  actorLog.info('admin.moderation.action.success', { action, reportId: report.id });

  return NextResponse.json({ ok: true });
}
