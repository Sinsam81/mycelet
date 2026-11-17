import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STRIPE_OPPSLAG_FRIST_MS,
  STRIPE_OPPSLAG_KALL,
  harHattStripeAbonnementFor,
  harHattTilgangFor,
  harHattTilgangIRaden,
  type StripeKallValg,
  type StripeKundeoppslag
} from '../tidligere-abonnent';

/**
 * Samme fasit for checkout (gir Stripe-prøven eller ikke), /api/billing/status
 * (kanFaaProve) og forsiden — så arket aldri lover en gratisuke kjøpet nekter.
 */
function stripeMed(abonnementPerKunde: Record<string, number>): StripeKundeoppslag & { kall: string[] } {
  const kall: string[] = [];
  return {
    kall,
    customers: {
      list: async ({ email }) => {
        kall.push(`customers:${email}`);
        return { data: Object.keys(abonnementPerKunde).map((id) => ({ id })) };
      }
    },
    subscriptions: {
      list: async ({ customer }) => {
        kall.push(`subscriptions:${customer}`);
        return { data: new Array(abonnementPerKunde[customer] ?? 0).fill({}) };
      }
    }
  };
}

describe('harHattTilgangIRaden', () => {
  it('rad som har pekt på Stripe-abonnement eller eies av en IAP-leverandør: ja — ellers nei', () => {
    expect(harHattTilgangIRaden({ stripe_subscription_id: 'sub_1', metadata: null })).toBe(true);
    expect(harHattTilgangIRaden({ stripe_subscription_id: null, metadata: { provider: 'revenuecat' } })).toBe(true);
    // Påbegynt, aldri betalt Checkout-sesjon (planCheckoutWrite) er ikke tidligere tilgang.
    expect(harHattTilgangIRaden({ stripe_subscription_id: null, metadata: { checkout_session_id: 'cs_1' } })).toBe(false);
    expect(harHattTilgangIRaden(null)).toBe(false);
    expect(harHattTilgangIRaden(undefined)).toBe(false);
  });
});

describe('harHattStripeAbonnementFor', () => {
  it('e-posten har en Stripe-kunde med abonnement (uansett status): ja', async () => {
    expect(await harHattStripeAbonnementFor(stripeMed({ cus_a: 0, cus_b: 1 }), 'x@example.com')).toBe(true);
  });

  it('kunder uten abonnement, eller ingen kunde: nei', async () => {
    expect(await harHattStripeAbonnementFor(stripeMed({ cus_a: 0 }), 'x@example.com')).toBe(false);
    expect(await harHattStripeAbonnementFor(stripeMed({}), 'x@example.com')).toBe(false);
  });

  it('feiler Stripe, er prøven default', async () => {
    const stripe: StripeKundeoppslag = {
      customers: { list: () => Promise.reject(new Error('nede')) },
      subscriptions: { list: () => Promise.resolve({ data: [] }) }
    };
    expect(await harHattStripeAbonnementFor(stripe, 'x@example.com')).toBe(false);
  });
});

describe('harHattTilgangFor', () => {
  it('raden svarer først — Stripe spørres ikke når den allerede sier ja', async () => {
    const stripe = vi.fn(() => stripeMed({ cus_a: 1 }));
    expect(await harHattTilgangFor({ subscription: { stripe_subscription_id: 'sub_1', metadata: null }, email: 'x@example.com', stripe })).toBe(true);
    expect(stripe).not.toHaveBeenCalled();
  });

  it('uten rad: slettet konto med samme e-post og gammelt Stripe-abonnement teller', async () => {
    const s = stripeMed({ cus_a: 1 });
    expect(await harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => s })).toBe(true);
    expect(s.kall).toEqual(['customers:x@example.com', 'subscriptions:cus_a']);
  });

  it('uten rad og uten Stripe-historikk: ny kunde, får prøven', async () => {
    expect(await harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripeMed({}) })).toBe(false);
  });

  it('uten e-post kan ingen Stripe-kunde slås opp: ny kunde', async () => {
    const stripe = vi.fn(() => stripeMed({ cus_a: 1 }));
    expect(await harHattTilgangFor({ subscription: null, email: null, stripe })).toBe(false);
    expect(stripe).not.toHaveBeenCalled();
  });

  it('kaster Stripe-klienten (nøkkel mangler), er prøven default — som i checkout', async () => {
    expect(
      await harHattTilgangFor({
        subscription: null,
        email: 'x@example.com',
        stripe: () => {
          throw new Error('STRIPE_SECRET_KEY mangler');
        }
      })
    ).toBe(false);
  });
});

/**
 * Fristen er en del av regelen, ikke av ett kallsted.
 *
 * Den sto først bare i /api/billing/status. Da svarte statusruta etter 5 s
 * («får prøven»), mens forsiden ventet så lenge Stripe-SDK-en ville (80 s per
 * forsøk, ett nytt forsøk) og checkout ventet på det ekte svaret, fant det
 * gamle abonnementet og lot Stripe trekke samme dag — flatene lovet en uke
 * kjøpet nektet. Her låses det at funksjonen alle tre kaller har fristen selv.
 */
describe('fristen for Stripe-oppslaget', () => {
  const aldri = <T,>() => new Promise<T>(() => {});

  interface Kall {
    metode: string;
    valg: StripeKallValg | undefined;
  }

  /** En Stripe der hvert kall kan svare, henge eller svare etter en stund. */
  function stripeSom(svar: {
    kunder: () => Promise<{ data: Array<{ id: string }> }>;
    abonnement?: (kunde: string) => Promise<{ data: unknown[] }>;
  }): StripeKundeoppslag & { kall: Kall[] } {
    const kall: Kall[] = [];
    return {
      kall,
      customers: {
        list: (_p, valg) => {
          kall.push({ metode: 'customers.list', valg });
          return svar.kunder();
        }
      },
      subscriptions: {
        list: ({ customer }, valg) => {
          kall.push({ metode: `subscriptions.list:${customer}`, valg });
          return (svar.abonnement ?? (async () => ({ data: [] })))(customer);
        }
      }
    };
  }

  const etter = <T,>(ms: number, verdi: T) => new Promise<T>((resolve) => setTimeout(() => resolve(verdi), ms));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tallene: 4 s per kall uten nytt forsøk, 5 s for hele oppslaget', () => {
    expect(STRIPE_OPPSLAG_KALL).toEqual({ timeout: 4000, maxNetworkRetries: 0 });
    expect(STRIPE_OPPSLAG_FRIST_MS).toBe(5000);
    // Taket må ligge over ett kall (ellers får Stripe aldri svare) og langt
    // under det seks kall etter hverandre kunne brukt.
    expect(STRIPE_OPPSLAG_FRIST_MS).toBeGreaterThan(STRIPE_OPPSLAG_KALL.timeout);
    expect(STRIPE_OPPSLAG_FRIST_MS).toBeLessThan(2 * STRIPE_OPPSLAG_KALL.timeout);
  });

  it('hvert kall til Stripe bærer fristen — uansett hvem som spør', async () => {
    const stripe = stripeSom({ kunder: async () => ({ data: [{ id: 'cus_a' }, { id: 'cus_b' }] }) });
    expect(await harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripe })).toBe(false);
    expect(stripe.kall.map((k) => k.metode)).toEqual(['customers.list', 'subscriptions.list:cus_a', 'subscriptions.list:cus_b']);
    for (const k of stripe.kall) expect(k.valg).toEqual({ timeout: 4000, maxNetworkRetries: 0 });
  });

  it('Stripe svarer aldri: svaret kommer når taket er ute, og er det samme som ved en Stripe-feil', async () => {
    vi.useFakeTimers();
    const vedFrist = vi.fn();
    const stripe = stripeSom({ kunder: aldri });

    let svar: boolean | undefined;
    const lofte = harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripe, vedFrist }).then((v) => {
      svar = v;
    });
    await vi.advanceTimersByTimeAsync(STRIPE_OPPSLAG_FRIST_MS - 1);
    expect(svar).toBeUndefined();
    expect(vedFrist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await lofte;
    expect(svar).toBe(false);
    expect(vedFrist).toHaveBeenCalledTimes(1);
    expect(vedFrist).toHaveBeenCalledWith(5000);
  });

  it('henger det ANDRE kallet, gjelder taket fortsatt hele oppslaget — ikke hvert kall for seg', async () => {
    vi.useFakeTimers();
    const vedFrist = vi.fn();
    const stripe = stripeSom({ kunder: () => etter(3_000, { data: [{ id: 'cus_a' }] }), abonnement: aldri });

    const lofte = harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripe, vedFrist });
    await vi.advanceTimersByTimeAsync(STRIPE_OPPSLAG_FRIST_MS);
    expect(await lofte).toBe(false);
    expect(vedFrist).toHaveBeenCalledWith(5000);
    expect(stripe.kall.map((k) => k.metode)).toEqual(['customers.list', 'subscriptions.list:cus_a']);
  });

  it('når taket er ute, får en treg Stripe ingen flere spørsmål', async () => {
    vi.useFakeTimers();
    // Tre kunder på e-posten. Første abonnementsoppslag svarer først etter
    // 6 s — da er svaret alt gitt, og de to neste skal ikke sendes.
    const stripe = stripeSom({
      kunder: async () => ({ data: [{ id: 'cus_a' }, { id: 'cus_b' }, { id: 'cus_c' }] }),
      abonnement: () => etter(6_000, { data: [] })
    });

    const lofte = harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripe });
    await vi.advanceTimersByTimeAsync(STRIPE_OPPSLAG_FRIST_MS);
    expect(await lofte).toBe(false);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(stripe.kall.map((k) => k.metode)).toEqual(['customers.list', 'subscriptions.list:cus_a']);
  });

  it('et svar innen taket brukes — også når det sier «har hatt» — og tidtakeren ryddes', async () => {
    vi.useFakeTimers();
    const vedFrist = vi.fn();
    const stripe = stripeSom({
      kunder: () => etter(2_000, { data: [{ id: 'cus_a' }] }),
      abonnement: () => etter(2_000, { data: [{ id: 'sub_1' }] })
    });

    const lofte = harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripe, vedFrist });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await lofte).toBe(true);
    expect(vedFrist).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Stripe kaster (nettverk, eller SDK-ens egen frist på kallet): prøven, uten melding om at taket gikk ut', async () => {
    const vedFrist = vi.fn();
    const stripe = stripeSom({
      kunder: async () => {
        throw new Error('Request aborted due to timeout being reached (4000ms)');
      }
    });
    expect(await harHattTilgangFor({ subscription: null, email: 'x@example.com', stripe: () => stripe, vedFrist })).toBe(false);
    expect(vedFrist).not.toHaveBeenCalled();
  });

  it('raden svarer selv: ingen tidtaker, ingen Stripe', async () => {
    vi.useFakeTimers();
    const stripe = vi.fn(() => stripeSom({ kunder: aldri }));
    expect(await harHattTilgangFor({ subscription: { stripe_subscription_id: 'sub_1', metadata: null }, email: 'x@example.com', stripe })).toBe(true);
    expect(await harHattTilgangFor({ subscription: null, email: null, stripe })).toBe(false);
    expect(stripe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
