import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BILLING_ERROR_CANCELLATION_ACK, type RevenueCatEvent } from '@/lib/billing/revenuecat';
import { abonnementKanal, periodelinje } from '@/lib/billing/kanal';
import { hasPaidAccess, type BillingStatus, type BillingTier } from '@/lib/billing/plans';
import { klassifiserAbonnement } from '@/lib/rapport/abonnement';

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

const { POST, maxDuration } = await import('../route');

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

describe('rammene rundt ruta', () => {
  it('hele kjøringen har et tak, godt innenfor de 60 s RevenueCat venter', () => {
    expect(maxDuration).toBe(30);
    expect(maxDuration).toBeLessThan(60);
  });

  it('uautorisert: 401 før noe leses eller skrives, og uten feildetaljer', async () => {
    const res = await POST(
      new NextRequest('https://www.mycelet.com/api/revenuecat/webhook', {
        method: 'POST',
        headers: { authorization: 'feil-streng' },
        body: JSON.stringify({ api_version: '1.0', event: sandboxPurchase() })
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Ugyldig autorisasjon' });
    expect(upserts).toEqual([]);
    expect(updates).toEqual([]);
  });
});

/**
 * Et betalingsproblem kommer som TO hendelser, laget samtidig: BILLING_ISSUE
 * (med fristen Apple gir) og CANCELLATION med cancel_reason BILLING_ERROR (uten
 * frist — bare utløpet som nettopp var). Den siste ble skrevet som en frivillig
 * oppsigelse, og da gikk fristen tapt i begge rekkefølger:
 *
 *   BILLING_ISSUE → CANCELLATION  fristen overskrevet med en passert dato
 *   CANCELLATION → BILLING_ISSUE  BILLING_ISSUE forkastet som «utdatert»
 *
 * Testene spiller av hendelsene mot ÉN rad: det ruta skriver, er det neste
 * hendelse leser. Sluttilstanden skal være den samme uansett rekkefølge.
 */
describe('betalingsproblem: BILLING_ISSUE og CANCELLATION (BILLING_ERROR) i begge rekkefølger', () => {
  const KUNDE = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
  const NAA = new Date('2026-10-01T12:00:00Z');
  const DAG = 24 * 3600 * 1000;
  /** Perioden gikk ut for fem timer siden — RevenueCat melder problemet etter utløpet. */
  const UTLOP = NAA.getTime() - 5 * 3600 * 1000;
  const KJOPT = UTLOP - 30 * DAG;
  /** Apples frist: 16 dager etter utløpet. */
  const FRIST = UTLOP + 16 * DAG;
  /** De to hendelsene lages samtidig, BILLING_ISSUE et øyeblikk først. */
  const TS_ISSUE = NAA.getTime() - 1000;
  const TS_CANCEL = TS_ISSUE + 5;

  const hendelse = (type: string, over: Partial<RevenueCatEvent> = {}): RevenueCatEvent => ({
    type,
    id: `evt-${type}-${Math.random().toString(36).slice(2)}`,
    app_user_id: KUNDE,
    product_id: 'no.mycelet.premium.monthly',
    period_type: 'NORMAL',
    purchased_at_ms: KJOPT,
    expiration_at_ms: UTLOP,
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    ...over
  });
  const billingIssue = (over: Partial<RevenueCatEvent> = {}) =>
    hendelse('BILLING_ISSUE', { grace_period_expiration_at_ms: FRIST, event_timestamp_ms: TS_ISSUE, ...over });
  const billingErrorCancellation = (over: Partial<RevenueCatEvent> = {}) =>
    hendelse('CANCELLATION', { cancel_reason: 'BILLING_ERROR', event_timestamp_ms: TS_CANCEL, ...over });

  /** En betalende App Store-kunde, slik siste RENEWAL etterlot raden. */
  const kunderad = (over: Record<string, unknown> = {}) => ({
    user_id: KUNDE,
    tier: 'premium',
    status: 'active',
    current_period_start: new Date(KJOPT).toISOString(),
    current_period_end: new Date(UTLOP).toISOString(),
    cancel_at_period_end: false,
    created_at: new Date(KJOPT - 60 * DAG).toISOString(),
    metadata: { provider: 'revenuecat', rc_event_type: 'RENEWAL', rc_event_timestamp_ms: KJOPT, rc_environment: 'PRODUCTION' },
    ...over
  });

  interface Rad {
    user_id: string;
    tier: string;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    created_at: string;
    metadata: Record<string, unknown>;
  }

  /** Spiller av hendelsene i rekkefølge. Raden ruta skriver, er den neste hendelse leser. */
  async function spillAv(start: Record<string, unknown>, hendelser: RevenueCatEvent[]) {
    existingBillingRow = start;
    const svar: Array<{ type: string; status: number; body: Record<string, unknown>; skrev: boolean }> = [];
    for (const h of hendelser) {
      upserts = [];
      const res = await postEvent(h);
      const skrevet = billingUpsertOrNull();
      if (skrevet) existingBillingRow = { ...existingBillingRow, ...skrevet };
      svar.push({ type: h.type ?? '', status: res.status, body: (await res.json()) as Record<string, unknown>, skrev: skrevet !== null });
    }
    return { rad: existingBillingRow as unknown as Rad, svar };
  }

  const harTilgang = (rad: Rad) => hasPaidAccess(rad.status as BillingStatus, rad.tier as BillingTier, rad.current_period_end);
  const kortlinje = (rad: Rad) =>
    periodelinje({
      status: rad.status,
      cancelAtPeriodEnd: rad.cancel_at_period_end,
      periodeSlutt: rad.current_period_end,
      kanal: abonnementKanal(rad),
      metadata: rad.metadata,
      naa: NAA
    });

  const REKKEFOLGER: Array<[string, () => RevenueCatEvent[]]> = [
    ['BILLING_ISSUE først (slik RevenueCat sender dem)', () => [billingIssue(), billingErrorCancellation()]],
    ['CANCELLATION først (byttet om på veien)', () => [billingErrorCancellation(), billingIssue()]]
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NAA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each(REKKEFOLGER)('%s', (_navn, par) => {
    it('fristen står: kunden beholder tilgangen til Apples frist', async () => {
      const { rad, svar } = await spillAv(kunderad(), par());
      expect(svar.map((s) => s.status)).toEqual([200, 200]);

      expect(rad.status).toBe('active');
      expect(rad.tier).toBe('premium');
      expect(rad.current_period_end).toBe(new Date(FRIST).toISOString());
      expect(rad.cancel_at_period_end).toBe(true);
      expect(harTilgang(rad)).toBe(true);
    });

    it('CANCELLATION-hendelsen skriver ingenting — heller ikke rekkefølgemerket', async () => {
      const { rad, svar } = await spillAv(kunderad(), par());
      const cancel = svar.find((s) => s.type === 'CANCELLATION');
      expect(cancel?.skrev).toBe(false);
      expect(cancel?.body).toEqual({ received: true, ignored: BILLING_ERROR_CANCELLATION_ACK });
      expect(svar.find((s) => s.type === 'BILLING_ISSUE')?.skrev).toBe(true);
      // Raden bærer BILLING_ISSUE som siste hendelse, med DENS tidsstempel.
      expect(rad.metadata.rc_event_type).toBe('BILLING_ISSUE');
      expect(rad.metadata.rc_event_timestamp_ms).toBe(TS_ISSUE);
      expect(rad.metadata.provider).toBe('revenuecat');
    });

    it('plankortet lover ikke «du belastes ikke igjen» — Apple forsøker fortsatt trekket', async () => {
      const { rad } = await spillAv(kunderad(), par());
      expect(kortlinje(rad)).toBe('periodAccessUntil');
    });

    it('betalingen går i orden: RENEWAL gir en vanlig, løpende rad igjen', async () => {
      const nyttUtlop = UTLOP + 30 * DAG;
      const { rad } = await spillAv(kunderad(), [
        ...par(),
        hendelse('RENEWAL', { purchased_at_ms: UTLOP, expiration_at_ms: nyttUtlop, event_timestamp_ms: NAA.getTime() + 2 * DAG })
      ]);
      expect(rad.status).toBe('active');
      expect(rad.cancel_at_period_end).toBe(false);
      expect(rad.current_period_end).toBe(new Date(nyttUtlop).toISOString());
      expect(kortlinje(rad)).toBe('periodRenews');
    });

    it('fristen går ut uten betaling: EXPIRATION tar tilgangen', async () => {
      const { rad } = await spillAv(kunderad(), [
        ...par(),
        hendelse('EXPIRATION', { expiration_reason: 'BILLING_ERROR', expiration_at_ms: FRIST, event_timestamp_ms: FRIST + 1000 })
      ]);
      expect(rad.status).toBe('canceled');
      expect(harTilgang(rad)).toBe(false);
    });

    it('uten frist hos Apple: past_due, ikke «active» — og EXPIRATION avslutter', async () => {
      const utenFrist = par().map((h) => (h.type === 'BILLING_ISSUE' ? { ...h, grace_period_expiration_at_ms: null } : h));
      const mellom = await spillAv(kunderad(), utenFrist);
      expect(mellom.rad.status).toBe('past_due');
      expect(harTilgang(mellom.rad)).toBe(false);

      const { rad } = await spillAv(mellom.rad as unknown as Record<string, unknown>, [
        hendelse('EXPIRATION', { expiration_reason: 'BILLING_ERROR', event_timestamp_ms: TS_CANCEL + 1000 })
      ]);
      expect(rad.status).toBe('canceled');
    });

    it('første trekk etter en prøve feiler: raden er fortsatt en prøve, ikke en betalende kunde', async () => {
      const proveStart = new Date(UTLOP - 7 * DAG).toISOString();
      const proverad = kunderad({
        status: 'trialing',
        current_period_start: proveStart,
        metadata: {
          provider: 'revenuecat',
          rc_event_type: 'INITIAL_PURCHASE',
          rc_event_timestamp_ms: UTLOP - 7 * DAG,
          rc_environment: 'PRODUCTION',
          prove_start: proveStart
        }
      });
      const iProve = par().map((h) => ({ ...h, period_type: 'TRIAL', purchased_at_ms: UTLOP - 7 * DAG }));

      const { rad } = await spillAv(proverad, iProve);
      expect(rad.status).toBe('trialing');
      expect(rad.current_period_end).toBe(new Date(FRIST).toISOString());
      expect(harTilgang(rad)).toBe(true);
      // Dagsrapportens regel: en prøve, aldri «betalende», og ingen belastning er merket.
      expect(klassifiserAbonnement(rad, NAA)).toBe('prove');
      expect(rad.metadata.prove_start).toBe(proveStart);
      expect(rad.metadata.forste_belastning).toBeUndefined();

      // Går trekket gjennom senere, er DET første belastning.
      const belastet = UTLOP + 3 * DAG;
      const etter = await spillAv(rad as unknown as Record<string, unknown>, [
        hendelse('RENEWAL', { purchased_at_ms: belastet, expiration_at_ms: belastet + 30 * DAG, event_timestamp_ms: belastet + 1000 })
      ]);
      expect(etter.rad.status).toBe('active');
      expect(etter.rad.metadata.forste_belastning).toBe(new Date(belastet).toISOString());
      expect(klassifiserAbonnement(etter.rad, new Date(belastet + DAG))).toBe('betalende');
    });

    it('et manuelt tildelt pass er urørt: ingen av hendelsene skriver', async () => {
      const pass = manualGrantRow({ user_id: KUNDE, current_period_end: new Date(NAA.getTime() + 1.5 * YEAR).toISOString() });
      const { rad, svar } = await spillAv(pass, par());
      expect(svar.map((s) => s.skrev)).toEqual([false, false]);
      expect(rad.tier).toBe('season_pass');
      expect(rad.status).toBe('active');
      expect(rad.current_period_end).toBe(pass.current_period_end);
      expect(rad.metadata.source).toBe('manual_grant');
    });

    it('et kjøp som eide raden over et pass: passet er gulvet når betalingen svikter', async () => {
      const passSlutt = new Date(NAA.getTime() + 1.5 * YEAR).toISOString();
      const kjopOverPass = kunderad({
        metadata: {
          provider: 'revenuecat',
          rc_event_type: 'RENEWAL',
          rc_event_timestamp_ms: KJOPT,
          manual_grant: {
            tier: 'season_pass',
            status: 'active',
            current_period_start: null,
            current_period_end: passSlutt,
            cancel_at_period_end: false,
            note: 'kundeservice'
          }
        }
      });
      const { rad } = await spillAv(kjopOverPass, par());
      expect(rad.tier).toBe('season_pass');
      expect(rad.status).toBe('active');
      expect(rad.current_period_end).toBe(passSlutt);
      expect(rad.cancel_at_period_end).toBe(false);
      expect(rad.metadata.source).toBe('manual_grant');
      expect(harTilgang(rad)).toBe(true);
    });
  });

  it('en FRIVILLIG oppsigelse er uendret: tilgang ut perioden, og kortet kan love «belastes ikke igjen»', async () => {
    const lopende = kunderad({ current_period_end: new Date(NAA.getTime() + 10 * DAG).toISOString() });
    const { rad, svar } = await spillAv(lopende, [
      hendelse('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: NAA.getTime() + 10 * DAG, event_timestamp_ms: TS_CANCEL })
    ]);
    expect(svar[0].skrev).toBe(true);
    expect(rad.status).toBe('active');
    expect(rad.cancel_at_period_end).toBe(true);
    expect(rad.metadata.rc_event_type).toBe('CANCELLATION');
    expect(kortlinje(rad)).toBe('periodEndsNoCharge');
  });

  it('en oppsigelse i PRØVEN beholder trialing — en avbrutt gratisuke er ikke en kunde', async () => {
    const proveSlutt = NAA.getTime() + 4 * DAG;
    const proverad = kunderad({
      status: 'trialing',
      current_period_start: new Date(proveSlutt - 7 * DAG).toISOString(),
      current_period_end: new Date(proveSlutt).toISOString(),
      metadata: { provider: 'revenuecat', rc_event_type: 'INITIAL_PURCHASE', rc_event_timestamp_ms: proveSlutt - 7 * DAG }
    });
    const { rad } = await spillAv(proverad, [
      hendelse('CANCELLATION', {
        cancel_reason: 'UNSUBSCRIBE',
        period_type: 'TRIAL',
        purchased_at_ms: proveSlutt - 7 * DAG,
        expiration_at_ms: proveSlutt,
        event_timestamp_ms: TS_CANCEL
      })
    ]);
    expect(rad.status).toBe('trialing');
    expect(rad.cancel_at_period_end).toBe(true);
    expect(klassifiserAbonnement(rad, NAA)).toBe('prove');
    expect(kortlinje(rad)).toBe('periodTrialEndsNoCharge');
  });

  it('en BILLING_ISSUE som kommer ETTER at betalingen gikk i orden, forkastes som utdatert', async () => {
    // RENEWAL er laget etter BILLING_ISSUE, men kom fram først.
    const nyttUtlop = UTLOP + 30 * DAG;
    const { rad, svar } = await spillAv(kunderad(), [
      hendelse('RENEWAL', { purchased_at_ms: UTLOP, expiration_at_ms: nyttUtlop, event_timestamp_ms: TS_ISSUE + 60_000 }),
      billingIssue(),
      billingErrorCancellation()
    ]);
    expect(svar[1].body).toEqual({ received: true, ignored: 'stale_event' });
    expect(svar[2].skrev).toBe(false);
    expect(rad.status).toBe('active');
    expect(rad.cancel_at_period_end).toBe(false);
    expect(rad.current_period_end).toBe(new Date(nyttUtlop).toISOString());
  });
});
