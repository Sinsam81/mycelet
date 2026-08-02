import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { BillingTier, resolveTierByPriceId } from '@/lib/billing/plans';
import { getStripeServerClient } from '@/lib/stripe/server';
import { createRequestLogger } from '@/lib/log/request';
import { resolveSubscriptionPeriod, type SubscriptionPeriod } from '@/lib/billing/subscription-period';
import { seasonPassEndDateIso } from '@/lib/billing/season-pass';
import {
  decideStripeWrite,
  type StripeBillingRow,
  type StripeEventFacts
} from '@/lib/billing/stripe-webhook-decision';

export const runtime = 'nodejs';

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

async function upsertBillingByUserId(payload: {
  userId: string;
  tier: BillingTier;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  /**
   * Sett når Stripe ikke oppga noen periode i det hele tatt. Da utelates
   * periodekolonnene fra upserten, slik at en dato som allerede står i raden
   * overlever. Alternativet — å skrive null — leses av hasPaidAccess() som
   * «ingen utløpsdato» = tilgang for alltid.
   */
  periodUnknown?: boolean;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const periodColumns = payload.periodUnknown
    ? {}
    : {
        current_period_start: payload.currentPeriodStart ?? null,
        current_period_end: payload.currentPeriodEnd ?? null
      };

  const { error } = await admin.from('billing_subscriptions').upsert(
    {
      user_id: payload.userId,
      tier: payload.tier,
      status: payload.status,
      stripe_customer_id: payload.stripeCustomerId ?? null,
      stripe_subscription_id: payload.stripeSubscriptionId ?? null,
      stripe_price_id: payload.stripePriceId ?? null,
      ...periodColumns,
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
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  // Uten denne sjekken var «spørringen feilet» og «kunden finnes ikke hos oss»
  // det samme svaret: null. Kalleren tolker null som «ingen bruker å oppdatere»
  // og hopper stille over hendelsen — så en forbigående DB-feil kunne bety at
  // et abonnement aldri ble aktivert, eller at en kansellering aldri slo inn,
  // uten spor noe sted.
  //
  // Vi kaster i stedet, slik upsertBillingByUserId over allerede gjør. Da får
  // Stripe en ikke-2xx og prøver hendelsen på nytt — som er hele poenget med
  // webhook-retries.
  if (error) {
    throw new Error(`resolveUserIdFromCustomer failed: ${error.message}`);
  }

  return data?.user_id ?? null;
}

/**
 * Raden slik den står nå. Alle vaktene i decideStripeWrite leser den:
 * rekkefølge (metadata.stripe_event_created), hvilket abonnement raden peker
 * på, om RevenueCat eier den, og om det ligger et manuelt tildelt pass der.
 *
 * Feiler lesingen KASTER vi. Da får Stripe en ikke-2xx og prøver på nytt —
 * mye bedre enn å skrive i blinde og risikere at en betalende kunde mister
 * tilgangen fordi vakten ikke fikk lest raden sin.
 */
async function readBillingRow(userId: string): Promise<StripeBillingRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('tier,status,current_period_start,current_period_end,cancel_at_period_end,stripe_subscription_id,metadata')
    .eq('user_id', userId)
    .maybeSingle<StripeBillingRow>();

  if (error) throw new Error(`readBillingRow failed: ${error.message}`);
  return data ?? null;
}

/**
 * Les raden, avgjør hva som skal skrives, og skriv det.
 *
 * All logikken ligger i decideStripeWrite (ren, testet). Her er bare I/O-en og
 * loggingen — inkludert de tre tilfellene der vi bevisst IKKE skriver, som må
 * være synlige i loggen for å kunne feilsøkes.
 */
async function applyDecision(
  facts: StripeEventFacts,
  target: { userId: string; customerId: string | null; subscriptionId: string | null; priceId: string | null },
  log: ReturnType<typeof createRequestLogger>
) {
  const existing = await readBillingRow(target.userId);
  const decision = decideStripeWrite(facts, existing);

  if (decision.action === 'skip') {
    log.warn('stripe.webhook.write_skipped', {
      eventType: facts.eventType,
      userId: target.userId,
      reason: decision.reason,
      subscriptionId: facts.subscriptionId
    });
    return;
  }

  if (decision.tierKept) {
    // Pris-ID-en i hendelsen finnes ikke i STRIPE_PRICE_*. Uten vakten hadde
    // kunden blitt satt til tier 'free' midt i et løpende abonnement.
    log.warn('stripe.webhook.unknown_price_kept_tier', {
      eventType: facts.eventType,
      userId: target.userId,
      priceId: target.priceId,
      tier: decision.write.tier
    });
  }
  if (decision.manualGrantFloor) {
    log.warn('stripe.webhook.manual_grant_floor', {
      eventType: facts.eventType,
      userId: target.userId,
      tier: decision.write.tier,
      currentPeriodEnd: decision.write.currentPeriodEnd
    });
  }

  await upsertBillingByUserId({
    userId: target.userId,
    tier: decision.write.tier,
    status: decision.write.status,
    stripeCustomerId: target.customerId,
    stripeSubscriptionId: target.subscriptionId,
    stripePriceId: target.priceId,
    currentPeriodStart: decision.write.currentPeriodStart,
    currentPeriodEnd: decision.write.currentPeriodEnd,
    periodUnknown: decision.write.periodUnknown,
    cancelAtPeriodEnd: decision.write.cancelAtPeriodEnd,
    metadata: decision.write.metadata
  });
}

/**
 * Hent perioden og gjør det synlig hvor den kom fra.
 *
 * `items` betyr at Stripe rendret payloaden i en Basil-versjon eller nyere —
 * verdt en linje i loggen, siden det er nettopp den flyttingen som en gang
 * gjorde utløpsdatoen til null. `missing` er alvorlig: da vet vi ikke når
 * tilgangen skal ta slutt, og en dato må aldri forsvinne uten spor.
 */
function readSubscriptionPeriod(
  subscription: unknown,
  log: ReturnType<typeof createRequestLogger>,
  context: { eventType: string; subscriptionId?: string | null }
): SubscriptionPeriod {
  const period = resolveSubscriptionPeriod(subscription);

  if (period.source === 'missing') {
    log.warn('stripe.webhook.period_missing', {
      ...context,
      hint: 'Verken subscription.current_period_end eller items[].current_period_end fantes. Utløpsdatoen i basen blir stående urørt.'
    });
  } else if (period.source === 'items') {
    log.info('stripe.webhook.period_from_items', { ...context, currentPeriodEnd: period.end });
  }

  return period;
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
          // Dette objektet er hentet med SDK-en (pinnet til 2024-06-20), så
          // her ligger perioden normalt på topnivå. Vi går likevel gjennom
          // samme leser, så en fremtidig versjonsbump ikke stille slår ut
          // utløpsdatoen her heller.
          const period = readSubscriptionPeriod(subscription, log, {
            eventType: event.type,
            subscriptionId: subscription.id
          });

          await applyDecision(
            {
              eventType: 'checkout.session.completed',
              eventCreated: event.created,
              subscriptionId: subscription.id,
              status: mapStripeStatus(subscription.status),
              tier,
              currentPeriodStart: period.start,
              currentPeriodEnd: period.end,
              periodUnknown: period.source === 'missing',
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              // Abonnementet er nettopp hentet fra Stripe, så innholdet er
              // sant nå — også hvis selve hendelsen er en gammel retry.
              freshFromApi: true
            },
            { userId, customerId, subscriptionId: subscription.id, priceId },
            log
          );
        }
      }

      if (session.mode === 'payment') {
        // Død gren i dag: checkout-ruta setter alltid mode 'subscription', og
        // begge live-prisene er recurring. Beholdt for det tilfellet at et
        // engangsprodukt legges inn — men med riktig varighet. Den regnet
        // tidligere ut «30. november», altså to måneder for en kunde som
        // kjøpte 1. oktober, mens vi lover ett år.
        const customerId = typeof session.customer === 'string' ? session.customer : null;
        const userId = metadataUserId ?? (customerId ? await resolveUserIdFromCustomer(customerId) : null);
        if (userId) {
          const purchasedAt = new Date();
          await applyDecision(
            {
              eventType: 'checkout.session.completed_payment',
              eventCreated: event.created,
              subscriptionId: null,
              status: 'active',
              tier: 'season_pass',
              currentPeriodStart: purchasedAt.toISOString(),
              currentPeriodEnd: seasonPassEndDateIso(purchasedAt),
              periodUnknown: false,
              cancelAtPeriodEnd: true,
              freshFromApi: true
            },
            { userId, customerId, subscriptionId: null, priceId: metadataPrice },
            log
          );
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
        // Her kommer objektet rått fra Stripe, rendret i kontoens
        // API-versjon — ikke i SDK-ens. Det er denne grenen som skrev null.
        const period = readSubscriptionPeriod(subscription, log, {
          eventType: event.type,
          subscriptionId: subscription.id
        });

        await applyDecision(
          {
            eventType: event.type,
            eventCreated: event.created,
            subscriptionId: subscription.id,
            status: mapStripeStatus(subscription.status),
            tier,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            periodUnknown: period.source === 'missing',
            cancelAtPeriodEnd: subscription.cancel_at_period_end
          },
          { userId, customerId, subscriptionId: subscription.id, priceId },
          log
        );
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
