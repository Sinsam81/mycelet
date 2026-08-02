import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { planCheckoutWrite } from '@/lib/billing/checkout-write';
import { alreadyOnPlanMessage, billingCopy } from '@/lib/billing/copy';
import { reusableCheckoutUrl } from '@/lib/billing/checkout-reuse';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { getStripeServerClient } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

type CheckoutPlan = 'premium' | 'season_pass';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('billing.checkout.start');

  // Hentes FØR try-blokken: alle svarene under er tekst kunden leser, og
  // catch-blokken nederst trenger språket også. Oppslaget leser cookies og kan
  // kaste utenfor en request-kontekst — det skal ikke ta ned kjøpsflyten.
  let locale: Locale = DEFAULT_LOCALE;
  try {
    locale = await getUserLocale();
  } catch {
    // beholder norsk
  }

  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      log.info('billing.checkout.unauthenticated');
      return NextResponse.json({ error: billingCopy('unauthenticated', locale) }, { status: 401 });
    }

    const userLog = log.child({ userId: user.id });

    // Each Stripe Checkout session has a real cost (Stripe API call,
    // potential customer-record creation). 5/min per user is generous for
    // any honest UI flow and stops compromised-account spam.
    const rateLimit = checkRateLimit(`billing-checkout:${getClientKey(request, user.id)}`, 5, 60);
    if (!rateLimit.allowed) {
      userLog.warn('billing.checkout.rate_limited');
      return rateLimitResponse(rateLimit);
    }

    const body = (await request.json()) as {
      plan?: CheckoutPlan;
      /** The customer ticked "start delivery now, I know I keep my 14-day right". */
      immediateDeliveryConsent?: boolean;
      /** Which wording they were shown, so a later dispute can be answered. */
      consentVersion?: string;
    };
    const plan = body.plan;
    if (!plan || !(plan in BILLING_PLANS)) {
      return NextResponse.json({ error: billingCopy('invalidPlan', locale) }, { status: 400 });
    }

    // Distance selling: the consumer has to ask for delivery to start before the
    // withdrawal period is over. Previously the tick lived only in React state
    // and never reached the server, so there was no record that it happened —
    // and no way to answer a chargeback claiming there was no consent. Refusing
    // checkout without it is deliberate: an unrecorded consent is no consent.
    if (body.immediateDeliveryConsent !== true) {
      userLog.warn('billing.checkout.missing_delivery_consent', { tier: plan });
      return NextResponse.json({ error: billingCopy('missingConsent', locale) }, { status: 400 });
    }
    const consentVersion = typeof body.consentVersion === 'string' ? body.consentVersion.slice(0, 32) : 'v1';
    const consentAt = new Date().toISOString();

    const selectedPlan = BILLING_PLANS[plan];
    const priceId = process.env[selectedPlan.priceEnvKey];
    if (!priceId) {
      // Navnet på miljøvariabelen hører hjemme i loggen, ikke i nettleseren:
      // for kunden er det uforståelig, og for en angriper er det en fasitliste
      // over hvilke variabler produksjonsmiljøet har.
      userLog.error('billing.checkout.missing_price_env', undefined, { priceEnvKey: selectedPlan.priceEnvKey });
      return NextResponse.json({ error: billingCopy('checkoutUnavailable', locale) }, { status: 500 });
    }

    const stripe = getStripeServerClient();
    const existing = await getUserBillingSubscription(supabase, user.id);
    const existingCapabilities = getBillingCapabilities(existing);

    if (existingCapabilities.paid && existingCapabilities.tier === plan) {
      return NextResponse.json({ error: alreadyOnPlanMessage(selectedPlan.tier, locale) }, { status: 409 });
    }

    // Bytte fra én betalt plan til en annen går ikke gjennom her.
    //
    // Denne ruta oppretter alltid et NYTT Stripe-abonnement. Gjorde en aktiv
    // Premium-kunde et bytte til Sesongpass, satt de igjen med to aktive
    // abonnement og ble belastet for begge — og webhooken, som nøkler på
    // user_id, ville latt neste hendelse fra det gamle abonnementet skrive over
    // det nye. Dobbeltbelastning og feil tilgangsnivå.
    //
    // Den ordentlige løsningen er stripe.subscriptions.update() med en avklart
    // proratering, men det er en betalingsendring som må avgjøres og testes mot
    // Stripe før den slippes løs på ekte kunder.
    //
    // Inntil da: si det rett ut. Å si opp koster brukeren ingenting — de
    // beholder tilgangen ut perioden de har betalt for (hasPaidAccess krever
    // active/trialing, så status «canceled» slipper dem gjennom denne sjekken
    // med en gang), og kan kjøpe den andre planen når de vil.
    if (existingCapabilities.paid) {
      userLog.info('billing.checkout.plan_change_blocked', {
        fromTier: existingCapabilities.tier,
        toTier: plan
      });
      return NextResponse.json(
        {
          error: billingCopy('planChangeBlocked', locale),
          details: billingCopy('planChangeBlockedDetails', locale)
        },
        { status: 409 }
      );
    }

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      // Uten idempotensnøkkel lagde to samtidige førstegangskjøp (rate limiten
      // slipper gjennom 5/min) TO Stripe-kunder for samme bruker. Abonnementet
      // kunne da havne på den ene mens raden vår pekte på den andre —
      // databasen har UNIQUE på stripe_customer_id, så bare siste skriving
      // overlevde. Kunden så en tom kundeportal og fikk ikke sagt opp trekket
      // som faktisk løp. Nøkkelen er bundet til brukeren, ikke til klokka.
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: { user_id: user.id }
        },
        { idempotencyKey: `customer_${user.id}` }
      );
      customerId = customer.id;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    // Both plans are recurring subscriptions: Premium bills monthly, Sesongpass
    // yearly (auto-renewing). The billing interval lives on the Stripe price.
    const mode = 'subscription' as const;

    // Har kunden allerede en åpen Checkout-sesjon for NØYAKTIG dette kjøpet,
    // sendes de tilbake til den i stedet for at vi lager en ny.
    //
    // Idempotensnøkkelen under er et fem-minutters klokkevindu. Den fanger
    // dobbeltklikk, men ikke kunden som lar fanen stå og klikker igjen etter
    // seks minutter — da fikk de to betalbare sesjoner, og betalte de begge,
    // to abonnement på samme kunde med bare én rad hos oss.
    //
    // Alt som ikke stemmer (feil plan, feil pris, utløpt, betalt) eller enhver
    // feil mot Stripe faller tilbake til å lage en ny sesjon, som før.
    const openSessionId =
      typeof existing?.metadata?.checkout_session_id === 'string' ? existing.metadata.checkout_session_id : null;
    if (openSessionId) {
      try {
        const previous = await stripe.checkout.sessions.retrieve(openSessionId);
        const reusableUrl = reusableCheckoutUrl(previous, {
          userId: user.id,
          plan,
          priceId,
          consentVersion
        });
        if (reusableUrl) {
          userLog.info('billing.checkout.reused_open_session', { plan, stripeSessionId: previous.id });
          return NextResponse.json({ url: reusableUrl });
        }
      } catch (retrieveError) {
        userLog.warn('billing.checkout.open_session_lookup_failed', {
          message: retrieveError instanceof Error ? retrieveError.message : 'unknown'
        });
      }
    }

    const idempotencyKey = `checkout_${user.id}_${plan}_${Math.floor(Date.now() / (1000 * 60 * 5))}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode,
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${baseUrl}/pricing?checkout=success`,
        cancel_url: `${baseUrl}/pricing?checkout=cancel`,
        client_reference_id: user.id,
        metadata: {
          user_id: user.id,
          tier: plan,
          price_id: priceId,
          // Stored on the Stripe object itself so the record outlives our own
          // database and travels with the payment it belongs to.
          delivery_consent_at: consentAt,
          delivery_consent_version: consentVersion
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            tier: plan,
            delivery_consent_at: consentAt,
            delivery_consent_version: consentVersion
          }
        }
      },
      {
        idempotencyKey
      }
    );

    const admin = createAdminClient();

    // Denne skrivingen skjer FØR brukeren har betalt, og må derfor aldri
    // forringe en plan som allerede er betalt for. Regelen — og historien om
    // hvorfor den finnes — ligger i planCheckoutWrite.
    //
    // Med planbytte-sperren over er hasPaidPlan alltid false her i dag.
    // Regelen beholdes likevel: den er sikkerhetsnettet som gjør at sperren kan
    // løftes trygt den dagen stripe.subscriptions.update() er på plass.
    const write = planCheckoutWrite({
      hasPaidPlan: existingCapabilities.paid,
      userId: user.id,
      plan,
      customerId,
      priceId,
      sessionId: session.id
    });

    const { error: upsertError } =
      write.kind === 'link-customer-only'
        ? await admin.from('billing_subscriptions').update(write.values).eq('user_id', write.userId)
        : await admin.from('billing_subscriptions').upsert(write.values, { onConflict: 'user_id' });

    if (upsertError) {
      // Databasens egen feiltekst (tabellnavn, kolonner, constraint-navn) er
      // for loggen. Kunden får noe de kan handle på.
      userLog.error('billing.checkout.subscription_upsert_failed', upsertError);
      return NextResponse.json({ error: billingCopy('saveFailed', locale) }, { status: 500 });
    }

    if (existingCapabilities.paid) {
      userLog.info('billing.checkout.plan_change_started', {
        fromTier: existingCapabilities.tier,
        toTier: plan
      });
    }

    userLog.info('billing.checkout.success', {
      plan,
      stripeSessionId: session.id,
      customerId
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    // `details` var her den RÅ unntaksteksten — typisk Stripes egen engelske
    // feilmelding — og prissiden viser den til kunden (den setter sammen
    // error + details med vilje, for planbytte-forklaringen). Unntaksteksten
    // hører hjemme i loggen, som allerede har den på linja over.
    log.error('billing.checkout.unexpected_failure', error);
    return NextResponse.json({ error: billingCopy('checkoutFailed', locale) }, { status: 500 });
  }
}
