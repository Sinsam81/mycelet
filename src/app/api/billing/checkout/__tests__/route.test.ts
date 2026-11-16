import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Gratisuka i checkout følger samme regel — og samme frist — som flatene.
 *
 * /api/billing/status (headeren, arket, prissiden), forsiden og checkout spør
 * alle «har denne e-posten hatt et abonnement før?» hos Stripe. Fristen sto
 * først bare i statusruta: den svarte etter 5 s («får prøven»), mens checkout
 * ventet på det ekte svaret med SDK-ens standardfrist (80 s per forsøk, ett
 * nytt forsøk). På en treg dag hos Stripe — 6–10 s per oppslag, ikke et
 * utfall — ble en tidligere kunde lovet gratisuka på tre flater og trukket
 * samme dag. Fristen ligger nå i regelen selv (tidligere-abonnent.ts), og
 * denne fila låser at de to rutene svarer det samme på samme Stripe.
 */

let brukerNr = 0;
/** Ny bruker per test: checkout slipper gjennom 5 kall i minuttet per bruker. */
function nyBruker() {
  brukerNr += 1;
  return { id: `c2a9d6f4-8b1e-4d57-9a3c-${String(brukerNr).padStart(12, '0')}`, email: 'kunde@example.com' };
}

let user: { id: string; email: string | null } | null = nyBruker();
let rad: Record<string, unknown> | null = null;

interface StripeKall {
  metode: string;
  params: Record<string, unknown>;
  valg: unknown;
}
let stripeKall: StripeKall[] = [];
let kundeSvar: () => Promise<{ data: Array<{ id: string }> }> = async () => ({ data: [] });
let abonnementSvar: () => Promise<{ data: unknown[] }> = async () => ({ data: [] });
let skrevet: unknown[] = [];

const logg = vi.hoisted(() => {
  const l = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), child: () => l };
  return l;
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } })
}));
vi.mock('@/lib/billing/subscription', async (original) => ({
  ...(await original<typeof import('@/lib/billing/subscription')>()),
  getUserBillingSubscription: async () => rad
}));
vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: () => ({
    customers: {
      create: async (params: Record<string, unknown>, valg: unknown) => {
        stripeKall.push({ metode: 'customers.create', params, valg });
        return { id: 'cus_ny' };
      },
      list: (params: Record<string, unknown>, valg: unknown) => {
        stripeKall.push({ metode: 'customers.list', params, valg });
        return kundeSvar();
      }
    },
    subscriptions: {
      list: (params: Record<string, unknown>, valg: unknown) => {
        stripeKall.push({ metode: 'subscriptions.list', params, valg });
        return abonnementSvar();
      }
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>, valg: unknown) => {
          stripeKall.push({ metode: 'checkout.sessions.create', params, valg });
          return { id: 'cs_test_1', url: 'https://checkout.example.test/cs_test_1' };
        }
      }
    }
  })
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (values: unknown) => {
        skrevet.push(values);
        return { error: null };
      }
    })
  })
}));
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logg }));
vi.mock('@/lib/log', () => ({ logger: logg }));
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => 'nb' }));

const { POST } = await import('../route');
const { GET: hentStatus } = await import('../../status/route');

function kjop() {
  return POST(
    new NextRequest('https://www.mycelet.com/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'season_pass', immediateDeliveryConsent: true, consentVersion: 'v1' })
    })
  );
}

function status() {
  return hentStatus(new NextRequest('https://www.mycelet.com/api/billing/status'));
}

/** Det checkout ba Stripe om — prøven står (eller står ikke) i subscription_data. */
function sesjon() {
  const kall = stripeKall.filter((k) => k.metode === 'checkout.sessions.create');
  expect(kall).toHaveLength(1);
  return kall[0].params.subscription_data as { trial_period_days?: number };
}

const aldri = <T,>() => new Promise<T>(() => {});
const etter = <T,>(ms: number, verdi: T) => new Promise<T>((resolve) => setTimeout(() => resolve(verdi), ms));

const FOR = { pris: process.env.STRIPE_PRICE_SEASON_PASS, url: process.env.NEXT_PUBLIC_APP_URL };

beforeEach(() => {
  user = nyBruker();
  rad = null;
  stripeKall = [];
  skrevet = [];
  kundeSvar = async () => ({ data: [] });
  abonnementSvar = async () => ({ data: [] });
  logg.warn.mockClear();
  logg.error.mockClear();
  process.env.STRIPE_PRICE_SEASON_PASS = 'price_test_sesongpass';
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
});

afterEach(() => {
  vi.useRealTimers();
  if (FOR.pris === undefined) delete process.env.STRIPE_PRICE_SEASON_PASS;
  else process.env.STRIPE_PRICE_SEASON_PASS = FOR.pris;
  if (FOR.url === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = FOR.url;
});

describe('gratisuka i checkout', () => {
  it('ny kunde: prøven settes, og oppslaget mot Stripe bærer fristen', async () => {
    const res = await kjop();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.example.test/cs_test_1' });
    expect(sesjon().trial_period_days).toBe(7);

    const oppslag = stripeKall.filter((k) => k.metode === 'customers.list');
    expect(oppslag).toHaveLength(1);
    expect(oppslag[0].params).toEqual({ email: 'kunde@example.com', limit: 5 });
    expect(oppslag[0].valg).toEqual({ timeout: 4000, maxNetworkRetries: 0 });
    expect(logg.warn).not.toHaveBeenCalledWith('billing.checkout.stripe_lookup_timeout', expect.anything());
  });

  it('e-posten har hatt et Stripe-abonnement (under en slettet konto): ingen ny gratisuke', async () => {
    kundeSvar = async () => ({ data: [{ id: 'cus_gammel' }] });
    abonnementSvar = async () => ({ data: [{ id: 'sub_gammel' }] });

    expect((await kjop()).status).toBe(200);
    expect(sesjon()).not.toHaveProperty('trial_period_days');
    for (const k of stripeKall.filter((x) => x.metode.endsWith('.list'))) {
      expect(k.valg).toEqual({ timeout: 4000, maxNetworkRetries: 0 });
    }
  });

  it('raden selv svarer (har hatt et abonnement): ingen prøve, og Stripe spørres ikke om historikken', async () => {
    rad = { user_id: user!.id, tier: 'free', status: 'canceled', current_period_end: null, stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_gammel' };
    expect((await kjop()).status).toBe(200);
    expect(sesjon()).not.toHaveProperty('trial_period_days');
    expect(stripeKall.map((k) => k.metode)).toEqual(['checkout.sessions.create']);
  });

  it('Stripe svarer aldri på oppslaget: kjøpet går videre når taket er ute, med prøven', async () => {
    vi.useFakeTimers();
    kundeSvar = aldri;

    let ferdig = false;
    const lofte = kjop().then((res) => {
      ferdig = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(ferdig).toBe(false);
    expect(stripeKall.map((k) => k.metode)).not.toContain('checkout.sessions.create');

    await vi.advanceTimersByTimeAsync(2);
    const res = await lofte;
    expect(res.status).toBe(200);
    expect(sesjon().trial_period_days).toBe(7);
    expect(logg.warn).toHaveBeenCalledWith('billing.checkout.stripe_lookup_timeout', { fristMs: 5000 });
  });

  it('Stripe kaster på oppslaget: prøven er standard, som før', async () => {
    kundeSvar = async () => {
      throw new Error('Request aborted due to timeout being reached (4000ms)');
    };
    expect((await kjop()).status).toBe(200);
    expect(sesjon().trial_period_days).toBe(7);
  });
});

describe('det flatene lover, er det kjøpet gir', () => {
  // En kunde som HAR hatt abonnement (slettet konto, samme e-post).
  const medHistorikk = () => {
    abonnementSvar = async () => ({ data: [{ id: 'sub_gammel' }] });
  };

  it('en treg dag hos Stripe (8 s per oppslag): statusruta lover gratisuka, og checkout gir den', async () => {
    vi.useFakeTimers();
    medHistorikk();
    kundeSvar = () => etter(8_000, { data: [{ id: 'cus_gammel' }] });

    const statusLofte = status();
    await vi.advanceTimersByTimeAsync(5_001);
    const lovet = (await (await statusLofte).json()) as { kanFaaProve: boolean };
    expect(lovet.kanFaaProve).toBe(true);

    const kjopLofte = kjop();
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await kjopLofte).status).toBe(200);
    // Før: checkout ventet de 8 sekundene, fant det gamle abonnementet og
    // lot Stripe trekke samme dag.
    expect(sesjon().trial_period_days).toBe(7);
  });

  it('en vanlig dag: begge finner det gamle abonnementet, og ingen av dem lover eller gir noe', async () => {
    medHistorikk();
    kundeSvar = async () => ({ data: [{ id: 'cus_gammel' }] });

    expect(((await (await status()).json()) as { kanFaaProve: boolean }).kanFaaProve).toBe(false);
    expect((await kjop()).status).toBe(200);
    expect(sesjon()).not.toHaveProperty('trial_period_days');
  });
});
