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
let updates: UpsertCall[] = [];
let existingBillingRow: Record<string, unknown> | null = null;
let retrievedSubscription: unknown = null;
let retrieveFeiler = false;
/** Det auth.admin.getUserById svarer — brukeren bak abonnementet. */
let adminUser: { data: { user: Record<string, unknown> | null }; error: { message: string } | null } = {
  data: { user: { id: TEST_USER_ID, email: 'kunde@example.com', user_metadata: {} } },
  error: null
};

const warnings: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
const infos: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];

const epost = vi.hoisted(() => ({
  sendEpost: vi.fn(async () => ({ ok: true, detalj: 'sendt' })),
  manglendeEpostKonfig: vi.fn((): string[] => [])
}));
vi.mock('@/lib/email/send', () => epost);

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
        update: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { eq: async () => ({ error: null }) };
        },
        upsert: async (values: Record<string, unknown>) => {
          upserts.push({ table, values });
          return { error: null };
        }
      };
      return builder;
    },
    auth: { admin: { getUserById: async () => adminUser } }
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));

vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: () => ({
    // Signaturen verifiseres ikke her — den er testet av Stripe selv. Etter
    // verifisering er det nettopp dette constructEvent gjør: parser kroppen.
    webhooks: { constructEvent: (rawBody: string) => JSON.parse(rawBody) },
    subscriptions: {
      retrieve: async () => {
        if (retrieveFeiler) throw new Error('Stripe nede');
        return retrievedSubscription;
      }
    }
  })
}));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: (msg: string, ctx?: Record<string, unknown>) => {
      infos.push({ msg, ctx });
    },
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
  updates = [];
  warnings.length = 0;
  infos.length = 0;
  existingBillingRow = null;
  retrievedSubscription = null;
  retrieveFeiler = false;
  adminUser = { data: { user: { id: TEST_USER_ID, email: 'kunde@example.com', user_metadata: {} } }, error: null };
  epost.sendEpost.mockReset();
  epost.sendEpost.mockResolvedValue({ ok: true, detalj: 'sendt' });
  epost.manglendeEpostKonfig.mockReset();
  epost.manglendeEpostKonfig.mockReturnValue([]);
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
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

/**
 * Tre dager før gratisuka blir til et trekk: én e-post, i kundens språk, med
 * beløpet fra prisobjektet og lenke til der man sier opp. Og uansett hva som
 * går galt med sendingen: 200 og «processed». Et 4xx hadde fått Stripe til å
 * prøve på nytt i tre døgn — og da er prøveperioden over.
 */
describe('customer.subscription.trial_will_end', () => {
  const OM_TRE_DAGER = () => Math.floor(Date.now() / 1000) + 3 * 86_400;

  function trialEvent(extra: Parameters<typeof dahliaSubscriptionEvent>[0] = {}) {
    return dahliaSubscriptionEvent({ type: 'customer.subscription.trial_will_end', status: 'trialing', trialEnd: OM_TRE_DAGER(), ...extra });
  }

  function sisteHendelsesStatus(): unknown {
    const rader = updates.filter((u) => u.table === 'billing_webhook_events');
    return rader[rader.length - 1]?.values.status;
  }

  function sendtEpost() {
    expect(epost.sendEpost).toHaveBeenCalledTimes(1);
    const [args] = epost.sendEpost.mock.calls[0] as unknown as [
      { til: string; emne: string; html: string; tekst: string; idempotensNokkel?: string }
    ];
    return args;
  }

  it('sender én e-post med beløp fra prisen, plannavn fra pris-id, lenke til prissiden og idempotensnøkkel per abonnement', async () => {
    const res = await postEvent(trialEvent());
    expect(res.status).toBe(200);

    const e = sendtEpost();
    expect(e.til).toBe('kunde@example.com');
    expect(e.emne).toMatch(/3 dager/);
    expect(e.tekst).toContain('Premium');
    expect(e.tekst).toContain('Da trekkes 79 kr');
    expect(e.tekst).toContain('https://www.mycelet.com/pricing');
    expect(e.tekst).not.toContain('/profile');
    expect(e.idempotensNokkel).toBe(`stripe/prove-slutt/${TEST_SUBSCRIPTION_ID}`);

    expect(sisteHendelsesStatus()).toBe('processed');
    // Raden i billing_subscriptions rører den ikke — det gjør subscription.updated.
    expect(upserts.find((u) => u.table === 'billing_subscriptions')).toBeUndefined();
  });

  it('språket kommer fra user_metadata.sprak', async () => {
    adminUser = { data: { user: { id: TEST_USER_ID, email: 'kund@example.com', user_metadata: { sprak: 'sv' } } }, error: null };
    await postEvent(trialEvent());
    const e = sendtEpost();
    expect(e.emne).toContain('provperiod');
    expect(e.tekst).toContain('säger upp');
  });

  it('uten Resend-oppsett: advarsel, ingen sending, hendelsen likevel behandlet', async () => {
    epost.manglendeEpostKonfig.mockReturnValue(['RESEND_API_KEY']);
    const res = await postEvent(trialEvent());
    expect(res.status).toBe(200);
    expect(epost.sendEpost).not.toHaveBeenCalled();
    expect(warnings.map((w) => w.msg)).toContain('stripe.prove_paaminnelse.epost_ikke_konfigurert');
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('sendEpost svarer ok:false → 200 og «processed», med advarsel', async () => {
    epost.sendEpost.mockResolvedValue({ ok: false, detalj: 'Resend 500' });
    const res = await postEvent(trialEvent());
    expect(res.status).toBe(200);
    expect(warnings.map((w) => w.msg)).toContain('stripe.prove_paaminnelse.sending_feilet');
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('sendEpost kaster → fortsatt 200 og «processed», aldri en retry-utløsende feil', async () => {
    epost.sendEpost.mockRejectedValue(new Error('nettverk'));
    const res = await postEvent(trialEvent());
    expect(res.status).toBe(200);
    expect(warnings.find((w) => w.msg === 'stripe.prove_paaminnelse.sending_feilet')?.ctx).toMatchObject({ detalj: 'nettverk' });
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('har kunden alt sagt opp, sendes ingenting — men hendelsen er behandlet', async () => {
    await postEvent(trialEvent({ cancelAtPeriodEnd: true }));
    expect(epost.sendEpost).not.toHaveBeenCalled();
    expect(infos.find((i) => i.msg === 'stripe.prove_paaminnelse.hoppet_over')?.ctx).toMatchObject({ grunn: 'allerede-sagt-opp' });
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('kampanjekode: hendelsen bærer bare rabattens id, så kupongen hentes og trekkes fra beløpet', async () => {
    retrievedSubscription = {
      ...(trialEvent().data.object as Record<string, unknown>),
      discounts: [{ id: 'di_1Abc', object: 'discount', coupon: { percent_off: 50, amount_off: null, currency: null } }]
    };
    await postEvent(trialEvent({ discounts: ['di_1Abc'] }));
    const e = sendtEpost();
    expect(e.tekst).toContain('Da trekkes 39,50 kr');
    expect(e.tekst).not.toContain('79 kr');
  });

  it('kan rabatten ikke hentes, sendes e-posten uten tall — aldri med listeprisen', async () => {
    retrieveFeiler = true;
    const res = await postEvent(trialEvent({ discounts: ['di_1Abc'] }));
    expect(res.status).toBe(200);
    const e = sendtEpost();
    expect(e.tekst).not.toContain('79 kr');
    expect(e.tekst).toMatch(/rabatt/i);
    expect(e.tekst).toContain('https://www.mycelet.com/pricing');
    expect(warnings.map((w) => w.msg)).toContain('stripe.prove_paaminnelse.rabatt_ukjent');
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('uten e-postadresse på kontoen sendes ingenting, hendelsen er behandlet', async () => {
    adminUser = { data: { user: null }, error: { message: 'User not found' } };
    const res = await postEvent(trialEvent());
    expect(res.status).toBe(200);
    expect(epost.sendEpost).not.toHaveBeenCalled();
    expect(warnings.map((w) => w.msg)).toContain('stripe.prove_paaminnelse.ingen_epostadresse');
    expect(sisteHendelsesStatus()).toBe('processed');
  });
});
