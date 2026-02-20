import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { getStripeServerClient } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/admin';

type CheckoutPlan = 'premium' | 'season_pass';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
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
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Kunne ikke opprette checkout',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}
