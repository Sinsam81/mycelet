import type { IapPlan } from './plans';

/**
 * Hvilken pris er det egentlig som står på prissiden?
 *
 * I den native appen kjøper kunden via App Store, og priskortet viser Apples
 * lokaliserte pris (`IapOffer.priceString`). Den kan avvike fra Stripe-prisen:
 * docs/app-store-metadata.md sier «velg nærmeste prispunkt» for både 79 og 249
 * NOK, og en svensk App Store-konto får prisen i SEK.
 *
 * Teksten RUNDT kortet kom fra BILLING_PLANS (Stripe-tallene): «Tilsvarer 21
 * kr/mnd» i punktlisten, «ett beløp i året (249 kr)» i FAQ-en og «Prisene er i
 * norske kroner» under kortene. Resultatet var opptil tre forskjellige priser
 * på samme skjerm — noe App Review kan avvise en kjøpsflate for.
 *
 * Reglene her avgjør når den prisuavhengige teksten skal brukes i stedet.
 */

export interface StorePricingInput {
  /** Kjører vi i det native skallet? */
  native: boolean;
  /** Tilbudene RevenueCat faktisk ga oss. Null = ikke lastet ennå. */
  offers: ReadonlyArray<{ plan: IapPlan }> | null | undefined;
}

/** Vises butikkens priser noe sted på siden? Da er «norske kroner» feil. */
export function showsStorePrices({ native, offers }: StorePricingInput): boolean {
  return native && (offers?.length ?? 0) > 0;
}

/** Har SESONGPASSET en butikkpris? Da kan teksten under kortet ikke si 249 kr. */
export function seasonPriceComesFromStore({ native, offers }: StorePricingInput): boolean {
  if (!native) return false;
  return (offers ?? []).some((offer) => offer.plan === 'season_pass');
}
