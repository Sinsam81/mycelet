// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { requireServiceRole } from '../_shared/auth.ts';
import { sendEmail, buildInactiveWarningEmail } from '../_shared/email.ts';
import {
  graceDeadline,
  hasSignedInSince,
  inactiveCutoff,
  selectAwaitingEmail,
  selectDueForDeletion,
  type DeletionWarning
} from '../_shared/retention.ts';

/**
 * Cron Edge Function — Daily 03:00 Europe/Oslo
 *
 * Implements the inactive-account half of docs/retention-policy.md:
 *
 *   1. Find users where last_sign_in_at < NOW() - 3 years AND no
 *      pending warning row. INSERT a warning with scheduled_deletion_at
 *      90 days from now and warning_email_sent = FALSE.
 *
 *   2. Find users with a warning whose user has signed in since the
 *      warning was issued. Delete the warning row.
 *
 *   2b. Send the warning e-mail to every warning still flagged unsent —
 *      including ones from earlier runs. On success, flag it sent and
 *      restart the 90-day clock from the send, because the policy
 *      promises "e-mail warning, then 90 days", in that order. If Resend
 *      is not configured yet, nothing is sent and nothing is deleted;
 *      the run self-heals once the key is in place.
 *
 *   3. Find users with a SENT warning whose scheduled_deletion_at has
 *      passed. Delete the rows that must NOT survive anonymization,
 *      THEN hard-delete the auth.users row. FK cascades trigger:
 *        - profiles deleted
 *        - findings/forum_posts/comments user_id → NULL (anonymized)
 *        - post_likes/saved_posts/reports cascade-deleted
 *
 *      RETENSJONSREGELEN (docs/retention-policy.md, migrasjon 011):
 *      bare NEGATIVE, ikke-private observasjoner får overleve som
 *      anonymiserte treningsdata. Positive funn og alt merket privat
 *      slettes eksplisitt først — nøyaktig slik /api/me/delete gjør
 *      (src/app/api/me/delete/route.ts, STEP 1).
 *
 *      Kommentaren som sto her før kalte dette et bevisst hull og
 *      begrunnet det med at radene «allerede har display-jittrede
 *      koordinater». Det stemmer ikke for private funn: triggeren
 *      set_display_location setter display_* til NULL for dem og lar
 *      den EKSAKTE latitude/longitude ligge i tabellen. En privat rad
 *      som overlever er altså et eksakt voksested uten eier og uten
 *      sletteregel — mens appen har fortalt brukeren at det ble
 *      slettet. Etter GDPR art. 5(1)(e) og 17 er selve lagringen
 *      avviket, uavhengig av om noe API eksponerer den i dag.
 *
 *      NB: bildene i Storage ryddes IKKE av denne funksjonen ennå
 *      (/api/me/delete gjør det via deleteUserStorageObjects). Se
 *      docs/retention-policy.md.
 *
 * Returns a JSON receipt with per-step counts. Logs are emitted via
 * console.log which Supabase forwards to its function-logs page.
 *
 * Invoke via:
 *   curl -X POST $SUPABASE_URL/functions/v1/purge-inactive-accounts \
 *     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
 *
 * Schedule via Supabase Studio → Functions → "Schedules" tab, or via
 * an external scheduler. See docs/edge-functions-setup.md.
 */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = requireServiceRole(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const now = new Date();
  const cutoff = inactiveCutoff(now);
  const scheduledDeletion = graceDeadline(now);

  let issuedWarnings = 0;
  let emailsSent = 0;
  let clearedWarnings = 0;
  let deletedAccounts = 0;
  const errors: string[] = [];

  const appUrl = Deno.env.get('APP_URL') ?? 'https://mycelet.no';

  // ---- Step 1: issue new warnings ---------------------------------
  // We must read auth.users via the admin API. listUsers paginates
  // 1000 per page; for a small beta DB this is sufficient. If user
  // count grows past ~50k, switch to per-page processing.
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    errors.push(`listUsers: ${listError.message}`);
  } else {
    const candidates = (usersPage?.users ?? []).filter((u: any) => {
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      return lastSignIn && lastSignIn < cutoff;
    });

    if (candidates.length > 0) {
      // Find which of these already have a warning so we don't duplicate.
      const ids = candidates.map((u: any) => u.id);
      const { data: existing } = await supabase
        .from('account_deletion_warnings')
        .select('user_id')
        .in('user_id', ids);
      const alreadyWarned = new Set((existing ?? []).map((r: any) => r.user_id));

      const toWarn = candidates.filter((u: any) => !alreadyWarned.has(u.id));
      if (toWarn.length > 0) {
        const { error: insertError } = await supabase.from('account_deletion_warnings').insert(
          toWarn.map((u: any) => ({
            user_id: u.id,
            scheduled_deletion_at: scheduledDeletion.toISOString()
          }))
        );
        if (insertError) {
          errors.push(`insert warnings: ${insertError.message}`);
        } else {
          issuedWarnings = toWarn.length;
        }
      }
    }
  }

  // ---- Step 2: clear warnings for users who signed back in --------
  const { data: warnings, error: warningListError } = await supabase
    .from('account_deletion_warnings')
    .select('user_id, warned_at, scheduled_deletion_at, warning_email_sent');
  if (warningListError) {
    errors.push(`list warnings: ${warningListError.message}`);
  }
  let liveWarnings: DeletionWarning[] = (warnings ?? []) as DeletionWarning[];

  const stillWarned: DeletionWarning[] = [];
  for (const warning of liveWarnings) {
    const { data: userResp } = await supabase.auth.admin.getUserById(warning.user_id);
    if (hasSignedInSince(userResp?.user?.last_sign_in_at, warning.warned_at)) {
      const { error: clearError } = await supabase
        .from('account_deletion_warnings')
        .delete()
        .eq('user_id', warning.user_id);
      if (clearError) {
        errors.push(`clear ${warning.user_id}: ${clearError.message}`);
        stillWarned.push(warning);
      } else {
        clearedWarnings++;
      }
      continue;
    }
    stillWarned.push({ ...warning, email: userResp?.user?.email } as DeletionWarning & {
      email?: string;
    });
  }
  liveWarnings = stillWarned;

  // ---- Step 2b: send the warning e-mail ---------------------------
  //
  // Kjøres for ALLE varsler som ennå ikke er sendt, ikke bare de som ble
  // laget i denne kjøringen. Var Resend ikke satt opp da varselet ble
  // laget, blir det sendt her når nøkkelen er på plass — og 90-dagersfristen
  // starter da, ikke da raden ble laget. Ellers ville en konto blitt slettet
  // samme dag som brukeren fikk sitt eneste varsel.
  for (const warning of selectAwaitingEmail(liveWarnings)) {
    const email = (warning as DeletionWarning & { email?: string }).email;
    if (!email) {
      errors.push(`email ${warning.user_id}: ingen e-postadresse på kontoen`);
      continue;
    }
    const sendAt = new Date();
    const deadline = graceDeadline(sendAt);
    const message = buildInactiveWarningEmail({
      userEmail: email,
      appUrl,
      scheduledDeletionAt: deadline
    });
    const sendResult = await sendEmail({
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text
    });
    if (!sendResult.ok) {
      errors.push(`email ${warning.user_id}: ${sendResult.detail}`);
      continue;
    }
    const { error: markError } = await supabase
      .from('account_deletion_warnings')
      .update({
        warning_email_sent: true,
        warned_at: sendAt.toISOString(),
        scheduled_deletion_at: deadline.toISOString()
      })
      .eq('user_id', warning.user_id);
    if (markError) {
      // Uten flagget blir kontoen ikke slettet i steg 3 — det er den trygge
      // veien å feile, men det må stå i kvitteringen.
      errors.push(`mark sent ${warning.user_id}: ${markError.message}`);
      continue;
    }
    emailsSent++;
    warning.warning_email_sent = true;
    warning.warned_at = sendAt.toISOString();
    warning.scheduled_deletion_at = deadline.toISOString();
  }

  // ---- Step 3: hard-delete users whose grace period expired -------
  //
  // Kravet er BEGGE deler: varselet må være sendt, og fristen må ha løpt ut.
  // Tidligere sto det bare `.lt('scheduled_deletion_at', now)`, så en konto
  // ble slettet 90 dager etter at raden ble laget selv om e-posten aldri gikk
  // ut. Erklæringen lover et varsel først.
  for (const due of selectDueForDeletion(liveWarnings, now)) {
    // Slett først det som ikke skal overleve som anonymiserte data. Etter
    // migrasjon 011 er FK-en ON DELETE SET NULL, så alt vi ikke fjerner her
    // blir liggende for alltid uten eier. Rekkefølgen er derfor ikke kosmetisk.
    // Samme to spørringer som /api/me/delete STEP 1 — hold dem i takt.
    const { error: positiveError } = await supabase
      .from('findings')
      .delete()
      .eq('user_id', due.user_id)
      .eq('is_negative_observation', false);
    if (positiveError) {
      // Vi går IKKE videre til auth-slettingen. Sletter vi brukeren nå, mister
      // vi koblingen til radene og kan aldri finne dem igjen. Warning-raden
      // står, så neste kjøring prøver på nytt.
      errors.push(`positive findings ${due.user_id}: ${positiveError.message}`);
      continue;
    }

    // ⚠️ REGELEN ER `!== 'approximate'`, IKKE `=== 'private'`.
    //
    // Erklæringen (Personvern.retentionNegativeDesc) lover at det som overlever
    // er «kun observasjoner med omtrentlig delingsnivå (±500 m)». Sto det
    // `.eq('visibility', 'private')` her, ble OFFENTLIGE negative observasjoner
    // liggende — og for dem er display_* lik det eksakte punktet. Da beholdt vi
    // en eksakt posisjon vi hadde lovet å grovkorne.
    //
    // Dette må si nøyaktig det samme som RETAINED_VISIBILITY-grenen i
    // src/app/api/me/delete/route.ts. Denne funksjonen kjører på Deno og kan
    // ikke importere fra src/, så regelen står to steder med vilje;
    // src/lib/privacy/__tests__/retention-purge-path.test.ts vokter at de er enige.
    const RETAINED_VISIBILITY = 'approximate';

    const { error: nonRetainedError } = await supabase
      .from('findings')
      .delete()
      .eq('user_id', due.user_id)
      .eq('is_negative_observation', true)
      .neq('visibility', RETAINED_VISIBILITY);
    if (nonRetainedError) {
      errors.push(`non-retained findings ${due.user_id}: ${nonRetainedError.message}`);
      continue;
    }

    // Radene som blir igjen må faktisk VÆRE grovkornet. latitude/longitude er
    // det eksakte GPS-punktet; display_* er den jitrede kopien. Uten dette
    // steget beholdt vi det eksakte punktet med tidsstempel og art.
    const { data: retained, error: retainedError } = await supabase
      .from('findings')
      .select('id, display_latitude, display_longitude')
      .eq('user_id', due.user_id)
      .eq('is_negative_observation', true)
      .eq('visibility', RETAINED_VISIBILITY);
    if (retainedError) {
      errors.push(`retained lookup ${due.user_id}: ${retainedError.message}`);
      continue;
    }

    let coarsenFailed = false;
    for (const row of retained ?? []) {
      // Mangler display-koordinat (skal ikke kunne skje for 'approximate', men
      // vi gjetter ikke): slett heller enn å beholde et eksakt punkt.
      const { error: rowError } =
        row.display_latitude == null || row.display_longitude == null
          ? await supabase.from('findings').delete().eq('id', row.id)
          : await supabase
              .from('findings')
              .update({ latitude: row.display_latitude, longitude: row.display_longitude })
              .eq('id', row.id);
      if (rowError) {
        errors.push(`coarsen ${row.id}: ${rowError.message}`);
        coarsenFailed = true;
        break;
      }
    }
    if (coarsenFailed) continue;

    const { error: deleteError } = await supabase.auth.admin.deleteUser(due.user_id);
    if (deleteError) {
      errors.push(`delete ${due.user_id}: ${deleteError.message}`);
    } else {
      deletedAccounts++;
      // Audit log for compliance — the trigger ensures append-only.
      await supabase.from('admin_audit_log').insert({
        actor_id: null, // system-initiated
        action: 'account.auto_delete_inactive',
        target_user_id: due.user_id,
        metadata: { reason: '3-year-inactivity + 90-day-grace expired' }
      });
    }
  }

  console.log('[purge-inactive-accounts]', {
    issuedWarnings,
    emailsSent,
    awaitingEmail: selectAwaitingEmail(liveWarnings).length,
    clearedWarnings,
    deletedAccounts,
    errors
  });

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      issuedWarnings,
      emailsSent,
      // Varsler som venter på at e-post skal bli mulig å sende. Er dette > 0
      // over tid, er Resend ikke satt opp — og da slettes ingen kontoer.
      awaitingEmail: selectAwaitingEmail(liveWarnings).length,
      clearedWarnings,
      deletedAccounts,
      errors
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: errors.length === 0 ? 200 : 207 // multi-status when partial
    }
  );
});
