import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { logger } from '@/lib/log';

// Called frequently from the client to render subscription state — logging
// every successful call would just be noise. We log only failures.

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const capabilities = getBillingCapabilities(subscription);

    return NextResponse.json({
      subscription,
      capabilities,
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

