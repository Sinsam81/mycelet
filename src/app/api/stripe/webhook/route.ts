import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { BillingTier, resolveTierByPriceId } from '@/lib/billing/plans';
import { getStripeServerClient } from '@/lib/stripe/server';
import { createRequestLogger } from '@/lib/log/request';

export const runtime = 'nodejs';

function toIso(unixSeconds?: number | null) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function mapStripeStatus(status: Stripe.Subscription.Status) {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'canceled';
  if (status === 'unpaid') return 'unpaid';
  if (status === 'incomplete') return 'incomplete';
  if (status === 'incomplete_expired') return 'incomplete_expired';
  return 'inactive';
}

function computeSeasonPassEndDateIso() {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const endThisSeason = new Date(Date.UTC(currentYear, 10, 30, 23, 59, 59)); // 30. nov
  if (now.getTime() <= endThisSeason.getTime()) {
    return endThisSeason.toISOString();
  }
  return new Date(Date.UTC(currentYear + 1, 10, 30, 23, 59, 59)).toISOString();
}

async function upsertBillingByUserId(payload: {
  userId: string;
  tier: BillingTier;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('billing_subscriptions').upsert(
    {
      user_id: payload.userId,
      tier: payload.tier,
      status: payload.status,
      stripe_customer_id: payload.stripeCustomerId ?? null,
      stripe_subscription_id: payload.stripeSubscriptionId ?? null,
      stripe_price_id: payload.stripePriceId ?? null,
      current_period_start: payload.currentPeriodStart ?? null,
      current_period_end: payload.currentPeriodEnd ?? null,
      cancel_at_period_end: payload.cancelAtPeriodEnd ?? false,
      metadata: payload.metadata ?? {}
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function resolveUserIdFromCustomer(customerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('billing_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data?.user_id ?? null;
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('stripe.webhook.received');

  let webhookEventId: string | null = null;
  let webhookEventType = 'unknown';
  let canLogEvents = true;

  try {
    const stripe = getStripeServerClient();
    const admin = createAdminClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      log.error('stripe.webhook.no_secret');
      return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET mangler' }, { status: 500 });
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      log.warn('stripe.webhook.missing_signature');
      return NextResponse.json({ error: 'Mangler stripe-signature' }, { status: 400 });
    }

    const rawBody = await request.text();
    // constructEvent throws if the signature doesn't match — caught below
    // and logged at error level. That's the only place a real attack
    // would surface.
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    webhookEventId = event.id;
    webhookEventType = event.type;
    log.info('stripe.webhook.verified', { eventType: event.type, eventId: event.id });

    const { data: existingEvent, error: eventReadError } = await admin
      .from('billing_webhook_events')
      .select('event_id,status')
      .eq('event_id', event.id)
      .maybeSingle();

    if (eventReadError) {
      if (eventReadError.code === '42P01') {
        canLogEvents = false;
      } else {
        return NextResponse.json({ error: eventReadError.message }, { status: 500 });
      }
    }

    if (canLogEvents && existingEvent?.status === 'processed') {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const baseEventPayload = {
      event_id: event.id,
      event_type: event.type,
      status: 'received',
      payload: {
        livemode: event.livemode,
        created: event.created
      },
      error_message: null
    };

    if (canLogEvents && existingEvent) {
      const { error: touchError } = await admin
        .from('billing_webhook_events')
        .update(baseEventPayload)
        .eq('event_id', event.id);
      if (touchError) {
        return NextResponse.json({ error: touchError.message }, { status: 500 });
      }
    } else if (canLogEvents) {
      const { error: insertError } = await admin.from('billing_webhook_events').insert(baseEventPayload);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadataUserId = session.metadata?.user_id ?? null;
      const metadataTier = session.metadata?.tier as BillingTier | undefined;
      const metadataPrice = session.metadata?.price_id ?? null;

      if (session.mode === 'subscription' && typeof session.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price?.id ?? metadataPrice;
        const tier = metadataTier ?? resolveTierByPriceId(priceId);
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
        const userId = subscription.metadata?.user_id ?? metadataUserId ?? (customerId ? await resolveUserIdFromCustomer(customerId) : null);

        if (userId) {
          await upsertBillingByUserId({
            userId,
            tier,
            status: mapStripeStatus(subscription.status),
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            currentPeriodStart: toIso(subscription.current_period_start),
            currentPeriodEnd: toIso(subscription.current_period_end),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            metadata: { source: 'checkout.session.completed' }
          });
        }
      }

      if (session.mode === 'payment') {
        const customerId = typeof session.customer === 'string' ? session.customer : null;
        const userId = metadataUserId ?? (customerId ? await resolveUserIdFromCustomer(customerId) : null);
        if (userId) {
          await upsertBillingByUserId({
            userId,
            tier: 'season_pass',
            status: 'active',
            stripeCustomerId: customerId,
            stripePriceId: metadataPrice,
            currentPeriodStart: new Date().toISOString(),
            currentPeriodEnd: computeSeasonPassEndDateIso(),
            cancelAtPeriodEnd: true,
            metadata: { source: 'checkout.session.completed_payment' }
          });
        }
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
      const firstItem = subscription.items.data[0];
      const priceId = firstItem?.price?.id ?? null;
      const tier = resolveTierByPriceId(priceId);

      const userId = subscription.metadata?.user_id ?? (customerId ? await resolveUserIdFromCustomer(customerId) : null);
      if (userId) {
        await upsertBillingByUserId({
          userId,
          tier,
          status: mapStripeStatus(subscription.status),
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          currentPeriodStart: toIso(subscription.current_period_start),
          currentPeriodEnd: toIso(subscription.current_period_end),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          metadata: { source: event.type }
        });
      }
    }

    if (canLogEvents) {
      const { error: completeError } = await admin
        .from('billing_webhook_events')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          error_message: null
        })
        .eq('event_id', event.id);

      if (completeError) {
        return NextResponse.json({ error: completeError.message }, { status: 500 });
      }
    }

    log.info('stripe.webhook.processed', { eventType: webhookEventType, eventId: webhookEventId });
    return NextResponse.json({ received: true });
  } catch (error) {
    // Signature mismatch lands here — most security-relevant failure mode.
    log.error('stripe.webhook.failed', error, {
      eventId: webhookEventId,
      eventType: webhookEventType
    });

    if (webhookEventId && canLogEvents) {
      const admin = createAdminClient();
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      await admin.from('billing_webhook_events').upsert(
        {
          event_id: webhookEventId,
          event_type: webhookEventType,
          status: 'failed',
          error_message: errorMessage,
          processed_at: new Date().toISOString()
        },
        { onConflict: 'event_id' }
      );
    }

    return NextResponse.json(
      {
        error: 'Webhook-feil',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 400 }
    );
  }
}
