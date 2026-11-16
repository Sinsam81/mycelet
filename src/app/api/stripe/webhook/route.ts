import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { erManglendeTabell } from '@/lib/supabase/tabell-finnes';
import { BillingTier, isPaidTier, resolveTierByPriceId } from '@/lib/billing/plans';
import { billingTierLabel } from '@/lib/billing/copy';
import { manglendeEpostKonfig, sendEpost } from '@/lib/email/send';
import {
  bestemProvePaaminnelse,
  byggProvePaaminnelseEpost,
  lesRabatt,
  rabattStorrelseUkjent,
  sprakFraMetadata
} from '@/lib/billing/prove-paaminnelse';
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

/**
 * Taket for hele kjøringen. Uten det arvet ruta plattformens standardgrense,
 * og et kall som hang holdt funksjonen i live lenge etter at Stripe hadde
 * gitt opp å vente og lagt hendelsen i kø for et nytt forsøk — da kunne to
 * kjøringer av samme hendelse stå samtidig. Fristene under gjør at et tregt
 * kall feiler INNE i ruta (logget, og merket «failed» i
 * billing_webhook_events); dette taket er nettet under dem, for alt som ikke
 * har egen frist (databasekallene). Blir funksjonen drept her, står hendelsen
 * som «received», og Stripes neste forsøk behandler den på nytt.
 */
export const maxDuration = 60;

/**
 * Fristen for ETT kall til Stripes API herfra. SDK-ens standard er 80 s per
 * forsøk og ett nytt forsøk — nesten tre minutter for et kall som normalt tar
 * et halvt sekund. Ett nytt forsøk beholdes (et brutt oppkall er vanligere
 * enn et tregt svar), så verste fall er rundt 20 s. Går fristen ut, kaster
 * SDK-en, hendelsen svarer ikke-2xx, og Stripe leverer den på nytt.
 */
const STRIPE_KALL = { timeout: 10_000, maxNetworkRetries: 1 } as const satisfies Stripe.RequestOptions;

/** Supabase Auth (getUserById) og Resend har ingen egen frist; de får denne. */
const OPPSLAG_FRIST_MS = 8_000;

/** Løftet, eller en avvisning når fristen er ute. Tidtakeren ryddes uansett utfall. */
function medFrist<T>(lofte: PromiseLike<T>, ms: number, hva: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tidtaker = setTimeout(() => reject(new Error(`${hva}: ingen svar på ${ms} ms`)), ms);
    Promise.resolve(lofte).then(
      (verdi) => {
        clearTimeout(tidtaker);
        resolve(verdi);
      },
      (feil) => {
        clearTimeout(tidtaker);
        reject(feil);
      }
    );
  });
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

/** Stripe svarer at abonnementet ikke finnes (lenger): `resource_missing` / 404. */
function erAlleredeBorteHosStripe(err: unknown): boolean {
  const feil = (err ?? {}) as { code?: unknown; statusCode?: unknown };
  return feil.code === 'resource_missing' || feil.statusCode === 404;
}

/** Supabase Auth svarte uttrykkelig at brukeren ikke finnes (404 «user_not_found»). */
function erBrukerIkkeFunnet(error: { status?: number; code?: string } | null | undefined): boolean {
  return error?.status === 404 || error?.code === 'user_not_found';
}

/**
 * Finnes auth-brukeren fortsatt? Slettede kontoer har ingen rad å skrive til.
 *
 * Svaret «nei» SIER OPP et løpende abonnement hos Stripe (se kallstedet), så
 * det gis bare når Supabase Auth uttrykkelig svarer at brukeren ikke finnes.
 * Alt annet — tidsavbrudd, nettverksbrudd, 429, 5xx, en avvist nøkkel — er
 * «vet ikke», og da går hendelsen den vanlige veien: finnes brukeren, skrives
 * raden; er hen slettet, feiler skrivingen høyt (FK-brudd), Stripe prøver
 * igjen, og neste forsøk får et ordentlig svar.
 *
 * Før sto det `if (error) return false`. auth-js legger også nettverksfeil,
 * 429 og 5xx i `error` (samme felle som /auth/reset gikk i — se
 * erForbigaaendeAuthFeil i src/lib/auth/auth-feil.ts), så et kort utfall hos
 * Supabase Auth midt i en fornyelse ville sagt opp abonnementet til en
 * betalende kunde. Her er regelen strengere enn der: også 401/403 er «vet
 * ikke», for de sier at VI ikke fikk spørre, ikke at brukeren er borte.
 */
async function brukerFinnes(userId: string, log: ReturnType<typeof createRequestLogger>): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await medFrist(admin.auth.admin.getUserById(userId), OPPSLAG_FRIST_MS, 'auth.getUserById');
    if (error) {
      if (erBrukerIkkeFunnet(error)) return false;
      log.warn('stripe.webhook.user_lookup_uncertain', { userId, status: error.status ?? null, code: error.code ?? null });
      return true;
    }
    return Boolean(data?.user);
  } catch (err) {
    // Uten admin-klient, eller uten svar innen fristen, kan vi ikke vite — la
    // den vanlige stien prøve (og feile høyt).
    log.warn('stripe.webhook.user_lookup_uncertain', { userId, detalj: err instanceof Error ? err.message : 'ukjent' });
    return true;
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

/**
 * Tre dager før gratisuka på nett blir til et trekk (customer.subscription.
 * trial_will_end): én e-post i kundens språk med beløpet fra Stripe-prisen og
 * lenke til der man sier opp. Reglene og teksten ligger i
 * src/lib/billing/prove-paaminnelse.ts (rene, testet); her er bare I/O-en.
 *
 * Skriver ingenting til billing_subscriptions — raden oppdateres av
 * subscription.updated som før. Feiler sendingen, logges det og hendelsen
 * regnes som behandlet: et 4xx hadde fått Stripe til å prøve i tre døgn, og
 * da er prøveperioden over. Resends idempotensnøkkel stopper dobbeltsending
 * hvis Stripe likevel leverer hendelsen to ganger.
 *
 * Rabatt: checkout tillater kampanjekoder, og hendelsen (kontoens rendring)
 * bærer da bare rabattens id. Vi henter abonnementet én gang med
 * expand=discounts for å få kupongen; går det galt, sendes e-posten uten
 * tall heller enn med listeprisen.
 */
async function sendProvePaaminnelse(
  subscription: Stripe.Subscription,
  stripe: Stripe,
  log: ReturnType<typeof createRequestLogger>
) {
  const mangler = manglendeEpostKonfig();
  if (mangler.length > 0) {
    log.warn('stripe.prove_paaminnelse.epost_ikke_konfigurert', { mangler, subscriptionId: subscription.id });
    return;
  }

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
  const userId = subscription.metadata?.user_id ?? (customerId ? await resolveUserIdFromCustomer(customerId) : null);
  if (!userId) {
    log.warn('stripe.prove_paaminnelse.ingen_bruker', { subscriptionId: subscription.id });
    return;
  }

  const price = subscription.items.data[0]?.price;
  let rabatt = lesRabatt(subscription);
  if (rabatt && rabattStorrelseUkjent(rabatt)) {
    try {
      rabatt = lesRabatt(await stripe.subscriptions.retrieve(subscription.id, { expand: ['discounts'] }, STRIPE_KALL));
    } catch (err) {
      log.warn('stripe.prove_paaminnelse.rabatt_ukjent', {
        subscriptionId: subscription.id,
        detalj: err instanceof Error ? err.message : 'ukjent'
      });
    }
  }
  const beslutning = bestemProvePaaminnelse({
    status: subscription.status,
    trialEndSek: subscription.trial_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    unitAmount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    rabatt,
    naaMs: Date.now()
  });
  if (!beslutning.send) {
    log.info('stripe.prove_paaminnelse.hoppet_over', { grunn: beslutning.grunn, subscriptionId: subscription.id });
    return;
  }

  const admin = createAdminClient();
  // Samme utfall som en feil fra oppslaget når det ikke svarer innen fristen:
  // advarsel, ingen e-post, hendelsen behandlet. Fristen endrer ikke regelen,
  // bare hvor lenge vi venter på å få bruke den.
  const { data, error } = await medFrist(admin.auth.admin.getUserById(userId), OPPSLAG_FRIST_MS, 'auth.getUserById').catch(
    (err: unknown) => ({ data: null, error: { message: err instanceof Error ? err.message : 'ukjent' } })
  );
  const bruker = data?.user ?? null;
  const email = bruker?.email;
  if (error || !bruker || !email) {
    log.warn('stripe.prove_paaminnelse.ingen_epostadresse', { userId, subscriptionId: subscription.id, message: error?.message });
    return;
  }

  const locale = sprakFraMetadata(bruker.user_metadata);
  const tier = resolveTierByPriceId(price?.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mycelet.com';
  const epost = byggProvePaaminnelseEpost({
    locale,
    plan: isPaidTier(tier) ? billingTierLabel(tier, locale) : 'Premium',
    dagerIgjen: beslutning.dagerIgjen,
    sluttIso: beslutning.sluttIso,
    belop: beslutning.belop,
    // Prissiden har «Administrer abonnement» (Stripe-portalen); profilsiden
    // viser bare plan og status og har ingen oppsigelse.
    oppsigelseUrl: `${appUrl}/pricing`
  });

  try {
    // sendEpost har ingen egen frist. Går denne ut, havner det i catch-en
    // under som en mislykket sending — logget, og hendelsen behandlet.
    const res = await medFrist(
      sendEpost({ til: email, ...epost, idempotensNokkel: `stripe/prove-slutt/${subscription.id}` }),
      OPPSLAG_FRIST_MS,
      'resend'
    );
    if (res.ok) {
      log.info('stripe.prove_paaminnelse.sendt', {
        userId,
        subscriptionId: subscription.id,
        dagerIgjen: beslutning.dagerIgjen,
        locale,
        medBelop: beslutning.belop !== null
      });
    } else {
      log.warn('stripe.prove_paaminnelse.sending_feilet', { userId, subscriptionId: subscription.id, detalj: res.detalj });
    }
  } catch (err) {
    log.warn('stripe.prove_paaminnelse.sending_feilet', {
      userId,
      subscriptionId: subscription.id,
      detalj: err instanceof Error ? err.message : 'ukjent'
    });
  }
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
      if (erManglendeTabell(eventReadError)) {
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
        const subscription = await stripe.subscriptions.retrieve(session.subscription, STRIPE_KALL);
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
      // Spøkelsesabonnement: brukeren er slettet (cascaden tok raden), men
      // Stripe fakturerer videre. Før sa opsertet FK-brudd → 400 → Stripe
      // prøvde på nytt i tre døgn, ved hver fornyelse, uten at noen så det.
      // Sikkerhetsnett: et løpende abonnement uten eier sies opp her.
      if (userId && !(await brukerFinnes(userId, log))) {
        const lopende = ['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status);
        log.warn('stripe.webhook.subscription_for_deleted_user', {
          eventType: event.type,
          subscriptionId: subscription.id,
          status: subscription.status,
          avsluttes: lopende && event.type !== 'customer.subscription.deleted'
        });
        if (lopende && event.type !== 'customer.subscription.deleted') {
          try {
            await stripe.subscriptions.cancel(subscription.id, STRIPE_KALL);
          } catch (err) {
            // Med en frist kan et forsøk ha gått gjennom hos Stripe uten at
            // svaret kom fram. Neste levering av samme hendelse sier fortsatt
            // «løpende», og oppsigelsen svarer da at abonnementet ikke finnes.
            // Målet er nådd — samme regel som avsluttStripeVedSletting. Alt
            // annet kastes videre, så Stripe prøver igjen.
            if (!erAlleredeBorteHosStripe(err)) throw err;
            log.info('stripe.webhook.subscription_already_gone', { subscriptionId: subscription.id });
          }
        }
      } else if (userId) {
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

    if (event.type === 'customer.subscription.trial_will_end') {
      await sendProvePaaminnelse(event.data.object as Stripe.Subscription, stripe, log);
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

    // Feilteksten følger bare med når signaturen ER verifisert (da er
    // avsenderen Stripe, og svaret er det som står på leveringsforsøket i
    // Stripe-dashbordet). Før det kan hvem som helst ha sendt forespørselen,
    // og da skal verken konfigurasjonsfeil eller unntakstekst ut — den står i
    // loggen over.
    return NextResponse.json(
      webhookEventId
        ? { error: 'Webhook-feil', details: error instanceof Error ? error.message : 'unknown' }
        : { error: 'Webhook-feil' },
      { status: 400 }
    );
  }
}
