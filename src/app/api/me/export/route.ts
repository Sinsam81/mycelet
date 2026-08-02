import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { LEGAL_ENTITY } from '@/lib/legal/entity';

/**
 * GDPR Article 15 — right of access.
 *
 * Returns a JSON file containing every row tied to the authenticated user
 * across our database. Uses the session client so RLS is the source of truth
 * for what the user can read. If RLS is missing for some table, that table
 * returns empty here — the fix belongs in the policy, not in this endpoint.
 *
 * ONE EXCEPTION: `ai_identifications` has RLS enabled with no policies at all
 * (service-role only, so nobody can reset their own AI quota). Through the
 * session client it would always come back empty — an empty list that reads
 * like an answer. That one table is read with the admin client, filtered
 * explicitly on the caller's user_id.
 *
 * FAIL CLOSED. Every query is checked, and a single failure aborts the whole
 * export with a 500. Earlier this endpoint did `findings.data ?? []` on each
 * result, so a query that errored became an empty array inside a file the user
 * received as a complete answer to their Article 15 request — silently telling
 * them we hold no findings when we might hold hundreds. A missing export the
 * user can retry is a far smaller problem than a wrong one they trust.
 *
 * Note the distinction: an RLS policy that legitimately returns zero rows is
 * NOT an error, and still exports as []. Only a failed query aborts.
 *
 * Out of scope (intentionally not in the export):
 *   - Public reference data (mushroom species, look-alikes, prediction tiles)
 *   - Forum posts / comments by other users (not personal data about caller)
 *   - Reports filed BY OTHERS about the caller (would expose reporter)
 *   - admin_audit_log rows mentioning the caller (they identify the acting
 *     administrator too — manual review required)
 *
 * For "data about you from other users" requests, the user should contact
 * the privacy mailbox; that requires manual review.
 */
/** Den delen av et Supabase-svar denne ruten faktisk bryr seg om. */
type QueryResult = { data: unknown; error: { message: string } | null };

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('account.export.start');

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    log.info('account.export.unauthenticated');
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const userLog = log.child({ userId: user.id });

  // The export runs one query per user table — defending against a
  // refresh-loop hammering the DB. 10/min is plenty for any honest UI
  // pattern (downloading once, maybe again to verify).
  const rateLimit = checkRateLimit(`me-export:${getClientKey(request, user.id)}`, 10, 60);
  if (!rateLimit.allowed) {
    userLog.warn('account.export.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  // `ai_identifications` har RLS på uten en eneste policy — kun tjenesterollen
  // kan lese den (migrasjon 020, så ingen kan nullstille sin egen AI-kvote).
  // Øktklienten ville derfor alltid gitt [], altså en tom liste som ser ut som
  // et svar. Vi leser den med tjenestenøkkelen og filtrerer eksplisitt på
  // brukerens egen id.
  //
  // Mangler nøkkelen, kan vi ikke kalle eksporten fullstendig — samme
  // fail-closed-regel som for en spørring som feiler.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    userLog.error('account.export.no_service_role_key');
    return NextResponse.json(
      {
        error: 'Kunne ikke hente ut alle dataene dine',
        details:
          'Eksporten ble avbrutt på grunn av en serverfeil. Du har IKKE fått en ufullstendig fil. Prøv igjen om litt — vedvarer feilen, kontakt ' +
          LEGAL_ENTITY.privacyEmail +
          '.'
      },
      { status: 500 }
    );
  }

  // All queries scoped to the authenticated user_id. RLS would also enforce
  // this — the explicit .eq() is defense in depth.
  //
  // Keyed rather than positional: the manifest below reports coverage per
  // dataset, and a positional array made it too easy to add a query without
  // adding it to the completeness check.
  // `shape` says what an empty result means for this dataset: a table the user
  // has many rows in exports as [], a one-per-user row exports as null.
  const datasets = {
    profile: { shape: 'one', query: supabase.from('profiles').select('*').eq('id', user.id).maybeSingle() },
    findings: { shape: 'many', query: supabase.from('findings').select('*').eq('user_id', user.id) },
    forumPosts: { shape: 'many', query: supabase.from('forum_posts').select('*').eq('user_id', user.id) },
    comments: { shape: 'many', query: supabase.from('comments').select('*').eq('user_id', user.id) },
    postLikes: { shape: 'many', query: supabase.from('post_likes').select('*').eq('user_id', user.id) },
    commentLikes: { shape: 'many', query: supabase.from('comment_likes').select('*').eq('user_id', user.id) },
    savedPosts: { shape: 'many', query: supabase.from('saved_posts').select('*').eq('user_id', user.id) },
    reportsFiled: { shape: 'many', query: supabase.from('reports').select('*').eq('reporter_id', user.id) },
    billing: { shape: 'one', query: supabase.from('billing_subscriptions').select('*').eq('user_id', user.id).maybeSingle() },
    moderatorRole: { shape: 'one', query: supabase.from('moderator_roles').select('*').eq('user_id', user.id).maybeSingle() },
    verifiedForager: { shape: 'one', query: supabase.from('verified_foragers').select('*').eq('user_id', user.id).maybeSingle() },
    // Tilbakemeldingene på «Var du her? Fant du sopp?». Dette er det datasettet
    // med de mest presise koordinatene vi lagrer om en bruker: latitude og
    // longitude med fem desimaler (~1 m), utenfor visibility-modellen og
    // display_location-triggeren som beskytter funn. At nettopp det manglet i
    // en eksport som erklærte seg fullstendig, var det verste hullet.
    spotFeedback: { shape: 'many', query: supabase.from('spot_feedback').select('*').eq('user_id', user.id) },
    // Varselet om automatisk sletting etter tre år uten innlogging.
    deletionWarning: {
      shape: 'one',
      query: supabase.from('account_deletion_warnings').select('*').eq('user_id', user.id).maybeSingle()
    },
    // Tidspunktene for AI-identifiseringene dine (grunnlaget for dagskvoten).
    // Leses med tjenesterollen — se kommentaren over.
    aiIdentifications: { shape: 'many', query: admin.from('ai_identifications').select('*').eq('user_id', user.id) }
  };

  type DatasetKey = keyof typeof datasets;
  const keys = Object.keys(datasets) as DatasetKey[];
  const settled = await Promise.all(keys.map((k) => datasets[k].query));

  // Normaliser til én form. Supabase returnerer en union (suksess | feil) der
  // hver gren har sin egen datatype; vi bryr oss bare om «gikk det, og hva kom».
  const results = Object.fromEntries(
    keys.map((k, i) => [k, { data: settled[i].data as unknown, error: settled[i].error }])
  ) as Record<DatasetKey, QueryResult>;

  // Fail closed: any failed query means we cannot honestly call this export
  // complete, so we send nothing rather than something misleading.
  const failed = keys.filter((k) => results[k].error);
  if (failed.length > 0) {
    userLog.error('account.export.incomplete', undefined, {
      failedDatasets: failed,
      // Provider messages can carry schema details — keep them in the log,
      // never in the response body.
      firstError: results[failed[0]].error?.message
    });
    return NextResponse.json(
      {
        error: 'Kunne ikke hente ut alle dataene dine',
        details:
          'Eksporten ble avbrutt fordi minst ett datasett ikke kunne leses. Du har IKKE fått en ufullstendig fil. Prøv igjen om litt — vedvarer feilen, kontakt ' +
          LEGAL_ENTITY.privacyEmail +
          '.'
      },
      { status: 500 }
    );
  }

  const rowCount = (value: unknown) => (Array.isArray(value) ? value.length : value == null ? 0 : 1);
  const generatedAt = new Date().toISOString();

  const exportData = {
    exportedAt: generatedAt,
    // 3: la til spotFeedback, deletionWarning og aiIdentifications.
    schemaVersion: 3,
    account: {
      userId: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null
    },
    ...(Object.fromEntries(
      keys.map((k) => [k, results[k].data ?? (datasets[k].shape === 'many' ? [] : null)])
    ) as Record<DatasetKey, unknown>),
    _manifest: {
      generatedAt,
      // Lets the recipient verify nothing was quietly dropped in transit, and
      // gives support something concrete to compare against a re-run.
      datasets: Object.fromEntries(keys.map((k) => [k, rowCount(results[k].data)])),
      complete: true
    },
    _notes: {
      gdprArticle: 'GDPR Art. 15 — Right of access.',
      coverage:
        'This export contains all rows in our database tied to your user_id. Public reference data (species, look-alikes, prediction tiles) is intentionally not included since it is not personal data about you.',
      completeness:
        'Every query behind this file succeeded. If any had failed you would have received an error instead of this file — we never ship a partial export as if it were complete.',
      dataAboutYouFromOthers: `Reports filed BY OTHER USERS about your content are not in this export to protect the reporter. Entries in our admin audit log that mention you (for example an administrator granting you verified-forager status) are also left out, because those rows identify the administrator as well. To request either, contact ${LEGAL_ENTITY.privacyEmail} — manual review required.`
    }
  };

  const filename = `mycelet-data-export-${user.id}-${generatedAt.slice(0, 10)}.json`;

  userLog.info('account.export.success', {
    counts: exportData._manifest.datasets
  });

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
