import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
/** Hvert kall til Stripes API, med argumentene slik ruta sendte dem. */
let stripeKall: Array<{ metode: string; args: unknown[] }> = [];
/** Feilen skrivingen til billing_subscriptions svarer med, når en test trenger det. */
let upsertFeil: { message: string } | null = null;
/** Det stripe.subscriptions.cancel kaster, når en test trenger det. */
let cancelFeil: unknown = null;
type AdminUserSvar = {
  data: { user: Record<string, unknown> | null };
  error: { message: string; status?: number; code?: string; name?: string } | null;
};
/** Det auth.admin.getUserById svarer — brukeren bak abonnementet. */
let adminUser: AdminUserSvar = {
  data: { user: { id: TEST_USER_ID, email: 'kunde@example.com', user_metadata: {} } },
  error: null
};
/** Selve oppslaget — byttes ut når en test vil at det skal henge. */
let hentBruker: () => Promise<AdminUserSvar> = async () => adminUser;

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
          if (table === 'billing_subscriptions' && upsertFeil) return { error: upsertFeil };
          upserts.push({ table, values });
          return { error: null };
        }
      };
      return builder;
    },
    auth: { admin: { getUserById: () => hentBruker() } }
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }));

vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: () => ({
    // Signaturen verifiseres ikke her — den er testet av Stripe selv. Etter
    // verifisering er det nettopp dette constructEvent gjør: parser kroppen.
    webhooks: { constructEvent: (rawBody: string) => JSON.parse(rawBody) },
    subscriptions: {
      retrieve: async (...args: unknown[]) => {
        stripeKall.push({ metode: 'retrieve', args });
        if (retrieveFeiler) throw new Error('Stripe nede');
        return retrievedSubscription;
      },
      cancel: async (...args: unknown[]) => {
        stripeKall.push({ metode: 'cancel', args });
        if (cancelFeil) throw cancelFeil;
        return { id: args[0], status: 'canceled' };
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

const { POST, maxDuration } = await import('../route');

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
  stripeKall = [];
  upsertFeil = null;
  cancelFeil = null;
  adminUser = { data: { user: { id: TEST_USER_ID, email: 'kunde@example.com', user_metadata: {} } }, error: null };
  hentBruker = async () => adminUser;
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
    // Datoen er dynamisk her («om tre dager»), så beløpssetningen matches som mønster.
    expect(e.tekst).toMatch(/\d{1,2}\. \p{L}+ trekkes 79 kr, om du ikke sier opp før det/u);
    expect(e.tekst).toContain('https://www.mycelet.com/pricing');
    expect(e.tekst).not.toContain('/profile');
    // Hva som blir borte står først, veien ut før tallet.
    expect(e.tekst).toContain('Offline-kartet');
    expect(e.tekst.indexOf('https://www.mycelet.com/pricing')).toBeLessThan(e.tekst.indexOf('79 kr'));
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
    expect(e.tekst).toMatch(/trekkes 39,50 kr, om du ikke sier opp før det/);
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

/** Fristen ruta gir hvert kall til Stripes API. */
const STRIPE_KALL = { timeout: 10_000, maxNetworkRetries: 1 };
/** Et kall som aldri svarer. */
function aldri<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

/**
 * Brukeren er slettet, men Stripe fakturerer videre. Da sier ruta opp
 * abonnementet — og nettopp derfor må «slettet» være et svar, ikke en feil.
 *
 * Oppslaget sto som `if (error) return false`. auth-js legger også
 * nettverksbrudd, 429 og 5xx i `error`, så et kort utfall hos Supabase Auth
 * midt i en fornyelse ville blitt lest som «brukeren finnes ikke», og
 * abonnementet til en betalende kunde sagt opp hos Stripe.
 */
describe('spøkelsesabonnement: bare et uttrykkelig «finnes ikke» sier opp', () => {
  const ikkeFunnet: AdminUserSvar = { data: { user: null }, error: { message: 'User not found', status: 404, code: 'user_not_found' } };
  const kansellert = () => stripeKall.filter((k) => k.metode === 'cancel');

  it('slettet bruker (404) med løpende abonnement: sies opp hos Stripe, og ingen rad skrives', async () => {
    adminUser = ikkeFunnet;
    const res = await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.updated' }));
    expect(res.status).toBe(200);
    expect(kansellert()).toHaveLength(1);
    expect(kansellert()[0].args).toEqual([TEST_SUBSCRIPTION_ID, STRIPE_KALL]);
    expect(upserts.find((u) => u.table === 'billing_subscriptions')).toBeUndefined();
    expect(warnings.find((w) => w.msg === 'stripe.webhook.subscription_for_deleted_user')?.ctx).toMatchObject({ avsluttes: true });
  });

  it('slettet bruker, og abonnementet er alt slettet hos Stripe: ingenting å si opp', async () => {
    adminUser = ikkeFunnet;
    const res = await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.deleted', status: 'canceled' }));
    expect(res.status).toBe(200);
    expect(kansellert()).toHaveLength(0);
  });

  it('oppsigelsen gikk gjennom i et tidligere forsøk (Stripe: «finnes ikke»): målet er nådd, hendelsen behandlet', async () => {
    adminUser = ikkeFunnet;
    cancelFeil = Object.assign(new Error('No such subscription'), { code: 'resource_missing', statusCode: 404 });
    const res = await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.updated' }));
    expect(res.status).toBe(200);
    expect(kansellert()).toHaveLength(1);
    expect(infos.map((i) => i.msg)).toContain('stripe.webhook.subscription_already_gone');
  });

  it('oppsigelsen feiler av en annen grunn (fristen ute): ikke-2xx, så Stripe leverer hendelsen på nytt', async () => {
    adminUser = ikkeFunnet;
    cancelFeil = new Error('Request aborted due to timeout being reached (10000ms)');
    const res = await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.updated' }));
    expect(res.status).toBe(400);
    expect(infos.map((i) => i.msg)).not.toContain('stripe.webhook.subscription_already_gone');
  });

  it.each([
    ['502/503/504 fra porten', { message: 'Bad Gateway', status: 503, name: 'AuthRetryableFetchError' }],
    ['nettverksbrudd (status 0)', { message: 'fetch failed', status: 0, name: 'AuthRetryableFetchError' }],
    ['500 fra Supabase Auth', { message: 'Internal Server Error', status: 500, code: 'unexpected_failure' }],
    ['429', { message: 'Too many requests', status: 429, code: 'over_request_rate_limit' }],
    ['401 — nøkkelen ble avvist', { message: 'invalid JWT', status: 401, code: 'bad_jwt' }],
    ['403 — ikke admin', { message: 'User not allowed', status: 403, code: 'not_admin' }],
    ['en feil uten status', { message: 'ukjent' }]
  ])('%s er «vet ikke»: abonnementet røres ikke, og hendelsen går den vanlige veien', async (_navn, error) => {
    adminUser = { data: { user: null }, error };
    const res = await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.updated' }));
    expect(res.status).toBe(200);
    expect(kansellert()).toHaveLength(0);
    // Den vanlige veien: raden skrives som for enhver annen fornyelse.
    expect(billingUpsert()).toMatchObject({ user_id: TEST_USER_ID, status: 'active', current_period_end: PERIOD_END_ISO });
    expect(warnings.map((w) => w.msg)).toContain('stripe.webhook.user_lookup_uncertain');
    expect(warnings.map((w) => w.msg)).not.toContain('stripe.webhook.subscription_for_deleted_user');
  });

  it('er brukeren egentlig slettet og oppslaget feiler, sier skrivingen fra høyt — Stripe prøver igjen', async () => {
    adminUser = { data: { user: null }, error: { message: 'Bad Gateway', status: 502, name: 'AuthRetryableFetchError' } };
    upsertFeil = { message: 'insert or update on table "billing_subscriptions" violates foreign key constraint' };
    const res = await postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.updated' }));
    expect(res.status).toBe(400);
    expect(kansellert()).toHaveLength(0);
  });
});

/**
 * Ingen av kallene ut hadde en frist: Stripes SDK venter 80 s per forsøk (med
 * ett nytt forsøk), og Supabase Auth og Resend ventet til plattformen drepte
 * funksjonen — lenge etter at Stripe har gitt opp og lagt hendelsen i kø på
 * nytt. Signaturverifiseringen og hendelsesloggen er urørt.
 *
 * Resend har siden fått sin egen frist inne i sendEpost (RESEND_FRIST_MS, romslig
 * med vilje). Ruta la en strammere frist på 8 s over den, og da ble en påminnelse
 * som kom fram etter 9 s logget som mislykket. Nå venter ruta på sendEpost sitt
 * eget svar.
 */
describe('frister på kallene ut', () => {
  const OM_TRE_DAGER = () => Math.floor(Date.now() / 1000) + 3 * 86_400;
  const trialEvent = (extra: Parameters<typeof dahliaSubscriptionEvent>[0] = {}) =>
    dahliaSubscriptionEvent({ type: 'customer.subscription.trial_will_end', status: 'trialing', trialEnd: OM_TRE_DAGER(), ...extra });
  const sisteHendelsesStatus = () => {
    const rader = updates.filter((u) => u.table === 'billing_webhook_events');
    return rader[rader.length - 1]?.values.status;
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hele kjøringen har et tak', () => {
    expect(maxDuration).toBe(60);
  });

  it('checkout.session.completed: abonnementet hentes med frist', async () => {
    retrievedSubscription = dahliaSubscriptionEvent().data.object;
    await postEvent({
      id: 'evt_checkout_frist',
      type: 'checkout.session.completed',
      created: 1781282570,
      livemode: true,
      data: {
        object: {
          id: 'cs_test_frist',
          object: 'checkout.session',
          mode: 'subscription',
          customer: TEST_CUSTOMER_ID,
          subscription: TEST_SUBSCRIPTION_ID,
          metadata: { user_id: TEST_USER_ID, tier: 'premium', price_id: TEST_PRICE_PREMIUM }
        }
      }
    });
    expect(stripeKall).toEqual([{ metode: 'retrieve', args: [TEST_SUBSCRIPTION_ID, STRIPE_KALL] }]);
  });

  it('prøvepåminnelsen: rabatten hentes med frist, og parametrene står urørt', async () => {
    retrievedSubscription = {
      ...(trialEvent().data.object as Record<string, unknown>),
      discounts: [{ id: 'di_1Abc', object: 'discount', coupon: { percent_off: 50, amount_off: null, currency: null } }]
    };
    await postEvent(trialEvent({ discounts: ['di_1Abc'] }));
    expect(stripeKall).toEqual([{ metode: 'retrieve', args: [TEST_SUBSCRIPTION_ID, { expand: ['discounts'] }, STRIPE_KALL] }]);
  });

  it('Supabase Auth svarer aldri på «finnes brukeren?»: etter fristen går hendelsen den vanlige veien, og ingenting sies opp', async () => {
    vi.useFakeTimers();
    hentBruker = aldri;

    let ferdig = false;
    const lofte = postEvent(dahliaSubscriptionEvent({ type: 'customer.subscription.updated' })).then((res) => {
      ferdig = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(ferdig).toBe(false);
    await vi.advanceTimersByTimeAsync(2);

    const res = await lofte;
    expect(res.status).toBe(200);
    expect(stripeKall.filter((k) => k.metode === 'cancel')).toHaveLength(0);
    expect(billingUpsert()).toMatchObject({ user_id: TEST_USER_ID, status: 'active' });
    expect(warnings.find((w) => w.msg === 'stripe.webhook.user_lookup_uncertain')?.ctx).toMatchObject({
      detalj: 'auth.getUserById: ingen svar på 8000 ms'
    });
  });

  it('prøvepåminnelsen: Supabase Auth svarer aldri → ingen e-post, advarsel, hendelsen behandlet', async () => {
    vi.useFakeTimers();
    hentBruker = aldri;

    const lofte = postEvent(trialEvent());
    await vi.advanceTimersByTimeAsync(8_001);
    const res = await lofte;

    expect(res.status).toBe(200);
    expect(epost.sendEpost).not.toHaveBeenCalled();
    expect(warnings.find((w) => w.msg === 'stripe.prove_paaminnelse.ingen_epostadresse')?.ctx).toMatchObject({
      message: 'auth.getUserById: ingen svar på 8000 ms'
    });
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('prøvepåminnelsen: ruta legger ingen strammere frist over sendEpost — et tregt, vellykket svar er sendt', async () => {
    vi.useFakeTimers();
    // Kommer fram etter 12 s: over de 8 s ruta før ga Resend, under fristen
    // sendEpost selv har.
    epost.sendEpost.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, detalj: 'sendt' }), 12_000))
    );

    let ferdig = false;
    const lofte = postEvent(trialEvent()).then((res) => {
      ferdig = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(11_999);
    expect(ferdig).toBe(false);
    await vi.advanceTimersByTimeAsync(2);

    const res = await lofte;
    expect(res.status).toBe(200);
    expect(epost.sendEpost).toHaveBeenCalledTimes(1);
    expect(infos.map((i) => i.msg)).toContain('stripe.prove_paaminnelse.sendt');
    expect(warnings.map((w) => w.msg)).not.toContain('stripe.prove_paaminnelse.sending_feilet');
    expect(sisteHendelsesStatus()).toBe('processed');
  });

  it('prøvepåminnelsen: fristene på veien får plass under taket for hele kjøringen', async () => {
    // Verste fall for trial_will_end: rabatten hentes (Stripe, ett nytt forsøk),
    // brukeren slås opp (OPPSLAG_FRIST_MS i ruta) og e-posten sendes
    // (sendEpost sin egen frist). Blir summen større enn taket, drepes
    // funksjonen før sendEpost rekker å svare, og hendelsen står som «received».
    // Ti sekunder er margin til databasekallene, som ikke har egen frist.
    const { RESEND_FRIST_MS } = await vi.importActual<typeof import('@/lib/email/send')>('@/lib/email/send');
    const stripeVerstefall = STRIPE_KALL.timeout * (1 + STRIPE_KALL.maxNetworkRetries);
    const oppslagsfrist = 8_000;
    expect(maxDuration * 1000).toBeGreaterThanOrEqual(stripeVerstefall + oppslagsfrist + RESEND_FRIST_MS + 10_000);
  });
});

/**
 * Feilsvaret. Før signaturen er verifisert kan hvem som helst ha sendt
 * forespørselen; da skal verken unntakstekst eller konfigurasjonsfeil ut.
 * Etter verifiseringen er avsenderen Stripe, og teksten er til feilsøking der.
 */
describe('feilsvaret røper ikke unntaksteksten før signaturen er verifisert', () => {
  it('ugyldig signatur eller kropp: 400 uten details', async () => {
    const res = await POST(
      new NextRequest('https://www.mycelet.com/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=feil' },
        body: 'ikke en stripe-hendelse'
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Webhook-feil' });
  });

  it('mangler signaturhodet: 400 som før', async () => {
    const res = await POST(new NextRequest('https://www.mycelet.com/api/stripe/webhook', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Mangler stripe-signature' });
  });

  it('etter verifisering: feilteksten følger med til Stripe, og hendelsen merkes «failed»', async () => {
    upsertFeil = { message: 'skrivingen feilet' };
    const res = await postEvent(dahliaSubscriptionEvent());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Webhook-feil', details: 'skrivingen feilet' });
    expect(upserts.find((u) => u.table === 'billing_webhook_events')?.values).toMatchObject({
      status: 'failed',
      error_message: 'skrivingen feilet'
    });
  });
});
