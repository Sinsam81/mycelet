import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { apiFeil, loggFeil } from '@/lib/api/feil';
import { vaskEpost } from '@/lib/alerts/adopsjon';
import { erManglendeTabell } from '@/lib/supabase/tabell-finnes';
import { deleteUserStorageObjects, type StorageApi } from '@/lib/storage/delete-user-objects';
import { avsluttStripeVedSletting } from '@/lib/billing/avslutt-ved-sletting';
import { getStripeServerClient } from '@/lib/stripe/server';
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
 *       - every finding the user had ALREADY deleted themselves
 *         (deleted_at IS NOT NULL, migration 056) — those must never
 *         come back as anonymized training data
 *       - all positive findings (any visibility)
 *       - every negative finding whose visibility is NOT 'approximate'
 *         (both 'private' and 'public' — the declaration promises that
 *         only approximate-level observations survive)
 *       - the survivors get latitude/longitude overwritten with the
 *         jittered display_* pair, so the exact GPS point is gone
 *       - account-less mushroom-alert sign-ups on the user's own e-mail
 *         address (alert_subscriptions rows with user_id NULL, migration
 *         057) — nothing cascades to those, and they kept sending alerts
 *         to a person whose account was gone
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

/**
 * Samme beskjed uansett hvilket steg som røk: hva er tilstanden, hva gjør du nå.
 *
 * Teksten bor i src/lib/api/feil.ts (`delete_retry_safe`), på norsk og svensk:
 * slettedialogen viser `details` FØR `error`, så det er denne setningen en
 * svensk bruker faktisk leser når slettingen stopper halvveis.
 */
const RETRY_IS_SAFE = 'delete_retry_safe' as const;

/**
 * Feil som betyr at det ikke KAN finnes kontoløse varselrader: tabellen
 * mangler (migrasjon 051), eller e-postkolonnen gjør det (057 — Postgres'
 * 42703 når kolonnen står i et filter, PGRST204 fra skjemacachen). Da er det
 * ingenting å slette, og en glemt migrasjon skal ikke stå i veien for retten
 * til å bli slettet.
 */
function utenKontoloseVarsler(error: { code?: string | null }): boolean {
  return erManglendeTabell(error) || error.code === '42703' || error.code === 'PGRST204';
}

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
    return apiFeil('unauthenticated', 401);
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
    return apiFeil('delete_bad_confirm', 400, {
      // Utviklertekst, ikke oversatt: ingen klient viser den.
      hint: 'POST body må være { "confirm": "DELETE-MY-ACCOUNT" }.'
    });
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
    identificationsCount
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
      .eq('visibility', RETAINED_VISIBILITY)
      // Det brukeren allerede har slettet, slettes av STEP 1a — det skal ikke
      // stå i kvitteringen som «beholdt i anonymisert form».
      .is('deleted_at', null),
    supabase.from('forum_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('saved_posts').select('post_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id),
    // Identifiseringshistorikken. Ingen egen slettespørring under: FK-en mot
    // auth.users er ON DELETE CASCADE (migrasjon 055), så radene går med i
    // steg 2. Bildene ryddes i steg 1c — identify-history står i
    // USER_IMAGE_BUCKETS. Telleren finnes for at kvitteringen skal si det.
    supabase.from('identifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  ]);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    userLog.error('account.self_delete.no_service_role_key');
    // Navnet på miljøvariabelen sto i svaret, og dialogen viste det. Det er
    // vår sak, ikke brukerens — de trenger å vite at ingenting er slettet.
    return apiFeil('delete_unavailable', 500, { detaljer: 'delete_unavailable_details' });
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
    // Leverandørens feilmelding blir i loggen. Brukeren trenger å vite hva
    // tilstanden er og hva de skal gjøre, ikke hva Postgres het.
    loggFeil(userLog, 'account.self_delete.positive_findings_delete_failed', positiveDeleteError);
    return apiFeil('delete_findings_failed', 500, { detaljer: RETRY_IS_SAFE });
  }

  // STEP 1a — funn brukeren ALLEREDE har slettet selv.
  //
  // Soft delete (migrasjon 056) lar raden ligge i 30 dager for angrefristens
  // skyld. Uten dette steget ville en slettet, negativ observasjon med
  // visibility = 'approximate' sluppet gjennom STEP 1b (den filtrerer på
  // synlighet, ikke på deleted_at) og blitt liggende som ANONYMISERT
  // treningsdata etter kontoslettingen — et funn brukeren hadde slettet to
  // ganger, først enkeltvis og så med hele kontoen.
  //
  // Ligger før 1b og 1b2 med vilje: da er de radene ute av veien før noe
  // vurderer hva som skal beholdes.
  const { error: softDeletedError } = await admin
    .from('findings')
    .delete()
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null);
  if (softDeletedError) {
    loggFeil(userLog, 'account.self_delete.soft_deleted_purge_failed', softDeletedError);
    return apiFeil('delete_removed_findings_failed', 500, { detaljer: RETRY_IS_SAFE });
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
    loggFeil(userLog, 'account.self_delete.private_findings_delete_failed', privateDeleteError);
    return apiFeil('delete_observations_failed', 500, { detaljer: RETRY_IS_SAFE });
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
    return apiFeil('delete_coarsen_failed', 500, { detaljer: RETRY_IS_SAFE });
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
    return apiFeil('delete_images_failed', 500, { detaljer: RETRY_IS_SAFE });
  }

  // STEP 1c2 — kontoløse soppvarsel-påmeldinger på brukerens egen adresse.
  //
  // Varselet kan slås på uten konto (migrasjon 057): en rad med user_id NULL
  // og en e-postadresse. Kontoens egne rader (user_id) tar cascaden i steg 2,
  // men de kontoløse henger ikke på noe. De ble stående — og den som hadde
  // slettet kontoen sin, fikk fortsatt soppvarsel på e-post. /api/me/export
  // regner de samme radene som brukerens egne data; da må slettingen også
  // gjøre det.
  //
  // Adressen kommer fra auth, aldri fra forespørselen, og sammenlignes
  // NØYAKTIG (trimmet, med små bokstaver — slik påmeldingsruta skriver den):
  // ingen ilike, ingen delmatch. `user_id IS NULL` står i filteret, så en
  // annen kontos rad kan aldri bli med. Alt på adressen går, også ubekreftede
  // og avmeldte rader: adressen er personopplysningen, uansett status.
  //
  // Uten adresse på kontoen kjøres ingenting — et tomt filter skal aldri
  // kunne treffe noe.
  //
  // Før Stripe med vilje: oppsigelsen er det ene steget som ikke kan gjøres
  // om, og skal være det siste før selve kontoslettingen.
  const epost = vaskEpost(user.email);
  let emailAlertSubscriptions = 0;
  if (epost) {
    const { data: varselRader, error: varselError } = await admin
      .from('alert_subscriptions')
      .delete()
      .is('user_id', null)
      .eq('email', epost)
      .select('id');
    if (varselError && utenKontoloseVarsler(varselError)) {
      userLog.warn('account.self_delete.email_alerts_unavailable', { code: varselError.code });
    } else if (varselError) {
      loggFeil(userLog, 'account.self_delete.email_alerts_delete_failed', varselError);
      return apiFeil('delete_alerts_failed', 500, { detaljer: RETRY_IS_SAFE });
    } else {
      emailAlertSubscriptions = Array.isArray(varselRader) ? varselRader.length : 0;
    }
  }

  // STEP 1d — løpende Stripe-abonnement.
  //
  // Manglet helt: cascaden tok billing_subscriptions-raden, Stripe fikk aldri
  // beskjed, og kunden ble fakturert videre uten innlogging og uten portal.
  // Sies opp FØR auth-slettingen — feiler Stripe, stopper vi her, og et nytt
  // forsøk er trygt. Se avslutt-ved-sletting.ts for reglene.
  const stripeResultat = await avsluttStripeVedSletting({
    admin: admin as unknown as { from: (table: string) => any },
    stripe: getStripeServerClient,
    userId: user.id,
    log: userLog
  });
  if (!stripeResultat.ok) {
    userLog.error('account.self_delete.stripe_cancel_failed', undefined, { detail: stripeResultat.detalj });
    return apiFeil('delete_subscription_failed', 500, { detaljer: RETRY_IS_SAFE });
  }

  // STEP 2 — delete the auth.users row. Cascades to profiles which
  // SET NULLs user_id on findings (only public/approximate negatives
  // remain), forum_posts, and comments.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    loggFeil(userLog, 'account.self_delete.failed', deleteError);
    return apiFeil('delete_account_failed', 500, { detaljer: RETRY_IS_SAFE });
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
    identifications: identificationsCount.count ?? 0,
    // Bildene er nå med i kvitteringen. Uten dette kunne brukeren ikke se at
    // de i det hele tatt ble fjernet — og før denne endringen ble de ikke det.
    uploadedImages: storageResult.removed,
    // Kontoløse soppvarsel-påmeldinger på brukerens adresse (steg 1c2). Et
    // tall, aldri adressen: kvitteringen går også i revisjonsloggen.
    emailAlertSubscriptions,
    // Kvitteringen sier om et Stripe-abonnement faktisk ble sagt opp her.
    stripeSubscriptionCanceled: stripeResultat.avsluttet
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
