import Stripe from 'stripe';

/**
 * Fristen for ETT kall til Stripes API, for alle som får klienten herfra.
 *
 * SDK-ens standard er 80 s per forsøk og ett nytt forsøk — nesten tre
 * minutter for et kall som normalt tar et halvt sekund. Fristene sto først
 * bare på enkeltkall (Stripe-webhooken, statusruta), og da gjensto alle de
 * andre med standarden: checkout og kundeportalen, der kunden står og ser på
 * en spinner, og oppsigelsen i /api/me/delete, der kontosletting ble
 * hengende. Satt HER gjelder fristen hvert kall, også det neste noen legger
 * til.
 *
 * Ett nytt forsøk beholdes (det er også SDK-ens standard): et brutt oppkall
 * er vanligere enn et tregt svar. Verste fall for ett kall er dermed rundt
 * 20 s, og går fristen ut, kaster SDK-en — som enhver annen Stripe-feil, og
 * hvert kallsted håndterer den allerede. Skrivekallene tåler forsøket som
 * før: checkout sender sine egne idempotensnøkler, SDK-en lager en for andre
 * POST-kall når nytt forsøk er på, og avslutt-ved-sletting.ts regner
 * «finnes ikke» og «allerede oppsagt» som utført.
 *
 * Et kallsted kan fortsatt sende strammere valg per kall. Oppslaget «har
 * e-posten hatt et abonnement før?» gjør det (tidligere-abonnent.ts: 4 s,
 * ingen nye forsøk, 5 s samlet). Stripe-webhooken sender de samme tallene
 * som her per kall (STRIPE_KALL), så de står ved kallene de gjelder.
 */
export const STRIPE_KLIENT_FRIST = { timeout: 10_000, maxNetworkRetries: 1 } as const;

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY mangler');
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    ...STRIPE_KLIENT_FRIST
  });

  return stripeClient;
}
