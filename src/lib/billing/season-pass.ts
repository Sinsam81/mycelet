/**
 * Hvor lenge varer et Sesongpass som er kjøpt som ENGANGSBELØP?
 *
 * I dag kan det ikke skje: /api/billing/checkout setter alltid mode
 * 'subscription', og begge live-prisene er `recurring`. Men grenen for
 * `session.mode === 'payment'` finnes i Stripe-webhooken, og den regnet
 * tidligere ut «30. november inneværende år». Det ga to uforenlige
 * definisjoner av et sesongpass i samme kodebase: 30. november her, og
 * «ett beløp i året … fornyes årlig» på prissiden og i kjøpsvilkårene.
 *
 * Kjøpte noen 1. oktober, ville de fått to måneder for 249 kr.
 *
 * Fasiten er det kunden får lovet: tolv måneder fra kjøpsdatoen.
 */
export function seasonPassEndDateIso(purchasedAt: Date = new Date()): string {
  const end = new Date(purchasedAt.getTime());
  // setUTCFullYear håndterer skuddår selv: 29. februar + 1 år blir 1. mars.
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end.toISOString();
}
