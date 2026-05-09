import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserBillingSubscription } from '@/lib/billing/subscription';
import { getStripeServerClient } from '@/lib/stripe/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('billing.portal.start');
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      log.info('billing.portal.unauthenticated');
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    const userLog = log.child({ userId: user.id });

    // Each portal session creates a Stripe API call. 10/min/user is generous
    // for honest UI flows and stops compromised-account abuse.
    const rateLimit = checkRateLimit(`billing-portal:${getClientKey(request, user.id)}`, 10, 60);
    if (!rateLimit.allowed) {
      userLog.warn('billing.portal.rate_limited');
      return rateLimitResponse(rateLimit);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    if (!subscription?.stripe_customer_id) {
      userLog.warn('billing.portal.no_customer');
      return NextResponse.json({ error: 'Fant ingen aktiv Stripe-kunde' }, { status: 400 });
    }

    const stripe = getStripeServerClient();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/pricing`
    });

    userLog.info('billing.portal.success', { sessionId: session.id });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    log.error('billing.portal.unexpected_failure', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke åpne kundeside',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}

