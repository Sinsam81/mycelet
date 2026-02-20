import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserBillingSubscription } from '@/lib/billing/subscription';
import { getStripeServerClient } from '@/lib/stripe/server';

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

    const subscription = await getUserBillingSubscription(supabase, user.id);
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: 'Fant ingen aktiv Stripe-kunde' }, { status: 400 });
    }

    const stripe = getStripeServerClient();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/pricing`
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Kunne ikke åpne kundeside',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}

