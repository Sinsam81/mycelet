import { describe, expect, it } from 'vitest';
import { avsluttStripeVedSletting } from '../avslutt-ved-sletting';

function admin(rad: Record<string, unknown> | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: rad ? [rad] : [], error })
      })
    })
  };
}

const log = { info: () => undefined, warn: () => undefined };

describe('avsluttStripeVedSletting', () => {
  it('sier opp et løpende abonnement og rapporterer det', async () => {
    const kansellert: string[] = [];
    const stripe = () => ({ subscriptions: { cancel: async (id: string) => void kansellert.push(id) } });
    const r = await avsluttStripeVedSletting({ admin: admin({ stripe_subscription_id: 'sub_1', status: 'active' }), stripe, userId: 'u', log });
    expect(r).toEqual({ ok: true, avsluttet: true });
    expect(kansellert).toEqual(['sub_1']);
  });

  it('gjør ingenting uten rad eller uten Stripe-abonnement — og rører aldri Stripe-klienten', async () => {
    const stripe = () => {
      throw new Error('skal ikke kalles');
    };
    expect(await avsluttStripeVedSletting({ admin: admin(null), stripe, userId: 'u', log })).toEqual({ ok: true, avsluttet: false });
    expect(await avsluttStripeVedSletting({ admin: admin({ stripe_subscription_id: null, status: 'active' }), stripe, userId: 'u', log })).toEqual({ ok: true, avsluttet: false });
    expect(await avsluttStripeVedSletting({ admin: admin({ stripe_subscription_id: 'sub_2', status: 'canceled' }), stripe, userId: 'u', log })).toEqual({ ok: true, avsluttet: false });
  });

  it('«finnes ikke» hos Stripe er suksess — ingen belastes', async () => {
    const stripe = () => ({
      subscriptions: {
        cancel: async () => {
          throw Object.assign(new Error('No such subscription'), { code: 'resource_missing', statusCode: 404 });
        }
      }
    });
    const r = await avsluttStripeVedSletting({ admin: admin({ stripe_subscription_id: 'sub_3', status: 'active' }), stripe, userId: 'u', log });
    expect(r.ok).toBe(true);
  });

  it('annen Stripe-feil stopper slettingen (ok=false), så kontoen ikke forsvinner med abonnementet løpende', async () => {
    const stripe = () => ({
      subscriptions: {
        cancel: async () => {
          throw Object.assign(new Error('rate limited'), { statusCode: 429 });
        }
      }
    });
    const r = await avsluttStripeVedSletting({ admin: admin({ stripe_subscription_id: 'sub_4', status: 'active' }), stripe, userId: 'u', log });
    expect(r.ok).toBe(false);
    expect(r.detalj).toContain('rate limited');
  });

  it('lesefeil mot databasen stopper også slettingen', async () => {
    const r = await avsluttStripeVedSletting({ admin: admin(null, { message: 'nede' }), stripe: () => ({ subscriptions: { cancel: async () => undefined } }), userId: 'u', log });
    expect(r.ok).toBe(false);
  });
});
