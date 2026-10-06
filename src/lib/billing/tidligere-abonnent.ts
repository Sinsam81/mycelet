import type { BillingSubscription } from './subscription';

/**
 * Har denne kunden hatt tilgangen før — og får derfor ingen ny gratisuke?
 *
 * Tre kilder, i den rekkefølgen de er billigst: raden i billing_subscriptions
 * har pekt på et Stripe-abonnement, raden er eid av en IAP-leverandør
 * (metadata.provider), eller e-posten har hatt et Stripe-abonnement under en
 * SLETTET konto (raden forsvinner med cascaden, men Stripe husker kunden).
 *
 * Dette var checkout-rutas private regel. Arket, forsidekortet og headeren
 * spurte i stedet «finnes det en rad?» — så en som slettet kontoen etter en
 * betalt sesong og registrerte seg på nytt med samme e-post fikk «Prøv
 * Sesongpass gratis i 7 dager» på tre flater og et Stripe-skjema som trakk
 * 249 kr samme dag. Nå svarer /api/billing/status (kanFaaProve) og forsiden
 * fra samme funksjon som checkout, så ingen flate lover en uke butikken nekter.
 *
 * Stripe-oppslaget er best effort, som i checkout: feiler det, får kunden
 * prøven (som før) heller enn at flaten eller kjøpet stopper.
 */

/** Undersettet av Stripe-klienten oppslaget bruker — så det kan testes uten nettverk. */
export interface StripeKundeoppslag {
  customers: { list: (p: { email: string; limit: number }) => Promise<{ data: Array<{ id: string }> }> };
  subscriptions: { list: (p: { customer: string; status: 'all'; limit: number }) => Promise<{ data: unknown[] }> };
}

/** Raden selv sier det: har pekt på et Stripe-abonnement, eller eies av App Store/RevenueCat. */
export function harHattTilgangIRaden(subscription: Pick<BillingSubscription, 'stripe_subscription_id' | 'metadata'> | null | undefined): boolean {
  return Boolean(subscription?.stripe_subscription_id || subscription?.metadata?.provider);
}

export async function harHattStripeAbonnementFor(stripe: StripeKundeoppslag, email: string): Promise<boolean> {
  try {
    const kunder = await stripe.customers.list({ email, limit: 5 });
    for (const kunde of kunder.data) {
      const abonnement = await stripe.subscriptions.list({ customer: kunde.id, status: 'all', limit: 1 });
      if (abonnement.data.length > 0) return true;
    }
  } catch {
    // stille: prøven er default
  }
  return false;
}

/**
 * @param stripe lages først når raden ikke allerede har svart — og kaster den
 *   (STRIPE_SECRET_KEY mangler), teller det som «ikke hatt», som i checkout
 *   der oppslaget selv er best effort.
 */
export async function harHattTilgangFor(args: {
  subscription: Pick<BillingSubscription, 'stripe_subscription_id' | 'metadata'> | null | undefined;
  email: string | null | undefined;
  stripe: () => StripeKundeoppslag;
}): Promise<boolean> {
  if (harHattTilgangIRaden(args.subscription)) return true;
  if (!args.email) return false;
  let stripe: StripeKundeoppslag;
  try {
    stripe = args.stripe();
  } catch {
    return false;
  }
  return harHattStripeAbonnementFor(stripe, args.email);
}
