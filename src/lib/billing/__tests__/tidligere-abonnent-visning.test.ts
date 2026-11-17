import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harHattTilgangFor } from '../tidligere-abonnent';
import {
  VISNINGSFRIST_MS,
  kanLoveProve,
  provesvarForVisning,
  type StripeForesporselsvalg,
  type StripeKundeoppslagMedValg
} from '../tidligere-abonnent-visning';

/**
 * Forsiden ventet på et Stripe-oppslag uten frist for hver gratisbruker. Disse
 * testene låser de tre tingene som må holde samtidig: flaten venter aldri
 * lenger enn fristen, «vet ikke» blir aldri til et løfte om gratisuke, og
 * svaret er ellers nøyaktig det checkout ville gitt.
 */

type Kall = { hva: string; valg: StripeForesporselsvalg | undefined };

/** Falsk Stripe: antall abonnement per kunde-id, og valgfri ventetid per kall. */
function stripeMed(
  abonnementPerKunde: Record<string, number>,
  ventMs: { kunder?: number; abonnement?: number } = {}
): StripeKundeoppslagMedValg & { kall: Kall[] } {
  const kall: Kall[] = [];
  const vent = (ms: number | undefined) => (ms ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
  return {
    kall,
    customers: {
      list: async ({ email }, valg) => {
        kall.push({ hva: `customers:${email}`, valg });
        await vent(ventMs.kunder);
        return { data: Object.keys(abonnementPerKunde).map((id) => ({ id })) };
      }
    },
    subscriptions: {
      list: async ({ customer }, valg) => {
        kall.push({ hva: `subscriptions:${customer}`, valg });
        await vent(ventMs.abonnement);
        return { data: new Array(abonnementPerKunde[customer] ?? 0).fill({}) };
      }
    }
  };
}

const UTEN_RAD = { subscription: null, email: 'x@example.com' } as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('provesvarForVisning — raden svarer først', () => {
  it('rad som har pekt på Stripe eller eies av en IAP-leverandør: tidligere, uten å spørre Stripe', async () => {
    const stripe = vi.fn(() => stripeMed({}));
    expect(
      await provesvarForVisning({ subscription: { stripe_subscription_id: 'sub_1', metadata: null }, email: 'x@example.com', stripe })
    ).toBe('tidligere');
    expect(
      await provesvarForVisning({
        subscription: { stripe_subscription_id: null, metadata: { provider: 'revenuecat' } },
        email: 'x@example.com',
        stripe
      })
    ).toBe('tidligere');
    expect(stripe).not.toHaveBeenCalled();
  });

  it('uten e-post kan ingen Stripe-kunde slås opp: ny', async () => {
    const stripe = vi.fn(() => stripeMed({ cus_a: 1 }));
    expect(await provesvarForVisning({ subscription: null, email: null, stripe })).toBe('ny');
    expect(stripe).not.toHaveBeenCalled();
  });

  it('kaster Stripe-klienten (nøkkel mangler): ny — som i checkout, der det da heller ikke finnes noe kjøp', async () => {
    expect(
      await provesvarForVisning({
        ...UTEN_RAD,
        stripe: () => {
          throw new Error('STRIPE_SECRET_KEY mangler');
        }
      })
    ).toBe('ny');
  });
});

describe('provesvarForVisning — Stripe svarer', () => {
  it('slettet konto med samme e-post og gammelt abonnement: tidligere', async () => {
    const s = stripeMed({ cus_a: 0, cus_b: 1 });
    expect(await provesvarForVisning({ ...UTEN_RAD, stripe: () => s })).toBe('tidligere');
    expect(s.kall.map((k) => k.hva)).toEqual(['customers:x@example.com', 'subscriptions:cus_a', 'subscriptions:cus_b']);
  });

  it('ingen kunde, eller kunder uten abonnement: ny', async () => {
    expect(await provesvarForVisning({ ...UTEN_RAD, stripe: () => stripeMed({}) })).toBe('ny');
    expect(await provesvarForVisning({ ...UTEN_RAD, stripe: () => stripeMed({ cus_a: 0 }) })).toBe('ny');
  });

  it('hvert kall får det som er IGJEN av fristen, og ingen nye forsøk', async () => {
    const s = stripeMed({ cus_a: 0 }, { kunder: 1_000 });
    const svar = provesvarForVisning({ ...UTEN_RAD, stripe: () => s });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await svar).toBe('ny');
    expect(s.kall).toEqual([
      { hva: 'customers:x@example.com', valg: { timeout: VISNINGSFRIST_MS, maxNetworkRetries: 0 } },
      { hva: 'subscriptions:cus_a', valg: { timeout: VISNINGSFRIST_MS - 1_000, maxNetworkRetries: 0 } }
    ]);
  });

  it('sender alltid et heltall over null som timeout — stripe-node overser alt annet og venter 80 s', async () => {
    const s = stripeMed({ cus_a: 0 }, { kunder: 100 });
    const svar = provesvarForVisning({ ...UTEN_RAD, stripe: () => s, fristMs: 100.5 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await svar).toBe('ny');
    for (const k of s.kall) {
      expect(Number.isInteger(k.valg?.timeout), k.hva).toBe(true);
      expect(k.valg?.timeout, k.hva).toBeGreaterThan(0);
    }
    expect(s.kall).toHaveLength(2);
  });

  it('rydder tidtakeren når svaret kom i tide', async () => {
    expect(await provesvarForVisning({ ...UTEN_RAD, stripe: () => stripeMed({}) })).toBe('ny');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('provesvarForVisning — Stripe svarer ikke', () => {
  it('et kall som aldri svarer: ukjent når fristen går ut, ikke før og ikke lenger', async () => {
    const stripe: StripeKundeoppslagMedValg = {
      customers: { list: () => new Promise(() => {}) },
      subscriptions: { list: () => Promise.resolve({ data: [] }) }
    };
    let svar: string | null = null;
    void provesvarForVisning({ ...UTEN_RAD, stripe: () => stripe }).then((s) => {
      svar = s;
    });
    await vi.advanceTimersByTimeAsync(VISNINGSFRIST_MS - 1);
    expect(svar).toBe(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(svar).toBe('ukjent');
  });

  it('egen frist kan settes', async () => {
    const stripe: StripeKundeoppslagMedValg = {
      customers: { list: () => new Promise(() => {}) },
      subscriptions: { list: () => Promise.resolve({ data: [] }) }
    };
    const svar = provesvarForVisning({ ...UTEN_RAD, stripe: () => stripe, fristMs: 400 });
    await vi.advanceTimersByTimeAsync(400);
    expect(await svar).toBe('ukjent');
  });

  it('feiler kundeoppslaget: ukjent — aldri «ny», som ville lovet en uke kjøpet kan nekte', async () => {
    const stripe: StripeKundeoppslagMedValg = {
      customers: { list: () => Promise.reject(new Error('nede')) },
      subscriptions: { list: () => Promise.resolve({ data: [] }) }
    };
    expect(await provesvarForVisning({ ...UTEN_RAD, stripe: () => stripe })).toBe('ukjent');
  });

  it('feiler abonnementsoppslaget for en kunde uten at noe ble funnet: ukjent', async () => {
    const stripe: StripeKundeoppslagMedValg = {
      customers: { list: () => Promise.resolve({ data: [{ id: 'cus_a' }] }) },
      subscriptions: { list: () => Promise.reject(new Error('tidsavbrudd')) }
    };
    expect(await provesvarForVisning({ ...UTEN_RAD, stripe: () => stripe })).toBe('ukjent');
  });

  it('fristen er ÉN for hele oppslaget: er den brukt opp, sendes ikke neste kall', async () => {
    // Kundeoppslaget bruker hele fristen og svarer akkurat for sent.
    const s = stripeMed({ cus_a: 1 }, { kunder: VISNINGSFRIST_MS });
    const svar = provesvarForVisning({ ...UTEN_RAD, stripe: () => s });
    await vi.advanceTimersByTimeAsync(VISNINGSFRIST_MS);
    expect(await svar).toBe('ukjent');
    // Gi det hengende oppslaget tid til å gå videre — det skal IKKE spørre igjen.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.kall.map((k) => k.hva)).toEqual(['customers:x@example.com']);
  });
});

describe('samme regel som checkout', () => {
  const TILFELLER: Array<[string, Record<string, number>]> = [
    ['ingen kunde', {}],
    ['kunde uten abonnement', { cus_a: 0 }],
    ['kunde med abonnement', { cus_a: 1 }],
    ['flere kunder, bare den siste med abonnement', { cus_a: 0, cus_b: 0, cus_c: 2 }]
  ];

  for (const [navn, kunder] of TILFELLER) {
    it(`${navn}: flaten lover uka hvis og bare hvis checkout ville gitt den`, async () => {
      const checkout = await harHattTilgangFor({ ...UTEN_RAD, stripe: () => stripeMed(kunder) });
      const visning = await provesvarForVisning({ ...UTEN_RAD, stripe: () => stripeMed(kunder) });
      expect(visning).toBe(checkout ? 'tidligere' : 'ny');
      expect(kanLoveProve(visning)).toBe(!checkout);
    });
  }

  it('kanLoveProve: bare «ny» er et ja', () => {
    expect(kanLoveProve('ny')).toBe(true);
    expect(kanLoveProve('tidligere')).toBe(false);
    expect(kanLoveProve('ukjent')).toBe(false);
  });
});
