import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { getStripeServerClient } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

type CheckoutPlan = 'premium' | 'season_pass';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('billing.checkout.start');
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      log.info('billing.checkout.unauthenticated');
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
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

    const body = (await request.json()) as { plan?: CheckoutPlan };
    const plan = body.plan;
    if (!plan || !(plan in BILLING_PLANS)) {
      return NextResponse.json({ error: 'Ugyldig plan' }, { status: 400 });
    }

    const selectedPlan = BILLING_PLANS[plan];
    const priceId = process.env[selectedPlan.priceEnvKey];
    if (!priceId) {
      return NextResponse.json({ error: `Mangler env: ${selectedPlan.priceEnvKey}` }, { status: 500 });
    }

    const stripe = getStripeServerClient();
    const existing = await getUserBillingSubscription(supabase, user.id);
    const existingCapabilities = getBillingCapabilities(existing);

    if (existingCapabilities.paid && existingCapabilities.tier === plan) {
      return NextResponse.json(
        { error: `Du har allerede aktiv ${selectedPlan.label}-plan.` },
        { status: 409 }
      );
    }

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const mode = plan === 'premium' ? 'subscription' : 'payment';
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
          price_id: priceId
        },
        ...(mode === 'subscription'
          ? {
              subscription_data: {
                metadata: {
                  user_id: user.id,
                  tier: plan
                }
              }
            }
          : {})
      },
      {
        idempotencyKey
      }
    );

    const admin = createAdminClient();
    const { error: upsertError } = await admin.from('billing_subscriptions').upsert(
      {
        user_id: user.id,
        tier: plan,
        status: 'incomplete',
        stripe_customer_id: customerId,
        stripe_price_id: priceId,
        metadata: {
          checkout_session_id: session.id
        }
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) {
      userLog.error('billing.checkout.subscription_upsert_failed', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    userLog.info('billing.checkout.success', {
      plan,
      stripeSessionId: session.id,
      customerId
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error('billing.checkout.unexpected_failure', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke opprette checkout',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}
