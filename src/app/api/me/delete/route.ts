import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { deleteUserStorageObjects, type StorageApi } from '@/lib/storage/delete-user-objects';
import {
  RETAINED_VISIBILITY,
  coarsenRetainedObservations,
  type RetainedObservationsApi
} from '@/lib/privacy/retained-observations';

/**
 * GDPR Article 17 — right to erasure ("right to be forgotten").
 *
 * Hard-deletes the user's auth.users row. After migration 011, FK
 * cascades from profiles to findings/forum_posts/comments use
 * ON DELETE SET NULL — so deleted users' negative observations and
 * forum threads survive in anonymized form (per retention policy).
 *
 * Two-step deletion to honor the policy distinction:
 *
 *   STEP 1 (this handler, BEFORE auth deletion): explicitly delete the
 *     rows that should NOT be anonymized, and coarsen what is kept:
 *       - all positive findings (any visibility)
 *       - every negative finding whose visibility is NOT 'approximate'
 *         (both 'private' and 'public' — the declaration promises that
 *         only approximate-level observations survive)
 *       - the survivors get latitude/longitude overwritten with the
 *         jittered display_* pair, so the exact GPS point is gone
 *
 *   STEP 2 (Supabase auth.admin.deleteUser): cascade to profiles, which
 *     SET NULLs the user_id on:
 *       - approximate negative findings          → kept as training data
 *       - all forum_posts                       → "[slettet bruker]" in UI
 *       - all comments                          → same
 *     Other tables (post_likes, comment_likes, saved_posts, reports)
 *     keep ON DELETE CASCADE — personal interaction signals.
 *
 * Confirmation:
 *   - Method must be POST (not DELETE — added friction is intentional)
 *   - Body must contain { "confirm": "DELETE-MY-ACCOUNT" } literally
 *   - The UI should require the user to type that string before enabling
 *     the submit button, matching common destructive-action UX
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the deployment env;
 * fails with 500 otherwise.
 *
 * OM DELVISE FEIL. Rekkefølgen er bevisst, og den er ikke tilfeldig valgt:
 * de eksplisitte slettingene MÅ skje før auth-brukeren fjernes, fordi cascaden
 * setter findings.user_id til NULL — etterpå finnes det ingen kobling igjen å
 * finne radene på.
 *
 * Det betyr at et avbrudd midt i etterlater «data borte, konto igjen». Det er
 * det minst dårlige av alternativene: hvert steg er idempotent og nøkles på
 * user_id, så brukeren kan bare prøve på nytt, og andre forsøk rydder resten.
 * Motsatt rekkefølge ville gitt «konto borte, data igjen» — og da finnes det
 * ingen konto å logge inn med for å prøve igjen, så det ville krevd manuell
 * opprydding. Derfor sier feilmeldingene eksplisitt at det er trygt å gjenta.
 */

/** Samme beskjed uansett hvilket steg som røk: hva er tilstanden, hva gjør du nå. */
const RETRY_IS_SAFE =
  'Kontoen din er IKKE slettet, men noe av innholdet ditt kan være fjernet. Prøv igjen — det er trygt å gjenta, og andre forsøk rydder resten. Vedvarer feilen, kontakt oss.';

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  // warn on entry — destroying user data is high-signal even when expected.
  // Pages an alerting hook later if we want one.
  log.warn('account.self_delete.start');

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    log.info('account.self_delete.unauthenticated');
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const userLog = log.child({ userId: user.id });

  // Rate limit defends against repeated triggers (no honest user clicks
  // delete five times in a minute). Defense in depth on top of the literal
  // confirm token.
  const rateLimit = checkRateLimit(`me-delete:${getClientKey(request, user.id)}`, 5, 60);
  if (!rateLimit.allowed) {
    userLog.warn('account.self_delete.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE-MY-ACCOUNT') {
    userLog.info('account.self_delete.confirm_missing');
    return NextResponse.json(
      {
        error: 'Bekreftelse mangler eller er feil',
        hint: 'POST body må være { "confirm": "DELETE-MY-ACCOUNT" }.'
      },
      { status: 400 }
    );
  }

  // Pre-deletion counts so we can return a receipt of what was wiped.
  // Done via session client so RLS scopes them correctly.
  const [
    positiveFindingsCount,
    deletedNegativeFindingsCount,
    anonymizedNegativeFindingsCount,
    postsCount,
    commentsCount,
    likesCount,
    savedCount,
    reportsCount,
    savedPlacesCount
  ] = await Promise.all([
    supabase
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_negative_observation', false),
    // Kvitteringen må telle de samme radene som faktisk slettes. Alt negativt
    // som ikke er delt på omtrentlig nivå går med, ikke bare de private.
    supabase
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_negative_observation', true)
      .neq('visibility', RETAINED_VISIBILITY),
    supabase
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_negative_observation', true)
      .eq('visibility', RETAINED_VISIBILITY),
    supabase.from('forum_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('saved_posts').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id),
    // Markerte steder. FK-en cascader når auth.users-raden går, men et tall som
    // ikke står i kvitteringen er et tall brukeren ikke kan se ble slettet.
    supabase.from('saved_places').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  ]);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    userLog.error('account.self_delete.no_service_role_key');
    return NextResponse.json(
      {
        error: 'Server-konfigurasjonsfeil',
        details: 'SUPABASE_SERVICE_ROLE_KEY mangler. Kontoen din ble IKKE slettet. Kontakt support.'
      },
      { status: 500 }
    );
  }

  // STEP 1 — explicitly delete findings that should NOT be anonymized
  // before auth.users is removed. After migration 011 the FK on
  // findings.user_id is ON DELETE SET NULL, so the auth-cascade only
  // anonymizes whatever survives this deletion.
  const { error: positiveDeleteError } = await admin
    .from('findings')
    .delete()
    .eq('user_id', user.id)
    .eq('is_negative_observation', false);
  if (positiveDeleteError) {
    userLog.error('account.self_delete.positive_findings_delete_failed', positiveDeleteError);
    return NextResponse.json(
      {
        error: 'Kunne ikke fjerne dine personlige funn før kontosletting',
        // Leverandørens feilmelding blir i loggen. Brukeren trenger å vite hva
        // tilstanden er og hva de skal gjøre, ikke hva Postgres het.
        details: RETRY_IS_SAFE
      },
      { status: 500 }
    );
  }

  // STEP 1b — negative observasjoner som IKKE skal overleve.
  //
  // Personvernerklæringen (Personvern.retentionNegativeDesc) sier at det som
  // beholdes er «kun observasjoner med omtrentlig delingsnivå (±500 m)».
  // Koden slettet bare de private, så både 'public' og 'approximate'
  // overlevde — og de offentlige med det eksakte GPS-punktet, siden
  // display_* er lik latitude/longitude for public. Filteret er derfor snudd:
  // alt som ikke er 'approximate' går med.
  const { error: privateDeleteError } = await admin
    .from('findings')
    .delete()
    .eq('user_id', user.id)
    .eq('is_negative_observation', true)
    .neq('visibility', RETAINED_VISIBILITY);
  if (privateDeleteError) {
    userLog.error('account.self_delete.private_findings_delete_failed', privateDeleteError);
    return NextResponse.json(
      {
        error: 'Kunne ikke fjerne private observasjoner før kontosletting',
        details: RETRY_IS_SAFE
      },
      { status: 500 }
    );
  }

  // STEP 1b2 — grovkorn posisjonen på det som faktisk blir liggende igjen.
  //
  // display_latitude/longitude er den jitrede kopien (±500 m); latitude/
  // longitude er det eksakte punktet brukeren sto på. Uten dette steget
  // beholdt vi det eksakte punktet, med tidsstempel og art — noe annet enn
  // det brukeren fikk vite før hen bekreftet slettingen.
  //
  // Trigger'n set_display_location stempler display_* på nytt ut fra den nye
  // (allerede grovkornede) verdien. Det gir mer støy, aldri mindre — så det
  // er trygt i denne retningen.
  const coarsenError = await coarsenRetainedObservations(
    admin as unknown as RetainedObservationsApi,
    user.id
  );
  if (coarsenError) {
    userLog.error('account.self_delete.coarsen_failed', undefined, { detail: coarsenError });
    return NextResponse.json(
      {
        error: 'Kunne ikke anonymisere posisjonen på observasjonene dine',
        details: RETRY_IS_SAFE
      },
      { status: 500 }
    );
  }

  // STEP 1c — brukerens opplastede bilder.
  //
  // Dette manglet helt: radene forsvant, auth-brukeren forsvant, men bildene
  // ble liggende i Storage på offentlige URL-er. En sletting etter art. 17 som
  // etterlater brukerens egne bilder tilgjengelige er ikke en sletting.
  //
  // Må skje FØR auth-slettingen, mens vi fortsatt kan knytte filene til
  // brukeren. Steget er idempotent, så et nytt forsøk er trygt.
  const storageResult = await deleteUserStorageObjects(
    admin.storage as unknown as StorageApi,
    user.id
  );
  if (storageResult.failures.length > 0) {
    userLog.error('account.self_delete.storage_cleanup_failed', undefined, {
      failures: storageResult.failures
    });
    return NextResponse.json(
      {
        error: 'Kunne ikke fjerne bildene dine',
        details: RETRY_IS_SAFE
      },
      { status: 500 }
    );
  }

  // STEP 2 — delete the auth.users row. Cascades to profiles which
  // SET NULLs user_id on findings (only public/approximate negatives
  // remain), forum_posts, and comments.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    userLog.error('account.self_delete.failed', deleteError);
    return NextResponse.json(
      {
        error: 'Kunne ikke slette konto',
        details: RETRY_IS_SAFE
      },
      { status: 500 }
    );
  }

  // Audit log the self-deletion. Done after the auth.users row is gone —
  // the user's UUID is captured from the pre-delete `user` variable; the
  // log table has no FK on actor/target so the entry persists even though
  // auth.users(id) no longer exists. logAdminAction is failure-safe; if
  // the audit insert fails (no service role, no migration 008) the user-
  // facing deletion is unaffected.
  const counts = {
    positiveFindings: positiveFindingsCount.count ?? 0,
    // Het tidligere privateNegativeFindings. Navnet stemte ikke lenger: nå
    // slettes ALLE negative observasjoner som ikke er delt på omtrentlig nivå.
    deletedNegativeFindings: deletedNegativeFindingsCount.count ?? 0,
    anonymizedNegativeFindings: anonymizedNegativeFindingsCount.count ?? 0,
    forumPosts: postsCount.count ?? 0,
    comments: commentsCount.count ?? 0,
    postLikes: likesCount.count ?? 0,
    savedPosts: savedCount.count ?? 0,
    reportsFiled: reportsCount.count ?? 0,
    savedPlaces: savedPlacesCount.count ?? 0,
    // Bildene er nå med i kvitteringen. Uten dette kunne brukeren ikke se at
    // de i det hele tatt ble fjernet — og før denne endringen ble de ikke det.
    uploadedImages: storageResult.removed
  };

  // Ingen `request` her, med vilje: da hentes verken IP-adresse eller
  // nettleserstreng. admin_audit_log kan ingen slette fra (triggerne i
  // migrasjon 008 blokkerer DELETE også for tjenesterollen), så alt vi skriver
  // her blir stående. Sporet trenger at slettingen skjedde og hvem det gjaldt —
  // ikke hvor brukeren satt da de ba om å bli glemt. logAdminAction håndhever
  // det samme for denne handlingen uansett hva kallstedet sender.
  await logAdminAction({
    actorId: user.id,
    action: 'account.self_delete',
    targetUserId: user.id,
    metadata: { counts }
  });

  userLog.warn('account.self_delete.success', { counts });

  // Best-effort sign-out so the cookie session is invalidated. The auth row
  // is already gone, so this just clears local cookies; if it errors we
  // ignore — the deletion itself already succeeded.
  await supabase.auth.signOut().catch(() => undefined);

  return NextResponse.json({
    ok: true,
    deletedUserId: user.id,
    deletedAt: new Date().toISOString(),
    counts
  });
}
