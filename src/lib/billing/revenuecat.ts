import { BillingStatus, BillingTier, guessTierFromProductId, hasPaidAccess, isPaidTier } from './plans';

/**
 * RevenueCat webhook event mapping — pure logic, no I/O.
 *
 * RevenueCat is the IAP layer for the native apps (Apple App Store now, Google
 * Play later). Its webhook drives the SAME `billing_subscriptions` row that
 * Stripe writes on web, so `getBillingCapabilities` stays the single source of
 * truth for paid access regardless of where the user bought.
 *
 * Event semantics (docs.revenuecat.com/docs/integrations/webhooks):
 * - CANCELLATION means "auto-renew turned off" — access CONTINUES until the
 *   period ends. EXPIRATION is the event that actually removes access. The one
 *   exception: cancel_reason CUSTOMER_SUPPORT is a refund → revoke immediately.
 * - RevenueCat retries deliveries (at-least-once); `event.id` is the official
 *   dedup key, and deliveries can arrive OUT OF ORDER — the route enforces
 *   ordering via the stored rc_event_timestamp_ms.
 * - `environment: 'SANDBOX'` events come from sandbox/TestFlight purchases —
 *   only honored when REVENUECAT_ALLOW_SANDBOX=1 (keep ON through App Review,
 *   turn OFF after launch so sandbox buys can't grant free premium).
 *
 * Decision kinds drive the route's cross-provider ownership rules:
 * - 'grant'  = new money/entitlement → always applies (takes ownership).
 * - 'modify' = changes renewal state of an EXISTING Apple sub → only applies
 *              when the row is RevenueCat-owned (or unpaid).
 * - 'revoke' = removes access → same ownership requirement, so an old Apple
 *              event can never kill a subscription the user pays via Stripe.
 *
 * Manually granted access (founder pass, App Review demo account, customer
 * service comp) is a THIRD kind of row that no store owns — see the manual
 * grant floor at the bottom of this file.
 */

export interface RevenueCatEvent {
  type?: string;
  id?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  entitlement_ids?: string[] | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  store?: string | null;
  environment?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  /**
   * TRANSFER: app_user_id-ene kjøpene flyttes FRA og TIL (kun i den
   * hendelsen — den mangler app_user_id, product_id og utløp). Se ruta.
   */
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

export interface RevenueCatWebhookBody {
  api_version?: string;
  event?: RevenueCatEvent;
}

/** Update to apply to the user's billing_subscriptions row. */
export interface BillingUpdate {
  tier: BillingTier;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export type RevenueCatDecision =
  | { action: 'apply'; kind: 'grant' | 'modify' | 'revoke'; update: BillingUpdate }
  | { action: 'ack'; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The RC app user id is set to the Supabase user UUID at SDK configure time,
 * so `app_user_id` is normally our user id directly. But anonymous-ID merges
 * mean the UUID can also hide in `original_app_user_id` or `aliases`
 * (anonymous ids look like `$RCAnonymousID:...`). Scan all of them.
 */
export function resolveSupabaseUserId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  for (const candidate of candidates) {
    if (candidate && UUID_RE.test(candidate)) return candidate;
  }
  return null;
}

/**
 * Product-id → tier, mirroring `resolveTierByPriceId` for Stripe. The ids are
 * env-configurable so App Store Connect naming can change without a deploy;
 * the shared substring fallback keeps an unmapped-but-obvious id working (and
 * keeps client + server interpreting the catalog identically).
 */
export function resolveTierByRcProductId(productId: string | null | undefined): BillingTier {
  if (!productId) return 'free';
  if (productId === (process.env.REVENUECAT_PRODUCT_PREMIUM_MONTHLY ?? 'no.mycelet.premium.monthly')) {
    return 'premium';
  }
  if (productId === (process.env.REVENUECAT_PRODUCT_SEASON_PASS ?? 'no.mycelet.seasonpass.yearly')) {
    return 'season_pass';
  }
  return guessTierFromProductId(productId);
}

function toIsoFromMs(ms: number | null | undefined): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

const GRANT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED'
]);

/** Event types this integration acts on; everything else is ACKed untouched. */
const HANDLED_TYPES = new Set([...GRANT_TYPES, 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE']);

/**
 * Map one webhook event to a billing decision. Everything unknown or
 * informational is ACKed (RevenueCat retries non-200s up to 5 times — an
 * unhandled-but-harmless event must never turn into a retry storm).
 */
export function mapRevenueCatEvent(event: RevenueCatEvent): RevenueCatDecision {
  const type = event.type ?? 'UNKNOWN';

  if (!HANDLED_TYPES.has(type)) {
    // TEST, PRODUCT_CHANGE (real switch arrives as RENEWAL/INITIAL_PURCHASE),
    // TRANSFER (route logs loudly for manual follow-up), SUBSCRIBER_ALIAS,
    // SUBSCRIPTION_PAUSED, PAYWALL_*, future types.
    return { action: 'ack', reason: type === 'TEST' ? 'test_event' : `unhandled_type:${type}` };
  }

  const tier = resolveTierByRcProductId(event.product_id);
  if (tier === 'free') return { action: 'ack', reason: 'unknown_product' };

  const periodStart = toIsoFromMs(event.purchased_at_ms);
  const periodEnd = toIsoFromMs(event.expiration_at_ms);

  if (GRANT_TYPES.has(type)) {
    return {
      action: 'apply',
      kind: 'grant',
      update: {
        tier,
        status: event.period_type === 'TRIAL' ? 'trialing' : 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      }
    };
  }

  if (type === 'CANCELLATION') {
    if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
      // Refund → access off now (an EXPIRATION usually follows; this is the
      // belt-and-braces path so a refunded user never keeps premium).
      return {
        action: 'apply',
        kind: 'revoke',
        update: {
          tier,
          status: 'canceled',
          currentPeriodStart: periodStart,
          currentPeriodEnd: toIsoFromMs(event.event_timestamp_ms),
          cancelAtPeriodEnd: true
        }
      };
    }
    // Auto-renew off: access continues until expiration (Stripe-paritet:
    // status stays active + cancel_at_period_end).
    return {
      action: 'apply',
      kind: 'modify',
      update: {
        tier,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true
      }
    };
  }

  if (type === 'EXPIRATION') {
    return {
      action: 'apply',
      kind: 'revoke',
      update: {
        tier,
        status: 'canceled',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true
      }
    };
  }

  // BILLING_ISSUE
  const graceEnd = toIsoFromMs(event.grace_period_expiration_at_ms);
  if (graceEnd) {
    // Store grace period keeps access alive; extend to its end. RENEWAL
    // (recovered) or EXPIRATION (lost) arrives later and settles it.
    return {
      action: 'apply',
      kind: 'modify',
      update: {
        tier,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: graceEnd,
        cancelAtPeriodEnd: true
      }
    };
  }
  return {
    action: 'apply',
    kind: 'revoke',
    update: {
      tier,
      status: 'past_due',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true
    }
  };
}

// ───────────────────────── Manuelt tildelt tilgang ─────────────────────────
//
// Founder-passet, App Review-demokontoen og eventuelle kundeservice-pass
// skrives for hånd i SQL-editoren, i den SAMME `billing_subscriptions`-raden
// som butikkene skriver. Raden merkes `metadata = {"source":"manual_grant"}`
// og har en eksplisitt `current_period_end`.
//
// Det er ikke et kjøp. Ingen butikk fornyer det, og ingen butikkhendelse skal
// kunne ta det fra brukeren — heller ikke et sandkassekjøp fra Apples egen
// reviewer, som utløper etter minutter og sender EXPIRATION rett etterpå.

/** Manuelt tildelt tilgang, slik den ligger på raden eller i metadata. */
export interface ManualGrant {
  tier: BillingTier;
  status: BillingStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  note: string | null;
}

/** Feltene fra `billing_subscriptions` som trengs for å lese passet. */
export interface ManualGrantRow {
  tier?: string | null;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

/** Markøren en operatør skriver for hånd. Ett sted, så den er søkbar. */
export const MANUAL_GRANT_SOURCE = 'manual_grant';

function asIsoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Streng lesing: mangler tier eller status, finnes det ikke noe pass.
 * Feilretningen som gir tilgang er den farlige, så tvil betyr «intet gulv».
 */
function coerceManualGrant(raw: Record<string, unknown>): ManualGrant | null {
  const tier = raw.tier;
  const status = raw.status;
  if (typeof tier !== 'string' || !isPaidTier(tier as BillingTier)) return null;
  if (typeof status !== 'string') return null;
  return {
    tier: tier as BillingTier,
    status: status as BillingStatus,
    currentPeriodStart: asIsoOrNull(raw.current_period_start),
    currentPeriodEnd: asIsoOrNull(raw.current_period_end),
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
    note: typeof raw.note === 'string' ? raw.note : null
  };
}

/**
 * Les det manuelle passet som gjelder for raden, hvis det finnes. To former,
 * i prioritert rekkefølge:
 *
 *  1. Raden ER passet — `metadata.source === 'manual_grant'`. Da står passet i
 *     radens egne kolonner. Dette er formen produksjonsradene har i dag.
 *  2. Raden er overtatt av et kjøp som varer lenger, og passet ligger igjen som
 *     `metadata.manual_grant`. Webhooken legger det der nettopp for at passet
 *     skal kunne gjenopprettes når kjøpet utløper eller refunderes.
 */
export function readManualGrant(row: ManualGrantRow | null | undefined): ManualGrant | null {
  const meta = row?.metadata ?? null;

  if (meta && meta.source === MANUAL_GRANT_SOURCE) {
    const fromRow = coerceManualGrant({
      tier: row?.tier,
      status: row?.status,
      current_period_start: row?.current_period_start,
      current_period_end: row?.current_period_end,
      cancel_at_period_end: row?.cancel_at_period_end,
      note: meta.note
    });
    if (fromRow) return fromRow;
  }

  const snapshot = meta?.manual_grant;
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    return coerceManualGrant(snapshot as Record<string, unknown>);
  }

  return null;
}

/**
 * Et pass gjelder bare så lenge operatøren har sagt at det gjelder. Samme
 * regel som all annen betalt tilgang: utløpt dato eller status utenfor
 * active/trialing = ikke noe gulv.
 */
export function isManualGrantActive(grant: ManualGrant | null | undefined): boolean {
  if (!grant) return false;
  return hasPaidAccess(grant.status, grant.tier, grant.currentPeriodEnd);
}

/** Serialisert form i metadata — snake_case, som kolonnene den kom fra. */
export function serializeManualGrant(grant: ManualGrant): Record<string, unknown> {
  return {
    tier: grant.tier,
    status: grant.status,
    current_period_start: grant.currentPeriodStart,
    current_period_end: grant.currentPeriodEnd,
    cancel_at_period_end: grant.cancelAtPeriodEnd,
    note: grant.note
  };
}

/** Varer kjøpet lenger enn passet? Null = ingen sluttdato = varer evig. */
function outlastsManualGrant(purchaseEnd: string | null, grantEnd: string | null): boolean {
  if (grantEnd === null) return false;
  if (purchaseEnd === null) return true;
  const purchase = new Date(purchaseEnd).getTime();
  const grant = new Date(grantEnd).getTime();
  if (!Number.isFinite(purchase) || !Number.isFinite(grant)) return false;
  return purchase > grant;
}

/**
 * Manuelt tildelt tilgang er et GULV, ikke et kjøp.
 *
 * RevenueCat-hendelsen får bare skrive raden når den gir betalt tilgang som
 * varer LENGER enn passet. Alt annet faller tilbake til passet slik operatøren
 * skrev det: sandkassekjøpet som utløper om fem minutter, EXPIRATION etterpå,
 * refusjonen, regningsproblemet.
 *
 * Gulvet kan aldri gi mer enn det som er tildelt for hånd. Det er avgrenset av
 * passets egen `current_period_end`, og et utløpt pass er ikke noe gulv i det
 * hele tatt. En ekte kunde som slutter å betale mister tilgangen nøyaktig som
 * før — det eneste hen sitter igjen med er det en operatør uttrykkelig har
 * skrevet inn, med den sluttdatoen operatøren satte.
 */
export function applyManualGrantFloor(
  update: BillingUpdate,
  grant: ManualGrant | null | undefined
): { update: BillingUpdate; floorApplied: boolean } {
  if (!isManualGrantActive(grant) || !grant) return { update, floorApplied: false };

  const purchaseIsPaid = hasPaidAccess(update.status, update.tier, update.currentPeriodEnd);
  if (purchaseIsPaid && outlastsManualGrant(update.currentPeriodEnd, grant.currentPeriodEnd)) {
    return { update, floorApplied: false };
  }

  return {
    update: {
      tier: grant.tier,
      status: grant.status === 'trialing' ? 'trialing' : 'active',
      currentPeriodStart: grant.currentPeriodStart,
      currentPeriodEnd: grant.currentPeriodEnd,
      cancelAtPeriodEnd: grant.cancelAtPeriodEnd
    },
    floorApplied: true
  };
}
