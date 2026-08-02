import type { BillingTier } from './plans';

/**
 * Kan vi sende kunden tilbake til en Checkout-sesjon som allerede står åpen?
 *
 * Feilen dette demper: idempotensnøkkelen i /api/billing/checkout er et
 * fem-minutters klokkevindu (`checkout_<user>_<plan>_<nå/5min>`). Klikker
 * kunden «Kjøp», lar fanen stå og klikker igjen etter seks minutter, lager
 * Stripe en NY betalbar sesjon. Betaler de begge, får de to abonnement på
 * samme kunde — men bare én rad hos oss, så appen viser bare det ene.
 *
 * Løsningen er ikke å sperre nye kjøp (en kunde som ombestemte seg og kommer
 * tilbake skal få kjøpe), men å gjenbruke sesjonen som allerede finnes.
 *
 * Reglene er strenge med vilje. Alt som ikke stemmer nøyaktig gir null, og
 * ruta lager en ny sesjon som før — å sende kunden til FEIL betalingsside er
 * verre enn å lage én sesjon for mye.
 */

export interface CheckoutSessionLike {
  id?: string | null;
  /** 'open' | 'complete' | 'expired' */
  status?: string | null;
  mode?: string | null;
  url?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
}

export interface CheckoutReuseRequest {
  userId: string;
  plan: Exclude<BillingTier, 'free'>;
  priceId: string;
  /** Versjonen av angrerettsteksten kunden nettopp huket av for. */
  consentVersion: string;
}

export function reusableCheckoutUrl(
  session: CheckoutSessionLike | null | undefined,
  request: CheckoutReuseRequest
): string | null {
  if (!session) return null;
  // Kun sesjoner kunden fortsatt kan betale. 'complete' og 'expired' har
  // dessuten url = null.
  if (session.status !== 'open') return null;
  if (session.mode !== 'subscription') return null;
  if (typeof session.url !== 'string' || session.url.length === 0) return null;

  const metadata = session.metadata ?? {};
  if (metadata.user_id !== request.userId) return null;
  if (metadata.tier !== request.plan) return null;
  if (metadata.price_id !== request.priceId) return null;
  // Samtykket ligger på sesjonen. Er teksten endret siden, skal kjøpet gjøres
  // på nytt med den versjonen kunden faktisk fikk se.
  if (metadata.delivery_consent_version !== request.consentVersion) return null;

  return session.url;
}
