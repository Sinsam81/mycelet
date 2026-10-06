import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { harHattTilgangFor } from '@/lib/billing/tidligere-abonnent';
import { getStripeServerClient } from '@/lib/stripe/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { logger } from '@/lib/log';

// Called frequently from the client to render subscription state — logging
// every successful call would just be noise. We log only failures.

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    // Read endpoint, called from layouts/headers — generous limit so normal
    // page-rendering loops don't trip it. Catches runaway client polling.
    const rateLimit = checkRateLimit(`billing-status:${getClientKey(request, user.id)}`, 120, 60);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const capabilities = getBillingCapabilities(subscription);

    // Får kunden gratisuka? Én fasit, den samme som checkout bruker når den
    // avgjør trial_period_days (tidligere-abonnent.ts): arket, forsidekortet
    // og headeren leste før «finnes det en rad?» og lovet uka til en som hadde
    // slettet kontoen etter en betalt sesong. Betalende spør vi ikke om —
    // de kan ikke løse inn noe, og Stripe slipper et oppslag per sidevisning.
    const kanFaaProve =
      !capabilities.paid && !(await harHattTilgangFor({ subscription, email: user.email, stripe: getStripeServerClient }));

    return NextResponse.json({
      subscription,
      capabilities,
      kanFaaProve,
      plans: BILLING_PLANS
    });
  } catch (error) {
    logger.error('billing.status.failed', error, { route: '/api/billing/status' });
    return NextResponse.json(
      {
        error: 'Kunne ikke hente betalingsstatus',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}

