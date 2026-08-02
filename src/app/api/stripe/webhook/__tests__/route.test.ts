import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  dahliaSubscriptionEvent,
  legacySubscriptionEvent,
  periodlessSubscriptionEvent,
  PERIOD_END_ISO,
  PERIOD_START_ISO,
  TEST_CUSTOMER_ID,
  TEST_PRICE_PREMIUM,
  TEST_SUBSCRIPTION_ID,
  TEST_USER_ID
} from '@/lib/billing/__tests__/stripe-webhook-fixtures';

/**
 * Kjernepåstanden: raden webhooken skriver skal ha en utløpsdato, uansett
 * hvilken API-versjon Stripe rendrer hendelsen i.
 *
 * Kontoen står på 2026-05-27.dahlia og webhook-endepunktet er ikke pinnet, så
 * det er dahlia-formen som faktisk kommer inn. Der ligger periodedatoene på
 * items.data[0]; topnivåfeltene svarer null. Ruta leste topnivå direkte og
 * skrev current_period_end = null — og hasPaidAccess() leser null som «ingen
 * utløpsdato», altså premium for alltid.
 */

interface UpsertCall {
  table: string;
  values: Record<string, unknown>;
}

let upserts: UpsertCall[] = [];
let existingBillingRow: Record<string, unknown> | null = null;
let retrievedSubscription: unknown = null;

const warnings: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];

/**
 * Minimal Supabase-etterligning. Nok til at ruta kommer gjennom
 * hendelsesloggen og fram til skrivingen vi faktisk vil se på.
 */
function makeAdminClient() {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          if (table === 'billing_webhook_events') return { data: null, error: null };
          return { data: existingBillingRow, error: null };
        },
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        upsert: async (values: Record<string, unknown>) => {
          upserts.push({ table, values });
          return { error: null };
        }
      };
      return builder;
    }
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));

vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: () => ({
    // Signaturen verifiseres ikke her — den er testet av Stripe selv. Etter
    // verifisering er det nettopp dette constructEvent gjør: parser kroppen.
    webhooks: { constructEvent: (rawBody: string) => JSON.parse(rawBody) },
    subscriptions: { retrieve: async () => retrievedSubscription }
  })
}));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    error: vi.fn(),
    warn: (msg: string, ctx?: Record<string, unknown>) => {
      warnings.push({ msg, ctx });
    },
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

const { POST } = await import('../route');

function postEvent(event: unknown) {
  return POST(
    new NextRequest('https://www.mycelet.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=testsignatur' },
      body: JSON.stringify(event)
    })
  );
}

function billingUpsert() {
  const call = upserts.find((u) => u.table === 'billing_subscriptions');
  if (!call) throw new Error('ingen skriving til billing_subscriptions');
  return call.values;
}

beforeEach(() => {
  upserts = [];
  warnings.length = 0;
  existingBillingRow = null;
  retrievedSubscription = null;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_PREMIUM_MONTHLY = TEST_PRICE_PREMIUM;
  process.env.STRIPE_PRICE_SEASON_PASS = 'price_1SeasonPassTest';
});

describe('customer.subscription.* i dagens rendring (dahlia)', () => {
  const types = ['customer.subscription.created', 'customer.subscription.updated'] as const;

  it.each(types)('%s skriver utløpsdatoen fra items[0], ikke null', async (type) => {
    const res = await postEvent(dahliaSubscriptionEvent({ type }));
    expect(res.status).toBe(200);

    const values = billingUpsert();
    expect(values.current_period_end).toBe(PERIOD_END_ISO);
    expect(values.current_period_start).toBe(PERIOD_START_ISO);
  });

  it('skriver ellers samme rad som før', async () => {
    await postEvent(dahliaSubscriptionEvent());
    expect(billingUpsert()).toMatchObject({
      user_id: TEST_USER_ID,
      tier: 'premium',
      status: 'active',
      stripe_customer_id: TEST_CUSTOMER_ID,
      stripe_subscription_id: TEST_SUBSCRIPTION_ID,
      stripe_price_id: TEST_PRICE_PREMIUM,
      cancel_at_period_end: false
    });
  });

  it('en oppsigelse beholder datoen abonnementet løper ut på', async () => {
    await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.deleted', status: 'canceled' }));
    const values = billingUpsert();
    expect(values.status).toBe('canceled');
    expect(values.current_period_end).toBe(PERIOD_END_ISO);
  });

  it('finner kunden via stripe_customer_id når metadata mangler user_id', async () => {
    existingBillingRow = { user_id: TEST_USER_ID, tier: 'premium', status: 'active', current_period_end: null, metadata: {} };
    await postEvent(dahliaSubscriptionEvent({ userId: null }));
    expect(billingUpsert().current_period_end).toBe(PERIOD_END_ISO);
  });
});

describe('samme hendelse rendret i den gamle versjonen (2024-06-20)', () => {
  it('leser fortsatt topnivåfeltene', async () => {
    await postEvent(legacySubscriptionEvent());
    expect(billingUpsert().current_period_end).toBe(PERIOD_END_ISO);
  });
});

describe('checkout.session.completed', () => {
  it('henter perioden gjennom samme leser', async () => {
    retrievedSubscription = dahliaSubscriptionEvent().data.object;
    const event = {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      created: 1781282570,
      livemode: true,
      data: {
        object: {
          id: 'cs_test_a1',
          object: 'checkout.session',
          mode: 'subscription',
          customer: TEST_CUSTOMER_ID,
          subscription: TEST_SUBSCRIPTION_ID,
          metadata: { user_id: TEST_USER_ID, tier: 'premium', price_id: TEST_PRICE_PREMIUM }
        }
      }
    };

    await postEvent(event);
    expect(billingUpsert().current_period_end).toBe(PERIOD_END_ISO);
  });
});

describe('når Stripe ikke oppgir noen periode', () => {
  it('skriver ikke null stille — den logger', async () => {
    const res = await postEvent(periodlessSubscriptionEvent());
    expect(res.status).toBe(200);
    expect(warnings.map((w) => w.msg)).toContain('stripe.webhook.period_missing');
  });

  it('lar datoen som allerede står i basen bli stående', async () => {
    // Å skrive null her ville gitt tilgang uten utløp. Vi rører heller ikke
    // kolonnen, så en tidligere dato overlever.
    await postEvent(periodlessSubscriptionEvent());
    const values = billingUpsert();
    expect(values).not.toHaveProperty('current_period_end');
    expect(values).not.toHaveProperty('current_period_start');
    // Resten av raden skrives som normalt.
    expect(values).toMatchObject({ user_id: TEST_USER_ID, status: 'active' });
  });
});

describe('vernet mot å overkjøre et aktivt Apple-abonnement står', () => {
  it('en Stripe-kansellering rører ikke en rad RevenueCat eier', async () => {
    existingBillingRow = {
      user_id: TEST_USER_ID,
      tier: 'premium',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      metadata: { provider: 'revenuecat' }
    };

    await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.deleted', status: 'canceled' }));
    expect(upserts.find((u) => u.table === 'billing_subscriptions')).toBeUndefined();
  });
});
