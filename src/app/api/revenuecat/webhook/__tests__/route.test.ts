import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { RevenueCatEvent } from '@/lib/billing/revenuecat';

/**
 * Kjernepåstanden: et manuelt tildelt pass overlever reviewerens sandkassekjøp.
 *
 * Apple App Review-demokontoen har et sesongpass tildelt for hånd, slik at
 * reviewer kan se premiumfunksjonene. Reviewer tester deretter kjøpsflyten i
 * sandkassen — det er rutine. Sandkasseabonnement har komprimert varighet
 * (én måned = fem minutter), så INITIAL_PURCHASE og EXPIRATION kommer med
 * minutters mellomrom, midt i vurderingen.
 *
 * Uten gulvet tok INITIAL_PURCHASE over raden (eierskapsvakten gjaldt bare
 * decision.kind !== 'grant'), og EXPIRATION revokerte den like etter. Reviewer
 * satt igjen med betalingsmur på funksjonene metadataen lover.
 */

const DEMO_USER = '562ab4f8-1f2c-4a1e-9c6f-0d5b7a2e91cc';
const AUTH = 'hemmelig-webhook-streng';

interface UpsertCall {
  table: string;
  values: Record<string, unknown>;
}

let upserts: UpsertCall[] = [];
let updates: UpsertCall[] = [];
let existingBillingRow: Record<string, unknown> | null = null;
/** Rader per user_id — for TRANSFER, der ruta leser to ulike rader. */
let existingRows: Record<string, Record<string, unknown>> = {};

function makeAdminClient() {
  return {
    from(table: string) {
      let sisteEq: unknown = null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (_k: string, v: unknown) => {
          sisteEq = v;
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'billing_webhook_events') return { data: null, error: null };
          const perBruker = typeof sisteEq === 'string' ? existingRows[sisteEq] : undefined;
          return { data: perBruker ?? (Object.keys(existingRows).length ? null : existingBillingRow), error: null };
        },
        insert: async () => ({ error: null }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            updates.push({ table, values });
            return { error: null };
          }
        }),
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
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), flush: async () => true }));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

const { POST } = await import('../route');

function postEvent(event: RevenueCatEvent) {
  return POST(
    new NextRequest('https://www.mycelet.com/api/revenuecat/webhook', {
      method: 'POST',
      headers: { authorization: AUTH },
      body: JSON.stringify({ api_version: '1.0', event })
    })
  );
}

/** Skrivingen mot billing_subscriptions, eller feil hvis det ikke ble noen. */
function billingUpsert() {
  const call = upserts.find((u) => u.table === 'billing_subscriptions');
  if (!call) throw new Error('ingen skriving til billing_subscriptions');
  return call.values;
}

function billingUpsertOrNull() {
  return upserts.find((u) => u.table === 'billing_subscriptions')?.values ?? null;
}

const YEAR = 365 * 24 * 60 * 60 * 1000;
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Raden slik den står i produksjon for App Review-demokontoen. */
function manualGrantRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: DEMO_USER,
    tier: 'season_pass',
    status: 'active',
    current_period_start: new Date(Date.now() - YEAR).toISOString(),
    current_period_end: isoIn(1.5 * YEAR),
    cancel_at_period_end: false,
    metadata: { note: 'Apple App Review demo account', source: 'manual_grant' },
    ...overrides
  };
}

/** Sandkassekjøpet reviewer gjør: utløper om fem minutter. */
function sandboxPurchase(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    id: `evt-${Math.random().toString(36).slice(2)}`,
    app_user_id: DEMO_USER,
    product_id: 'no.mycelet.premium.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: Date.now(),
    expiration_at_ms: Date.now() + 5 * 60 * 1000,
    store: 'APP_STORE',
    environment: 'SANDBOX',
    event_timestamp_ms: Date.now(),
    ...overrides
  };
}

beforeEach(() => {
  upserts = [];
  updates = [];
  existingBillingRow = null;
  existingRows = {};
  process.env.REVENUECAT_WEBHOOK_AUTH = AUTH;
  // Må stå på gjennom App Review — reviewer kjøper nettopp i sandkassen.
  process.env.REVENUECAT_ALLOW_SANDBOX = '1';
});

describe('App Review: reviewerens sandkassekjøp mot demokontoen', () => {
  it('lar ikke sandkassekjøpet overskrive det manuelle sesongpasset', async () => {
    existingBillingRow = manualGrantRow();
    const grantEnd = existingBillingRow.current_period_end as string;

    const res = await postEvent(sandboxPurchase());
    expect(res.status).toBe(200);

    const row = billingUpsert();
    expect(row.tier).toBe('season_pass');
    expect(row.status).toBe('active');
    expect(row.current_period_end).toBe(grantEnd);
    // Markøren må overleve, ellers er raden ubeskyttet ved neste hendelse.
    expect((row.metadata as Record<string, unknown>).source).toBe('manual_grant');
  });

  it('revokerer ikke passet når sandkasseabonnementet utløper minutter senere', async () => {
    // Hele kjeden, slik reviewer utløser den: kjøp → utløp. Raden som skrives
    // av det første kallet mates inn som utgangspunkt for det andre, så testen
    // ikke antar noe om mellomtilstanden.
    existingBillingRow = manualGrantRow();
    const grantEnd = existingBillingRow.current_period_end as string;

    await postEvent(sandboxPurchase());
    existingBillingRow = { user_id: DEMO_USER, ...billingUpsert() };
    upserts = [];

    const res = await postEvent(
      sandboxPurchase({ type: 'EXPIRATION', expiration_at_ms: Date.now() - 1000, expiration_reason: 'UNSUBSCRIBE' })
    );
    expect(res.status).toBe(200);

    // Enten holdes hendelsen unna raden, eller så skrives passet tilbake.
    // Det som ikke er lov, er at demokontoen står igjen uten tilgang.
    const written = billingUpsertOrNull();
    if (written === null) {
      await expect(res.json()).resolves.toMatchObject({ ignored: 'manual_grant_active' });
      expect(existingBillingRow.tier).toBe('season_pass');
      expect(existingBillingRow.status).toBe('active');
      expect(existingBillingRow.current_period_end).toBe(grantEnd);
    } else {
      expect(written.tier).toBe('season_pass');
      expect(written.status).toBe('active');
      expect(written.current_period_end).toBe(grantEnd);
    }
  });

  it('gjenoppretter passet hvis en revoke først slipper forbi eierskapsvakten', async () => {
    // Kjøpet varte lenger enn passet og eier derfor raden, men passet ligger
    // igjen i metadata. Refusjon → revoke → passet skal tilbake, ikke 'canceled'.
    const grantEnd = isoIn(1.5 * YEAR);
    existingBillingRow = manualGrantRow({
      tier: 'premium',
      current_period_end: isoIn(2 * YEAR),
      metadata: {
        provider: 'revenuecat',
        manual_grant: {
          tier: 'season_pass',
          status: 'active',
          current_period_start: null,
          current_period_end: grantEnd,
          cancel_at_period_end: false,
          note: 'Apple App Review demo account'
        }
      }
    });

    const res = await postEvent(
      sandboxPurchase({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', environment: 'PRODUCTION' })
    );
    expect(res.status).toBe(200);

    const row = billingUpsert();
    expect(row.tier).toBe('season_pass');
    expect(row.status).toBe('active');
    expect(row.current_period_end).toBe(grantEnd);
  });
});

describe('gulvet gir ingen gratis tilgang til ekte kunder', () => {
  it('revokerer som før når raden er et vanlig RevenueCat-kjøp', async () => {
    existingBillingRow = manualGrantRow({
      tier: 'premium',
      current_period_end: isoIn(YEAR),
      metadata: { provider: 'revenuecat' }
    });

    const res = await postEvent(
      sandboxPurchase({ type: 'EXPIRATION', environment: 'PRODUCTION', expiration_at_ms: Date.now() - 1000 })
    );
    expect(res.status).toBe(200);

    const row = billingUpsert();
    expect(row.status).toBe('canceled');
  });

  it('revokerer når det manuelle passet selv er utløpt', async () => {
    existingBillingRow = manualGrantRow({
      current_period_end: new Date(Date.now() - YEAR).toISOString()
    });

    const res = await postEvent(
      sandboxPurchase({ type: 'EXPIRATION', environment: 'PRODUCTION', expiration_at_ms: Date.now() - 1000 })
    );
    expect(res.status).toBe(200);

    const row = billingUpsert();
    expect(row.status).toBe('canceled');
    expect(row.tier).toBe('premium');
  });

  it('lar et ekte kjøp som varer lenger enn passet eie raden — og tar vare på passet', async () => {
    const grantEnd = isoIn(7 * 24 * 60 * 60 * 1000); // kundeservice-pass, én uke
    existingBillingRow = manualGrantRow({ current_period_end: grantEnd });

    const purchaseEnd = Date.now() + YEAR;
    const res = await postEvent(
      sandboxPurchase({
        environment: 'PRODUCTION',
        product_id: 'no.mycelet.seasonpass.yearly',
        expiration_at_ms: purchaseEnd
      })
    );
    expect(res.status).toBe(200);

    const row = billingUpsert();
    expect(row.current_period_end).toBe(new Date(purchaseEnd).toISOString());
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.provider).toBe('revenuecat');
    expect(meta.manual_grant).toMatchObject({ tier: 'season_pass', current_period_end: grantEnd });
  });
});

describe('TRANSFER: kjøp flyttet til en ny konto', () => {
  const FRA = '11111111-1111-4111-8111-111111111111';
  const TIL = '22222222-2222-4222-8222-222222222222';
  const rcRad = (userId: string, ekstra: Record<string, unknown> = {}) => ({
    user_id: userId,
    tier: 'premium',
    status: 'active',
    current_period_start: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    current_period_end: isoIn(20 * 24 * 3600 * 1000),
    cancel_at_period_end: false,
    metadata: { provider: 'revenuecat', rc_product_id: 'no.mycelet.premium.monthly' },
    ...ekstra
  });
  const transfer = (): RevenueCatEvent => ({
    type: 'TRANSFER',
    id: `evt-${Math.random().toString(36).slice(2)}`,
    transferred_from: [FRA],
    transferred_to: [TIL],
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    event_timestamp_ms: Date.now()
  });

  it('flytter en RevenueCat-betalt rad til den nye kontoen og sier opp den gamle', async () => {
    existingRows = { [FRA]: rcRad(FRA) };
    const res = await postEvent(transfer());
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe('transfer_applied');
    const ny = billingUpsert();
    expect(ny.user_id).toBe(TIL);
    expect(ny.tier).toBe('premium');
    expect((ny.metadata as Record<string, unknown>).transferred_from).toBe(FRA);
    const gammel = updates.find((u) => u.table === 'billing_subscriptions');
    expect(gammel?.values.status).toBe('canceled');
  });

  it('rører ikke en målkonto som betaler via Stripe', async () => {
    existingRows = {
      [FRA]: rcRad(FRA),
      [TIL]: rcRad(TIL, { metadata: { provider: 'stripe' } })
    };
    const res = await postEvent(transfer());
    expect((await res.json()).ignored).toBe('transfer_dest_protected');
    expect(billingUpsertOrNull()).toBeNull();
    expect(updates.filter((u) => u.table === 'billing_subscriptions')).toHaveLength(0);
  });

  it('uten kilderad (slettet konto) skrives ingenting — bare varsel', async () => {
    existingRows = { [TIL]: rcRad(TIL, { status: 'canceled' }) };
    const res = await postEvent(transfer());
    expect((await res.json()).ignored).toBe('transfer_no_source_row');
    expect(billingUpsertOrNull()).toBeNull();
  });
});
