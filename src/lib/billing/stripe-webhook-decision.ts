import { BillingStatus, BillingTier, hasPaidAccess, isPaidTier } from './plans';
import { MANUAL_GRANT_SOURCE, readManualGrant, serializeManualGrant, type ManualGrant } from './revenuecat';

/**
 * Hva Stripe-webhooken skal skrive til `billing_subscriptions` — ren logikk,
 * ingen I/O, slik at reglene kan testes uten Stripe og uten database.
 *
 * Bakgrunnen: de to webhookene skriver SAMME rad, men bare RevenueCat-siden
 * beskyttet seg. Stripe-grenen upsertet blindt. Tre hull fulgte av det:
 *
 * 1. REKKEFØLGE. Stripe garanterer ikke rekkefølge og prøver på nytt i opptil
 *    tre døgn. En forsinket `customer.subscription.deleted` fra et gammelt
 *    abonnement — eller en retry av en gammel 'canceled' etter en ny 'active' —
 *    skrev status 'canceled' på raden til noe kunden nettopp hadde betalt for.
 *    Vi lagrer derfor `event.created` på raden og hopper over eldre hendelser,
 *    nøyaktig som RevenueCat-siden gjør med rc_event_timestamp_ms.
 *
 * 2. EIERSKAP. En hendelse som FJERNER tilgang må gjelde det abonnementet raden
 *    faktisk peker på. Ellers kan et gammelt, oppsagt abonnement rive ned det
 *    nye. Hendelser som GIR tilgang slipper alltid gjennom — nye penger tar
 *    eierskap (samme regel som RevenueCat-siden).
 *
 * 3. MANUELT TILDELT TILGANG. Founder-passet, App Review-demokontoen og
 *    kundeservice-pass ligger i samme rad, merket `metadata.source =
 *    'manual_grant'`, uten noen provider-nøkkel. Stripe-grenen overskrev både
 *    passet og merkelappen. Passet er et GULV: en butikkhendelse kan bare heve
 *    det, aldri senke det. Se applyManualGrantFloor i revenuecat.ts — samme
 *    regel, uttrykt her fordi Stripe-statusene er et videre sett enn
 *    RevenueCat-oppdateringens.
 *
 * I tillegg: en pris-ID vi ikke kjenner igjen gir tier 'free'
 * (resolveTierByPriceId). Skjer det på et abonnement som fortsatt betales —
 * fordi prisen er byttet i Stripe uten at miljøvariabelen er oppdatert —
 * mistet kunden tilgangen. Vi beholder da plannavnet raden allerede har.
 */

/** Nøkkelen periodemerket lagres under i `billing_subscriptions.metadata`. */
export const STRIPE_EVENT_WATERMARK_KEY = 'stripe_event_created';

/** Radens felter slik webhooken trenger dem. */
export interface StripeBillingRow {
  tier?: string | null;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  stripe_subscription_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StripeEventFacts {
  /** event.type — havner i metadata.source, som før. */
  eventType: string;
  /** event.created i unix-sekunder. Null når hendelsen ikke oppgir den. */
  eventCreated: number | null;
  subscriptionId: string | null;
  /** Allerede oversatt med mapStripeStatus. */
  status: string;
  /** Allerede slått opp med resolveTierByPriceId. */
  tier: BillingTier;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** Ingen periode fantes i payloaden — periodekolonnene skal ikke røres. */
  periodUnknown: boolean;
  cancelAtPeriodEnd: boolean;
  /**
   * Objektet ble hentet ferskt fra Stripe-API-et (checkout.session.completed
   * slår opp abonnementet), så innholdet er sant NÅ selv om hendelsen er
   * gammel. Da gjelder ikke rekkefølgevakten — men periodemerket flyttes
   * heller aldri bakover.
   */
  freshFromApi?: boolean;
}

export interface StripeWrite {
  tier: BillingTier;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  periodUnknown: boolean;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, unknown>;
}

export type StripeWebhookDecision =
  | { action: 'skip'; reason: 'stale_event' | 'foreign_subscription' | 'iap_active' }
  | {
      action: 'write';
      write: StripeWrite;
      /** Plannavnet ble beholdt fordi pris-ID-en var ukjent. Verdt en warn. */
      tierKept: boolean;
      /** Et manuelt pass overstyrte det butikken sa. Verdt en warn. */
      manualGrantFloor: boolean;
    };

function isPaidStatus(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

function readWatermark(metadata: Record<string, unknown> | null | undefined): number | null {
  const value = metadata?.[STRIPE_EVENT_WATERMARK_KEY];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Varer kjøpet lenger enn passet? Speiler outlastsManualGrant i revenuecat.ts.
 * Null sluttdato på passet = passet varer evig og kan ikke overgås.
 */
function purchaseOutlastsGrant(write: { status: string; tier: BillingTier; currentPeriodEnd: string | null }, grant: ManualGrant): boolean {
  if (!hasPaidAccess(write.status as BillingStatus, write.tier, write.currentPeriodEnd)) return false;
  if (grant.currentPeriodEnd === null) return false;
  if (write.currentPeriodEnd === null) return true;
  const purchase = new Date(write.currentPeriodEnd).getTime();
  const granted = new Date(grant.currentPeriodEnd).getTime();
  if (!Number.isFinite(purchase) || !Number.isFinite(granted)) return false;
  return purchase > granted;
}

export function decideStripeWrite(
  facts: StripeEventFacts,
  existing: StripeBillingRow | null | undefined
): StripeWebhookDecision {
  const metadata = existing?.metadata ?? null;
  const watermark = readWatermark(metadata);
  const grants = isPaidStatus(facts.status);

  // 1. Rekkefølge. Strengt eldre hendelser hoppes over; like tidsstempler
  //    slipper gjennom (Stripe oppgir bare hele sekunder, og produksjonsloggen
  //    viser tre hendelser innenfor 0,17 sekund).
  if (!facts.freshFromApi && watermark !== null && facts.eventCreated !== null && facts.eventCreated < watermark) {
    return { action: 'skip', reason: 'stale_event' };
  }

  // 2. En hendelse som fjerner tilgang må gjelde abonnementet raden peker på.
  if (
    !grants &&
    facts.subscriptionId &&
    existing?.stripe_subscription_id &&
    existing.stripe_subscription_id !== facts.subscriptionId
  ) {
    return { action: 'skip', reason: 'foreign_subscription' };
  }

  // 3. Kunden betaler via App Store nå — en gammel Stripe-oppsigelse får ikke
  //    ta tilgangen fra dem.
  if (
    !grants &&
    metadata?.provider === 'revenuecat' &&
    hasPaidAccess(existing?.status as BillingStatus, existing?.tier as BillingTier, existing?.current_period_end ?? null)
  ) {
    return { action: 'skip', reason: 'iap_active' };
  }

  // 4. Ukjent pris-ID skal ikke koste kunden plannavnet sitt.
  let tier = facts.tier;
  let tierKept = false;
  if (tier === 'free' && isPaidTier(existing?.tier as BillingTier)) {
    tier = existing!.tier as BillingTier;
    tierKept = true;
  }

  let write: StripeWrite = {
    tier,
    status: facts.status,
    currentPeriodStart: facts.currentPeriodStart,
    currentPeriodEnd: facts.currentPeriodEnd,
    periodUnknown: facts.periodUnknown,
    cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
    metadata: {}
  };

  // 5. Gulvet: manuelt tildelt tilgang kan bare heves av et kjøp som varer
  //    lenger, aldri senkes av en butikkhendelse.
  const grant = readManualGrant(existing);
  const grantActive = Boolean(grant && hasPaidAccess(grant.status, grant.tier, grant.currentPeriodEnd));
  const manualGrantFloor = Boolean(grantActive && grant && !purchaseOutlastsGrant(write, grant));

  if (manualGrantFloor && grant) {
    write = {
      tier: grant.tier,
      status: grant.status === 'trialing' ? 'trialing' : 'active',
      currentPeriodStart: grant.currentPeriodStart,
      currentPeriodEnd: grant.currentPeriodEnd,
      periodUnknown: false,
      cancelAtPeriodEnd: grant.cancelAtPeriodEnd,
      metadata: {}
    };
  }

  // Periodemerket flyttes aldri bakover.
  const nextWatermark =
    facts.eventCreated !== null ? Math.max(facts.eventCreated, watermark ?? facts.eventCreated) : watermark;

  write.metadata = {
    provider: manualGrantFloor ? MANUAL_GRANT_SOURCE : 'stripe',
    source: manualGrantFloor ? MANUAL_GRANT_SOURCE : facts.eventType,
    ...(manualGrantFloor && grant?.note ? { note: grant.note } : {}),
    // Passet følger raden også når et kjøp overtar den, slik at det kan leses
    // tilbake når kjøpet utløper eller refunderes.
    ...(grant ? { manual_grant: serializeManualGrant(grant) } : {}),
    ...(nextWatermark !== null ? { [STRIPE_EVENT_WATERMARK_KEY]: nextWatermark } : {})
  };

  return { action: 'write', write, tierKept, manualGrantFloor };
}
