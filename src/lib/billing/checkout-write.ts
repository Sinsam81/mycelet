import type { BillingTier } from './plans';

/**
 * Hva /api/billing/checkout skal skrive til billing_subscriptions når en
 * checkout STARTES — altså før brukeren har betalt noe.
 *
 * Dette er skilt ut fra rutehandleren fordi regelen er verdt å teste alene:
 * den handlet tidligere om at en betalende kunde mistet tilgangen sin.
 *
 * Feilen: ruta skrev `tier` + `status: 'incomplete'` ubetinget. En kunde med
 * aktiv Premium som trykket «Sesongpass» fikk den aktive raden overskrevet i
 * samme øyeblikk som Stripe-vinduet åpnet seg. hasPaidAccess() krever
 * active/trialing, så premium forsvant på flekken — og avbrøt de kjøpet i
 * Stripe, kom det aldri tilbake, mens det gamle abonnementet fortsatte å
 * belastes.
 *
 * Regelen: å starte en betaling skal aldri forringe en plan noen allerede har
 * betalt for. Bare webhooken, som vet om det kom penger, får endre tier og
 * status.
 */

export interface CheckoutWriteInput {
  /** Har brukeren allerede en aktiv betalt plan? */
  hasPaidPlan: boolean;
  userId: string;
  plan: Exclude<BillingTier, 'free'>;
  customerId: string;
  priceId: string;
  sessionId: string;
}

/** Oppdater kun kundekoblingen — brukeren har en betalt plan vi ikke får røre. */
export interface LinkCustomerOnly {
  kind: 'link-customer-only';
  userId: string;
  values: { stripe_customer_id: string };
}

/** Ingen betalt plan fra før: skriv plassholderraden som vanlig. */
export interface PlaceholderRow {
  kind: 'placeholder-row';
  values: {
    user_id: string;
    tier: Exclude<BillingTier, 'free'>;
    status: 'incomplete';
    stripe_customer_id: string;
    stripe_price_id: string;
    metadata: { checkout_session_id: string };
  };
}

export type CheckoutWrite = LinkCustomerOnly | PlaceholderRow;

export function planCheckoutWrite(input: CheckoutWriteInput): CheckoutWrite {
  if (input.hasPaidPlan) {
    // Merk hva som IKKE er med: tier, status og metadata.
    //
    // tier/status eies av webhooken. metadata bærer `provider`-flagget som
    // skiller Stripe-abonnement fra RevenueCat-abonnement; skrev vi over det
    // her, ville vernet mot at en Stripe-hendelse overkjører et aktivt
    // Apple-abonnement falt bort.
    //
    // Den påbegynte økten trenger vi ikke lagre: Stripe-sesjonen bærer selv
    // user_id og tier i sin egen metadata, og webhooken leser dem derfra.
    return {
      kind: 'link-customer-only',
      userId: input.userId,
      values: { stripe_customer_id: input.customerId }
    };
  }

  return {
    kind: 'placeholder-row',
    values: {
      user_id: input.userId,
      tier: input.plan,
      status: 'incomplete',
      stripe_customer_id: input.customerId,
      stripe_price_id: input.priceId,
      metadata: { checkout_session_id: input.sessionId }
    }
  };
}
