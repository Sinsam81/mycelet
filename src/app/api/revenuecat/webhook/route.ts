import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  RevenueCatWebhookBody,
  mapRevenueCatEvent,
  resolveSupabaseUserId
} from '@/lib/billing/revenuecat';
import { hasPaidAccess } from '@/lib/billing/plans';
import { createRequestLogger } from '@/lib/log/request';

/**
 * RevenueCat webhook — IAP purchases (Apple now, Google later) land in the
 * SAME `billing_subscriptions` row Stripe writes, so paid access is identical
 * regardless of store. See src/lib/billing/revenuecat.ts for event semantics.
 *
 * Auth: RevenueCat sends the dashboard-configured string verbatim in the
 * `Authorization` header on every delivery (no signature scheme). We compare
 * timing-safe against REVENUECAT_WEBHOOK_AUTH.
 *
 * Contract: respond 200 for everything we accept OR deliberately ignore —
 * RevenueCat retries non-200s up to 5 times with backoff, so only genuine
 * server faults may 5xx. Dedup on event.id via billing_webhook_events
 * (prefixed `rc_` to share the table with Stripe event ids).
 */

export const runtime = 'nodejs';

function authorized(request: NextRequest): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) return false;
  const received = request.headers.get('authorization') ?? '';
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

    // ── Sandbox gate ──────────────────────────────────────────────────
    // Sandbox/TestFlight purchases must not grant real premium in prod.
    // Enable REVENUECAT_ALLOW_SANDBOX=1 during pre-launch testing only.
    if (event.environment === 'SANDBOX' && process.env.REVENUECAT_ALLOW_SANDBOX !== '1') {
      log.info('revenuecat.webhook.ignored_sandbox', { eventType });
      await markProcessed('ignored_sandbox');
      return NextResponse.json({ received: true, ignored: 'sandbox' });
    }

    // ── Map + apply ───────────────────────────────────────────────────
    const decision = mapRevenueCatEvent(event);

    if (decision.action === 'ack') {
      if (eventType === 'TRANSFER') {
        // Cross-account entitlement move — rare; needs manual follow-up.
        log.warn('revenuecat.webhook.transfer_needs_review', { eventId });
      }
      log.info('revenuecat.webhook.acked', { eventType, reason: decision.reason });
      await markProcessed(decision.reason);
      return NextResponse.json({ received: true, ignored: decision.reason });
    }

    const userId = resolveSupabaseUserId(event);
    if (!userId) {
      // Anonymous purchase with no Supabase id anywhere — nothing to attach
      // it to. ACK (retrying won't help); RC re-sends future events with the
      // alias once the user logs in and the SDK links the ids.
      log.warn('revenuecat.webhook.no_user_id', { eventType, appUserId: event.app_user_id ?? null });
      await markProcessed('no_user_id');
      return NextResponse.json({ received: true, ignored: 'no_user_id' });
    }

    // ── Cross-provider guard ──────────────────────────────────────────
    // Never let an Apple revoke-event (expiry/refund of an old IAP) clobber a
    // subscription the user actively pays for via Stripe on web.
    const { data: existing } = await admin
      .from('billing_subscriptions')
      .select('user_id,tier,status,current_period_end,stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    const hasActiveStripe = Boolean(
      existing?.stripe_subscription_id &&
        hasPaidAccess(
          existing.status as Parameters<typeof hasPaidAccess>[0],
          existing.tier as Parameters<typeof hasPaidAccess>[1],
          existing.current_period_end
        )
    );
    if (decision.revokes && hasActiveStripe) {
      log.info('revenuecat.webhook.skipped_stripe_active', { eventType, userId });
      await markProcessed('skipped_stripe_active');
      return NextResponse.json({ received: true, ignored: 'stripe_active' });
    }

    // Upsert ONLY the shared billing columns — the stripe_* columns are left
    // untouched so a web subscription's identifiers survive IAP events.
    const { error: upsertError } = await admin.from('billing_subscriptions').upsert(
      {
        user_id: userId,
        tier: decision.update.tier,
        status: decision.update.status,
        current_period_start: decision.update.currentPeriodStart,
        current_period_end: decision.update.currentPeriodEnd,
        cancel_at_period_end: decision.update.cancelAtPeriodEnd,
        metadata: {
          provider: 'revenuecat',
          store: event.store ?? null,
          rc_product_id: event.product_id ?? null,
          rc_event_type: eventType,
          rc_environment: event.environment ?? null
        }
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
      tier: decision.update.tier,
      status: decision.update.status,
      revokes: decision.revokes
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
