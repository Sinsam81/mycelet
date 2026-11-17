import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/billing/status leses av headeren, forsidekortet, prøvearket og
 * prissiden — for hver bruker, på hver sidevisning. For gratisbrukere gjør den
 * et oppslag hos Stripe («har denne e-posten hatt et abonnement før?»), og det
 * oppslaget hadde SDK-ens standardfrist: 80 s per kall, med ett nytt forsøk.
 *
 * Tre ting er låst her:
 *  - hvert Stripe-kall har en kort frist, og hele oppslaget ett samlet tak;
 *  - går taket ut, er svaret det samme som når Stripe feiler (prøven som
 *    standard — regelen i tidligere-abonnent.ts), aldri en hengende side;
 *  - unntaksteksten når aldri nettleseren, og feilen kunden ser er på
 *    kundens språk.
 */

const BRUKER = { id: 'c2a9d6f4-8b1e-4d57-9a3c-5e7f1b2d4c68', email: 'kunde@example.com' };

let user: { id: string; email: string | null } | null = BRUKER;
let rad: Record<string, unknown> | null = null;
let radFeiler: Error | null = null;
let locale: 'nb' | 'sv' = 'nb';

interface StripeKall {
  metode: string;
  params: unknown;
  valg: unknown;
}
let stripeKall: StripeKall[] = [];
/** Det Stripe svarer på customers.list / subscriptions.list — eller et løfte som aldri løses. */
let kundeSvar: () => Promise<{ data: Array<{ id: string }> }> = async () => ({ data: [] });
let abonnementSvar: () => Promise<{ data: unknown[] }> = async () => ({ data: [] });
let stripeKlientFeiler = false;

const logg = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } })
}));
vi.mock('@/lib/billing/subscription', async (original) => ({
  ...(await original<typeof import('@/lib/billing/subscription')>()),
  getUserBillingSubscription: async () => {
    if (radFeiler) throw radFeiler;
    return rad;
  }
}));
vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: () => {
    if (stripeKlientFeiler) throw new Error('STRIPE_SECRET_KEY mangler');
    return {
      customers: {
        list: (params: unknown, valg: unknown) => {
          stripeKall.push({ metode: 'customers.list', params, valg });
          return kundeSvar();
        }
      },
      subscriptions: {
        list: (params: unknown, valg: unknown) => {
          stripeKall.push({ metode: 'subscriptions.list', params, valg });
          return abonnementSvar();
        }
      }
    };
  }
}));
vi.mock('@/lib/log', () => ({ logger: logg }));
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => locale }));

const { GET, maxDuration } = await import('../route');

// Rate-limiten er 120/min per bruker; fila gjør langt færre kall enn det.
function hent() {
  return GET(new NextRequest('https://www.mycelet.com/api/billing/status'));
}

const aldri = <T,>() => new Promise<T>(() => {});

beforeEach(() => {
  user = BRUKER;
  rad = null;
  radFeiler = null;
  locale = 'nb';
  stripeKall = [];
  kundeSvar = async () => ({ data: [] });
  abonnementSvar = async () => ({ data: [] });
  stripeKlientFeiler = false;
  logg.warn.mockClear();
  logg.error.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('kanFaaProve — Stripe-oppslaget har en frist', () => {
  it('gratisbruker uten historikk: får prøven, og hvert Stripe-kall bærer fristen', async () => {
    kundeSvar = async () => ({ data: [{ id: 'cus_1' }] });
    const res = await hent();
    expect(res.status).toBe(200);
    expect((await res.json()).kanFaaProve).toBe(true);

    expect(stripeKall.map((k) => k.metode)).toEqual(['customers.list', 'subscriptions.list']);
    for (const k of stripeKall) {
      expect(k.valg).toEqual({ timeout: 4000, maxNetworkRetries: 0 });
    }
    expect(stripeKall[0].params).toEqual({ email: BRUKER.email, limit: 5 });
    expect(stripeKall[1].params).toEqual({ customer: 'cus_1', status: 'all', limit: 1 });
  });

  it('e-posten har hatt et Stripe-abonnement (under en slettet konto): ingen ny gratisuke', async () => {
    kundeSvar = async () => ({ data: [{ id: 'cus_1' }] });
    abonnementSvar = async () => ({ data: [{ id: 'sub_1' }] });
    expect((await (await hent()).json()).kanFaaProve).toBe(false);
  });

  it('Stripe svarer aldri: ruta svarer likevel etter det samlede taket, med samme svar som ved en Stripe-feil', async () => {
    vi.useFakeTimers();
    kundeSvar = aldri;

    let ferdig = false;
    const lofte = hent().then((res) => {
      ferdig = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(ferdig).toBe(false);
    await vi.advanceTimersByTimeAsync(2);

    const res = await lofte;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kanFaaProve).toBe(true);
    expect(body.capabilities).toMatchObject({ tier: 'free', paid: false });
    expect(logg.warn).toHaveBeenCalledWith('billing.status.stripe_lookup_timeout', expect.objectContaining({ userId: BRUKER.id, fristMs: 5000 }));
  });

  it('henger det ANDRE kallet, gjelder det samme taket for hele oppslaget', async () => {
    vi.useFakeTimers();
    kundeSvar = async () => ({ data: [{ id: 'cus_1' }] });
    abonnementSvar = aldri;

    const lofte = hent();
    await vi.advanceTimersByTimeAsync(5_001);
    const body = await (await lofte).json();
    expect(body.kanFaaProve).toBe(true);
    expect(stripeKall.map((k) => k.metode)).toEqual(['customers.list', 'subscriptions.list']);
  });

  it('Stripe kaster (nettverk, eller SDK-ens egen frist): prøven er standard, uten advarsel om tidsavbrudd', async () => {
    kundeSvar = async () => {
      throw new Error('Request aborted due to timeout being reached (4000ms)');
    };
    const res = await hent();
    expect(res.status).toBe(200);
    expect((await res.json()).kanFaaProve).toBe(true);
    expect(logg.warn).not.toHaveBeenCalled();
  });

  it('uten Stripe-nøkkel: prøven er standard, som i checkout', async () => {
    stripeKlientFeiler = true;
    expect((await (await hent()).json()).kanFaaProve).toBe(true);
  });

  it('raden selv svarer (har hatt et abonnement): Stripe spørres ikke', async () => {
    rad = { user_id: BRUKER.id, tier: 'free', status: 'canceled', current_period_end: null, stripe_subscription_id: 'sub_gammel' };
    expect((await (await hent()).json()).kanFaaProve).toBe(false);
    expect(stripeKall).toEqual([]);
  });

  it('betalende spørres det ikke om — de kan ikke løse inn noe', async () => {
    rad = { user_id: BRUKER.id, tier: 'premium', status: 'active', current_period_end: null, metadata: { provider: 'revenuecat' } };
    const body = await (await hent()).json();
    expect(body.capabilities.paid).toBe(true);
    expect(body.kanFaaProve).toBe(false);
    expect(stripeKall).toEqual([]);
  });

  it('hele ruta har et tak', () => {
    expect(maxDuration).toBe(15);
  });
});

describe('feilsvar', () => {
  it('500 uten unntakstekst, på norsk', async () => {
    radFeiler = new Error('relation "billing_subscriptions" does not exist');
    const res = await hent();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Kunne ikke hente abonnementsstatus' });
    expect(JSON.stringify(body)).not.toContain('billing_subscriptions');
    // Unntaket står i loggen, der det hører hjemme.
    expect(logg.error).toHaveBeenCalledWith('billing.status.failed', radFeiler, { route: '/api/billing/status' });
  });

  it('500 på svensk for en svensk bruker', async () => {
    locale = 'sv';
    radFeiler = new Error('boom');
    const body = await (await hent()).json();
    expect(body).toEqual({ error: 'Kunde inte hämta prenumerationsstatus' });
  });

  it('utlogget: 401 med samme tekst og språk som checkout og portalen', async () => {
    user = null;
    locale = 'sv';
    const res = await hent();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Logga in för att fortsätta' });
    expect(stripeKall).toEqual([]);
  });
});

describe('teksten følger katalogen', () => {
  it('samme ordlyd som Pricing.errorLoadStatus i begge språk', async () => {
    const nb = (await import('../../../../../../messages/nb.json')).default as { Pricing: { errorLoadStatus: string } };
    const sv = (await import('../../../../../../messages/sv.json')).default as { Pricing: { errorLoadStatus: string } };

    radFeiler = new Error('boom');
    expect((await (await hent()).json()).error).toBe(nb.Pricing.errorLoadStatus);
    locale = 'sv';
    expect((await (await hent()).json()).error).toBe(sv.Pricing.errorLoadStatus);
  });
});
