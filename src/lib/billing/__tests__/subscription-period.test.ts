import { describe, it, expect } from 'vitest';
import { resolveSubscriptionPeriod } from '../subscription-period';
import { hasPaidAccess } from '../plans';
import {
  dahliaSubscriptionEvent,
  legacySubscriptionEvent,
  periodlessSubscriptionEvent,
  PERIOD_END_ISO,
  PERIOD_START_ISO
} from './stripe-webhook-fixtures';

describe('mekanismen bak feilen', () => {
  it('null utløpsdato gir tilgang uten ende', () => {
    // Dette er hvorfor en tapt dato er verre enn en feil dato: raden blir
    // aldri ugyldig av seg selv.
    expect(hasPaidAccess('active', 'premium', null)).toBe(true);
    expect(hasPaidAccess('active', 'premium', '2020-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('resolveSubscriptionPeriod — dagens rendring (dahlia)', () => {
  const subscription = dahliaSubscriptionEvent().data.object;

  it('finner perioden på linjeelementet', () => {
    expect(resolveSubscriptionPeriod(subscription)).toEqual({
      start: PERIOD_START_ISO,
      end: PERIOD_END_ISO,
      source: 'items'
    });
  });

  it('lar seg ikke lure av at topnivåfeltene finnes og er null', () => {
    const raw = subscription as Record<string, unknown>;
    expect(raw.current_period_end).toBeNull();
    expect(resolveSubscriptionPeriod(subscription).end).not.toBeNull();
  });

  it('gir en dato som faktisk utløper', () => {
    const { end } = resolveSubscriptionPeriod(subscription);
    expect(hasPaidAccess('active', 'premium', end)).toBe(false); // 12. juli 2026 er passert
  });
});

describe('resolveSubscriptionPeriod — gammel rendring (2024-06-20)', () => {
  it('leser fortsatt topnivå', () => {
    expect(resolveSubscriptionPeriod(legacySubscriptionEvent().data.object)).toEqual({
      start: PERIOD_START_ISO,
      end: PERIOD_END_ISO,
      source: 'subscription'
    });
  });
});

describe('resolveSubscriptionPeriod — begge rendringer for alle tre hendelsestypene', () => {
  const types = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'] as const;

  it.each(types)('%s gir samme periode uansett API-versjon', (type) => {
    const fromDahlia = resolveSubscriptionPeriod(dahliaSubscriptionEvent({ type }).data.object);
    const fromLegacy = resolveSubscriptionPeriod(legacySubscriptionEvent({ type }).data.object);

    expect(fromDahlia.end).toBe(PERIOD_END_ISO);
    expect(fromLegacy.end).toBe(PERIOD_END_ISO);
    expect(fromDahlia.start).toBe(fromLegacy.start);
  });
});

describe('resolveSubscriptionPeriod — når perioden ikke finnes noe sted', () => {
  it('sier fra med source=missing i stedet for å late som', () => {
    expect(resolveSubscriptionPeriod(periodlessSubscriptionEvent().data.object)).toEqual({
      start: null,
      end: null,
      source: 'missing'
    });
  });

  it.each([null, undefined, 'sub_123', 42, [], {}])('tåler %s uten å kaste', (input) => {
    expect(resolveSubscriptionPeriod(input)).toMatchObject({ end: null, source: 'missing' });
  });
});

describe('resolveSubscriptionPeriod — grensetilfeller i formen', () => {
  it('hopper over linjeelementer uten periode og finner det som har en', () => {
    const period = resolveSubscriptionPeriod({
      current_period_end: null,
      items: {
        data: [{ id: 'si_uten' }, { id: 'si_med', current_period_start: 100, current_period_end: 200 }]
      }
    });
    expect(period).toEqual({ start: '1970-01-01T00:01:40.000Z', end: '1970-01-01T00:03:20.000Z', source: 'items' });
  });

  it('arver startdato fra topnivå når bare slutten ligger på elementet', () => {
    const period = resolveSubscriptionPeriod({
      current_period_start: 100,
      items: { data: [{ current_period_end: 200 }] }
    });
    expect(period.start).toBe('1970-01-01T00:01:40.000Z');
    expect(period.source).toBe('items');
  });

  it('godtar ikke en startdato alene som gyldig periode', () => {
    // Uten sluttdato vet vi ikke når tilgangen skal ta slutt.
    expect(resolveSubscriptionPeriod({ current_period_start: 100 }).source).toBe('missing');
  });

  it('leser ikke tidspunkt fra en streng', () => {
    expect(resolveSubscriptionPeriod({ current_period_end: '1783874569' }).source).toBe('missing');
  });
});
