import { BillingStatus, BillingTier, isPaidTier } from './plans';

/**
 * Hvordan abonnementet skal PRESENTERES, utledet av om det faktisk gir tilgang.
 *
 * Prisesiden pleide å lese `tier` rett fra billing_subscriptions-raden. En rad
 * med status 'canceled', 'past_due', 'unpaid' eller 'incomplete_expired' har
 * fortsatt tier 'premium', så kunden fikk «Premium — Aktiv plan» og gullmerke
 * for en plan hen ikke lenger hadde — og kjøpsknappen for den planen ble
 * skjult, så det fantes ingen vei tilbake.
 *
 * Fasiten er `capabilities.paid` fra getBillingCapabilities (som igjen er
 * hasPaidAccess): samme kilde som API-rutene bruker til å slippe folk inn på
 * betalte funksjoner. Rendrer vi noe annet enn den, lyver flaten om tilgangen.
 *
 * Env-fri og ren, slik at både serverruter og klientkomponenter kan bruke den.
 */
export interface PlanCapabilities {
  tier: BillingTier;
  /** Rå status fra billing_subscriptions; `string` fordi API-svaret er utypet. */
  status: BillingStatus | string;
  paid: boolean;
}

export interface PlanViewState {
  /** Planen kunden faktisk har tilgang til nå. 'free' når ingenting er betalt. */
  activeTier: BillingTier;
  /** Betalt plan som ikke lenger gir tilgang — ellers null. */
  lapsedTier: Exclude<BillingTier, 'free'> | null;
  /** Sant når raden peker på en betalt plan uten tilgang (utløpt/ikke betalt). */
  lapsed: boolean;
  /** Betalingen mangler eller feilet — kundeportalen er korteste vei tilbake. */
  needsPayment: boolean;
}

/**
 * Statusene der Stripe fortsatt har et abonnement, men betalingen ikke gikk
 * gjennom. Da er «oppdater kortet» den riktige veien tilbake — et nytt kjøp
 * ville lagt et abonnement nummer to oppå det som allerede finnes.
 * Kjøpsknappen vises likevel, den skal aldri være borte.
 */
const PAYMENT_PROBLEM_STATUSES: ReadonlySet<string> = new Set(['past_due', 'unpaid', 'incomplete']);

export function getPlanViewState(capabilities: PlanCapabilities | null | undefined): PlanViewState {
  const tier = capabilities?.tier ?? 'free';
  const paid = capabilities?.paid === true;

  // Betalt OG en betalt plan: dette er den eneste tilstanden som får vise
  // «Aktiv plan». `isPaidTier` er et belte-og-bukseseler-krav — paid uten
  // betalt tier skal ikke kunne oppstå, men skal uansett ikke gi gullmerke.
  if (paid && isPaidTier(tier)) {
    return { activeTier: tier, lapsedTier: null, lapsed: false, needsPayment: false };
  }

  if (isPaidTier(tier)) {
    return {
      activeTier: 'free',
      lapsedTier: tier,
      lapsed: true,
      needsPayment: PAYMENT_PROBLEM_STATUSES.has(capabilities?.status ?? '')
    };
  }

  return { activeTier: 'free', lapsedTier: null, lapsed: false, needsPayment: false };
}

/**
 * Eneste sted som avgjør om kjøpsknappen for en plan skal vises.
 * Regelen er «alt som ikke er den planen du faktisk har tilgang til nå» —
 * derfor kan et utløpt abonnement aldri skjule sin egen kjøpsknapp.
 */
export function canPurchasePlan(view: PlanViewState, planId: BillingTier): boolean {
  if (!isPaidTier(planId)) return false;
  return view.activeTier !== planId;
}
