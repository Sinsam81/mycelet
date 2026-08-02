import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  RevenueCatWebhookBody,
  mapRevenueCatEvent,
  resolveSupabaseUserId,
  readManualGrant,
  isManualGrantActive,
  serializeManualGrant,
  applyManualGrantFloor,
  MANUAL_GRANT_SOURCE
} from '@/lib/billing/revenuecat';
import { hasPaidAccess, BillingStatus, BillingTier } from '@/lib/billing/plans';
import { createRequestLogger } from '@/lib/log/request';

/**
 * RevenueCat webhook — IAP purchases (Apple now, Google later) land in the
 * SAME `billing_subscriptions` row Stripe writes, so paid access is identical
 * regardless of store. See src/lib/billing/revenuecat.ts for event semantics.
 *
 * Cross-provider ownership: the row's metadata.provider records who wrote it
 * last ('revenuecat' | Stripe's writes). Grants always apply (new money takes
 * ownership); modify/revoke decisions only apply when the row is
 * RevenueCat-owned or not currently paid — an old Apple expiry/refund can
 * never clobber a subscription the user actively pays via Stripe. The Stripe
 * webhook enforces the mirror-image rule.
 *
 * Manual grants: a row an operator wrote by hand (metadata.source =
 * 'manual_grant' — founder pass, App Review demo account, customer service) is
 * a floor no store event can lower. See applyManualGrantFloor.
 *
 * Ordering: RevenueCat delivers at-least-once WITHOUT ordering. Every applied
 * event stores its event_timestamp_ms in metadata; an older event arriving
 * late (retry after a failure) is skipped instead of clobbering newer state.
 *
 * Auth: RevenueCat sends the dashboard-configured string verbatim in the
 * `Authorization` header (no signature scheme). Compared timing-safe via
 * SHA-256 digests (uniform length — no length oracle).
 *
 * Contract: respond 200 for everything we accept OR deliberately ignore —
 * RevenueCat retries non-200s up to 5 times, so only genuine server faults
 * (where a retry can succeed) may 5xx. Dedup on event.id via
 * billing_webhook_events (`rc_` prefix, shared table with Stripe).
 */

export const runtime = 'nodejs';

function authorized(request: NextRequest): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) return false;
  const received = request.headers.get('authorization') ?? '';
  // Hash both sides: constant compare length regardless of input length.
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

interface ExistingBillingRow {
  user_id: string;
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  metadata: Record<string, unknown> | null;
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!process.env.REVENUECAT_WEBHOOK_AUTH) {
    // Not configured yet — deployed ahead of the RevenueCat dashboard setup.
    log.warn('revenuecat.webhook.not_configured');
    return NextResponse.json({ error: 'RevenueCat-webhook er ikke konfigurert' }, { status: 503 });
  }

  if (!authorized(request)) {
    log.warn('revenuecat.webhook.unauthorized');
    return NextResponse.json({ error: 'Ugyldig autorisasjon' }, { status: 401 });
  }

  let body: RevenueCatWebhookBody;
  try {
    body = (await request.json()) as RevenueCatWebhookBody;
  } catch {
    log.warn('revenuecat.webhook.bad_json');
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 });
  }

  const event = body?.event;
  if (!event || typeof event !== 'object') {
    log.warn('revenuecat.webhook.missing_event');
    return NextResponse.json({ error: 'Mangler event' }, { status: 400 });
  }

  const eventId = event.id ? `rc_${event.id}` : null;
  const eventType = event.type ?? 'UNKNOWN';
  log.info('revenuecat.webhook.received', { eventType, eventId, store: event.store, environment: event.environment });

  try {
    const admin = createAdminClient();

    // ── Dedup (at-least-once delivery) ────────────────────────────────
    let canLogEvents = true;
    if (eventId) {
      const { data: existingEvent, error: eventReadError } = await admin
        .from('billing_webhook_events')
        .select('event_id,status')
        .eq('event_id', eventId)
        .maybeSingle();

      if (eventReadError) {
        if (eventReadError.code === '42P01') canLogEvents = false;
        else return NextResponse.json({ error: eventReadError.message }, { status: 500 });
      }
      if (canLogEvents && existingEvent?.status === 'processed') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      if (canLogEvents) {
        const { error: upsertError } = await admin.from('billing_webhook_events').upsert(
          {
            event_id: eventId,
            event_type: `revenuecat.${eventType}`,
            status: 'received',
            payload: { store: event.store, environment: event.environment, product_id: event.product_id },
            error_message: null
          },
          { onConflict: 'event_id' }
        );
        if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    const markProcessed = async (note?: string) => {
      if (!eventId || !canLogEvents) return;
      await admin
        .from('billing_webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: note ?? null })
        .eq('event_id', eventId);
    };
    const ackIgnored = async (reason: string) => {
      log.info('revenuecat.webhook.acked', { eventType, reason });
      await markProcessed(reason);
      return NextResponse.json({ received: true, ignored: reason });
    };

    // ── Sandbox gate ──────────────────────────────────────────────────
    // Sandbox/TestFlight purchases must not grant real premium after launch.
    // Keep REVENUECAT_ALLOW_SANDBOX=1 through sandbox testing AND App Review
    // (reviewers buy in sandbox!); remove it once the app is approved.
    if (event.environment === 'SANDBOX' && process.env.REVENUECAT_ALLOW_SANDBOX !== '1') {
      return await ackIgnored('sandbox');
    }

    // ── Map + apply ───────────────────────────────────────────────────
    const decision = mapRevenueCatEvent(event);

    if (decision.action === 'ack') {
      if (eventType === 'TRANSFER') {
        // Cross-account entitlement move — rare; needs manual follow-up so
        // the ORIGIN account doesn't keep a stale paid row.
        log.warn('revenuecat.webhook.transfer_needs_review', { eventId });
      }
      return await ackIgnored(decision.reason);
    }

    const userId = resolveSupabaseUserId(event);
    if (!userId) {
      // Anonymous purchase with no Supabase id anywhere — nothing to attach
      // it to. ACK (retrying won't help); RC re-sends future events with the
      // alias once the user logs in and the SDK links the ids.
      log.warn('revenuecat.webhook.no_user_id', { eventType, appUserId: event.app_user_id ?? null });
      return await ackIgnored('no_user_id');
    }

    // ── Ownership + ordering guards ───────────────────────────────────
    // Error here must 5xx (NOT ack): the guard protects paying customers, and
    // a RevenueCat retry gives the read another chance.
    const { data: existing, error: existingError } = await admin
      .from('billing_subscriptions')
      .select('user_id,tier,status,current_period_start,current_period_end,cancel_at_period_end,metadata')
      .eq('user_id', userId)
      .maybeSingle<ExistingBillingRow>();
    if (existingError) {
      log.error('revenuecat.webhook.guard_read_failed', existingError, { eventType, userId });
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingMeta = existing?.metadata ?? null;
    const rowIsPaid = Boolean(
      existing &&
        hasPaidAccess(existing.status as BillingStatus, existing.tier as BillingTier, existing.current_period_end)
    );
    const rowOwnedByRevenueCat = existingMeta?.provider === 'revenuecat';

    // Ordering: skip events older than the last RC event we applied.
    const lastAppliedTs = typeof existingMeta?.rc_event_timestamp_ms === 'number' ? existingMeta.rc_event_timestamp_ms : null;
    const eventTs = typeof event.event_timestamp_ms === 'number' ? event.event_timestamp_ms : null;
    if (rowOwnedByRevenueCat && lastAppliedTs !== null && eventTs !== null && eventTs < lastAppliedTs) {
      return await ackIgnored('stale_event');
    }

    // Manuelt tildelt tilgang — founder-passet, App Review-demokontoen,
    // kundeservice-pass. Ikke et kjøp, og butikken eier den ikke.
    const manualGrant = readManualGrant(existing);
    const manualGrantActive = isManualGrantActive(manualGrant);

    // Ownership: modify/revoke only touch rows RevenueCat owns (or unpaid
    // rows). A paid row written by Stripe (subscription OR one-time season
    // pass) is off-limits for anything except a fresh grant.
    if (decision.kind !== 'grant' && rowIsPaid && !rowOwnedByRevenueCat) {
      const reason = manualGrantActive ? 'manual_grant_active' : 'foreign_provider_active';
      log.info('revenuecat.webhook.skipped_foreign_provider', { eventType, userId, kind: decision.kind, reason });
      return await ackIgnored(reason);
    }

    // Gulvet: et gyldig manuelt pass kan ikke senkes av en butikkhendelse.
    // Rekkefølgen betyr noe — dette kjører ETTER eierskapsvakten, så et aktivt
    // Stripe-abonnement fortsatt bare blir ACK-et og latt i fred.
    const { update: write, floorApplied } = applyManualGrantFloor(decision.update, manualGrant);
    if (floorApplied) {
      log.warn('revenuecat.webhook.manual_grant_floor', {
        eventType,
        userId,
        kind: decision.kind,
        environment: event.environment ?? null,
        grantTier: manualGrant?.tier ?? null,
        grantEnd: manualGrant?.currentPeriodEnd ?? null
      });
    }

    const rcMetadata = {
      store: event.store ?? null,
      rc_product_id: event.product_id ?? null,
      rc_event_type: eventType,
      rc_event_timestamp_ms: eventTs,
      rc_environment: event.environment ?? null
    };
    // Passet følger raden uansett hvem som eier den, slik at det kan leses
    // tilbake senere. Når gulvet gjelder, eier passet raden — da holder
    // eierskapsvakten over senere EXPIRATION/refusjon unna den helt.
    const metadata = manualGrant
      ? {
          ...rcMetadata,
          provider: floorApplied ? MANUAL_GRANT_SOURCE : 'revenuecat',
          ...(floorApplied ? { source: MANUAL_GRANT_SOURCE, note: manualGrant.note } : {}),
          manual_grant: serializeManualGrant(manualGrant)
        }
      : { ...rcMetadata, provider: 'revenuecat' };

    // Upsert ONLY the shared billing columns — the stripe_* identifier
    // columns are left untouched so a web subscription's ids survive.
    const { error: upsertError } = await admin.from('billing_subscriptions').upsert(
      {
        user_id: userId,
        tier: write.tier,
        status: write.status,
        current_period_start: write.currentPeriodStart,
        current_period_end: write.currentPeriodEnd,
        cancel_at_period_end: write.cancelAtPeriodEnd,
        metadata
      },
      { onConflict: 'user_id' }
    );
    if (upsertError) {
      log.error('revenuecat.webhook.upsert_failed', upsertError, { eventType, userId });
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    await markProcessed();
    log.info('revenuecat.webhook.processed', {
      eventType,
      userId,
      tier: write.tier,
      status: write.status,
      kind: decision.kind,
      manualGrantFloor: floorApplied
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    log.error('revenuecat.webhook.failed', error, { eventType, eventId });
    return NextResponse.json(
      { error: 'Webhook-feil', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
