import { describe, expect, it } from 'vitest';
import {
  STRIPE_EVENT_WATERMARK_KEY,
  decideStripeWrite,
  type StripeBillingRow,
  type StripeEventFacts
} from '../stripe-webhook-decision';
import { resolveSubscriptionPeriod } from '../subscription-period';
import {
  PERIOD_END_ISO,
  PERIOD_START_ISO,
  TEST_SUBSCRIPTION_ID,
  dahliaSubscriptionEvent
} from './stripe-webhook-fixtures';

/**
 * Reglene som skiller «Stripe sier noe» fra «vi skriver det i basen».
 * Alle fire vaktene finnes fordi Stripe verken garanterer rekkefølge eller
 * at hendelsen gjelder det abonnementet raden faktisk peker på.
 */

const HOUR = 3600;
const NOW = Math.floor(Date.parse('2026-08-02T12:00:00Z') / 1000);
const FUTURE_ISO = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

function facts(overrides: Partial<StripeEventFacts> = {}): StripeEventFacts {
  return {
    eventType: 'customer.subscription.updated',
    eventCreated: NOW,
    subscriptionId: TEST_SUBSCRIPTION_ID,
    status: 'active',
    tier: 'premium',
    currentPeriodStart: PERIOD_START_ISO,
    currentPeriodEnd: FUTURE_ISO,
    periodUnknown: false,
    cancelAtPeriodEnd: false,
    ...overrides
  };
}

function row(overrides: Partial<StripeBillingRow> = {}): StripeBillingRow {
  return {
    tier: 'premium',
    status: 'active',
    current_period_start: PERIOD_START_ISO,
    current_period_end: FUTURE_ISO,
    cancel_at_period_end: false,
    stripe_subscription_id: TEST_SUBSCRIPTION_ID,
    metadata: { provider: 'stripe', source: 'customer.subscription.created', [STRIPE_EVENT_WATERMARK_KEY]: NOW - HOUR },
    ...overrides
  };
}

describe('decideStripeWrite — normaltilfellet', () => {
  it('skriver som før på en helt ny rad', () => {
    const decision = decideStripeWrite(facts({ eventType: 'customer.subscription.created' }), null);
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.tier).toBe('premium');
    expect(decision.write.status).toBe('active');
    expect(decision.write.currentPeriodEnd).toBe(FUTURE_ISO);
    expect(decision.write.metadata.provider).toBe('stripe');
    expect(decision.write.metadata.source).toBe('customer.subscription.created');
    expect(decision.tierKept).toBe(false);
    expect(decision.manualGrantFloor).toBe(false);
  });

  it('lar en ekte oppsigelse gå gjennom', () => {
    const decision = decideStripeWrite(
      facts({ eventType: 'customer.subscription.deleted', status: 'canceled', currentPeriodEnd: PAST_ISO }),
      row()
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.status).toBe('canceled');
  });

  it('lar periodUnknown gå videre urørt, slik at datoen i basen overlever', () => {
    const decision = decideStripeWrite(facts({ periodUnknown: true, currentPeriodEnd: null }), row());
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.periodUnknown).toBe(true);
  });

  it('leser perioden fra en ekte dahlia-hendelse (periodefeltene på linjeelementet)', () => {
    const event = dahliaSubscriptionEvent();
    const period = resolveSubscriptionPeriod(event.data.object);
    const decision = decideStripeWrite(
      facts({ currentPeriodStart: period.start, currentPeriodEnd: period.end }),
      null
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.currentPeriodStart).toBe(PERIOD_START_ISO);
    expect(decision.write.currentPeriodEnd).toBe(PERIOD_END_ISO);
  });
});

describe('decideStripeWrite — rekkefølge', () => {
  it('hopper over en hendelse som er eldre enn den sist anvendte', () => {
    const decision = decideStripeWrite(
      facts({ eventType: 'customer.subscription.deleted', status: 'canceled', eventCreated: NOW - 2 * HOUR }),
      row({ metadata: { provider: 'stripe', [STRIPE_EVENT_WATERMARK_KEY]: NOW } })
    );
    expect(decision).toEqual({ action: 'skip', reason: 'stale_event' });
  });

  it('slipper gjennom hendelser med samme tidsstempel (Stripe har bare sekunder)', () => {
    const decision = decideStripeWrite(
      facts({ eventCreated: NOW }),
      row({ metadata: { provider: 'stripe', [STRIPE_EVENT_WATERMARK_KEY]: NOW } })
    );
    expect(decision.action).toBe('write');
  });

  it('flytter aldri periodemerket bakover', () => {
    const decision = decideStripeWrite(
      facts({ eventCreated: NOW - HOUR, freshFromApi: true }),
      row({ metadata: { provider: 'stripe', [STRIPE_EVENT_WATERMARK_KEY]: NOW } })
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.metadata[STRIPE_EVENT_WATERMARK_KEY]).toBe(NOW);
  });

  it('lar et ferskt oppslag mot Stripe passere rekkefølgevakten', () => {
    const decision = decideStripeWrite(
      facts({ eventType: 'checkout.session.completed', eventCreated: NOW - 2 * HOUR, freshFromApi: true }),
      row({ metadata: { provider: 'stripe', [STRIPE_EVENT_WATERMARK_KEY]: NOW } })
    );
    expect(decision.action).toBe('write');
  });
});

describe('decideStripeWrite — eierskap', () => {
  it('lar ikke et gammelt abonnement rive ned det raden peker på', () => {
    const decision = decideStripeWrite(
      facts({
        eventType: 'customer.subscription.deleted',
        status: 'canceled',
        subscriptionId: 'sub_gammel_og_oppsagt'
      }),
      row()
    );
    expect(decision).toEqual({ action: 'skip', reason: 'foreign_subscription' });
  });

  it('lar nye penger fra et annet abonnement ta over raden', () => {
    const decision = decideStripeWrite(
      facts({ status: 'active', subscriptionId: 'sub_nytt_og_betalt' }),
      row({ status: 'canceled' })
    );
    expect(decision.action).toBe('write');
  });

  it('lar ikke en Stripe-oppsigelse ta tilgangen fra en som betaler via App Store', () => {
    const decision = decideStripeWrite(
      facts({ eventType: 'customer.subscription.deleted', status: 'canceled', subscriptionId: null }),
      row({ metadata: { provider: 'revenuecat' }, stripe_subscription_id: null })
    );
    expect(decision).toEqual({ action: 'skip', reason: 'iap_active' });
  });

  it('slipper et nytt Stripe-kjøp gjennom selv om RevenueCat eide raden', () => {
    const decision = decideStripeWrite(
      facts({ status: 'active' }),
      row({ metadata: { provider: 'revenuecat' }, stripe_subscription_id: null })
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.metadata.provider).toBe('stripe');
  });
});

describe('decideStripeWrite — manuelt tildelt pass', () => {
  const founderRow = (): StripeBillingRow => ({
    tier: 'season_pass',
    status: 'active',
    current_period_start: '2026-06-01T00:00:00.000Z',
    current_period_end: '2036-06-01T00:00:00.000Z',
    cancel_at_period_end: false,
    stripe_subscription_id: null,
    metadata: { source: 'manual_grant', note: 'founder' }
  });

  it('lar ikke en Stripe-oppsigelse senke et gyldig pass', () => {
    const decision = decideStripeWrite(
      facts({ eventType: 'customer.subscription.deleted', status: 'canceled', currentPeriodEnd: PAST_ISO }),
      founderRow()
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.manualGrantFloor).toBe(true);
    expect(decision.write.tier).toBe('season_pass');
    expect(decision.write.status).toBe('active');
    expect(decision.write.currentPeriodEnd).toBe('2036-06-01T00:00:00.000Z');
    expect(decision.write.metadata.source).toBe('manual_grant');
    expect(decision.write.metadata.provider).toBe('manual_grant');
  });

  it('beholder passet i metadata når et kjøp varer lenger', () => {
    const decision = decideStripeWrite(
      facts({ status: 'active', currentPeriodEnd: '2040-01-01T00:00:00.000Z' }),
      founderRow()
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.manualGrantFloor).toBe(false);
    expect(decision.write.currentPeriodEnd).toBe('2040-01-01T00:00:00.000Z');
    expect(decision.write.metadata.manual_grant).toMatchObject({
      tier: 'season_pass',
      current_period_end: '2036-06-01T00:00:00.000Z'
    });
  });

  it('gir ikke gulv fra et utløpt pass', () => {
    const expired: StripeBillingRow = { ...founderRow(), current_period_end: '2020-01-01T00:00:00.000Z' };
    const decision = decideStripeWrite(
      facts({ eventType: 'customer.subscription.deleted', status: 'canceled', currentPeriodEnd: PAST_ISO }),
      expired
    );
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.manualGrantFloor).toBe(false);
    expect(decision.write.status).toBe('canceled');
  });
});

describe('decideStripeWrite — ukjent pris-ID', () => {
  it('beholder plannavnet i stedet for å sette en betalende kunde til free', () => {
    const decision = decideStripeWrite(facts({ tier: 'free', status: 'active' }), row({ tier: 'season_pass' }));
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.tier).toBe('season_pass');
    expect(decision.tierKept).toBe(true);
  });

  it('skriver free når raden ikke har noe betalt plannavn å beholde', () => {
    const decision = decideStripeWrite(facts({ tier: 'free', status: 'active' }), row({ tier: 'free' }));
    expect(decision.action).toBe('write');
    if (decision.action !== 'write') return;
    expect(decision.write.tier).toBe('free');
    expect(decision.tierKept).toBe(false);
  });
});
