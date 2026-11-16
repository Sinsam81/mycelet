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
 *
 * ── FRISTEN ER EN DEL AV REGELEN ───────────────────────────────────────────
 *
 * Oppslaget kjøres for HVER gratisbruker: av /api/billing/status på hver
 * sidevisning som trenger planstatusen, av forsiden mens den rendres på
 * serveren, og av checkout mens kunden venter på betalingssiden. Stripe-SDK-en
 * venter som standard 80 s per kall, med ett nytt forsøk, så én treg dag hos
 * Stripe holdt alt dette hengende — for et svar som bare avgjør om teksten
 * skal nevne gratisuka.
 *
 * Fristen sto først bare i statusruta. Da svarte den etter 5 s («får prøven»),
 * mens checkout ventet på det ekte svaret, fant det gamle abonnementet og
 * lot Stripe trekke samme dag — nøyaktig den uenigheten denne fila ble til
 * for å fjerne. Derfor ligger fristen HER, i den ene funksjonen alle tre
 * kaller: hvert kall får `STRIPE_OPPSLAG_KALL`, hele oppslaget (inntil seks
 * kall etter hverandre) får `STRIPE_OPPSLAG_FRIST_MS`, og går taket ut, er
 * svaret det samme som når Stripe feiler: «ikke hatt tilgang før», altså
 * prøven. En treg dag gir da samme svar på flatene og i kjøpet.
 *
 * Det som står igjen: flatene og kjøpet gjør hvert sitt oppslag, til hver sin
 * tid. Svarer Stripe for sent på det ene og i tide på det andre, kan de
 * fortsatt være uenige. Stripes egen betalingsside viser hva som trekkes i
 * dag, før kunden bekrefter.
 */

/** De to feltene oppslaget setter per kall. Stripes `RequestOptions` har de samme. */
export interface StripeKallValg {
  timeout?: number;
  maxNetworkRetries?: number;
}

/** Undersettet av Stripe-klienten oppslaget bruker — så det kan testes uten nettverk. */
export interface StripeKundeoppslag {
  customers: {
    list: (p: { email: string; limit: number }, valg?: StripeKallValg) => Promise<{ data: Array<{ id: string }> }>;
  };
  subscriptions: {
    list: (p: { customer: string; status: 'all'; limit: number }, valg?: StripeKallValg) => Promise<{ data: unknown[] }>;
  };
}

/**
 * Fristen for hvert kall oppslaget gjør. Uten nytt forsøk: det ville doblet
 * ventetiden, og svaret på «ingen svar» er allerede bestemt (prøven).
 * Strammere enn klientens egen standard i src/lib/stripe/server.ts.
 */
export const STRIPE_OPPSLAG_KALL = { timeout: 4_000, maxNetworkRetries: 0 } as const satisfies StripeKallValg;

/** Taket for hele oppslaget, uansett hvor mange kall det ble. */
export const STRIPE_OPPSLAG_FRIST_MS = 5_000;

/** Raden selv sier det: har pekt på et Stripe-abonnement, eller eies av App Store/RevenueCat. */
export function harHattTilgangIRaden(subscription: Pick<BillingSubscription, 'stripe_subscription_id' | 'metadata'> | null | undefined): boolean {
  return Boolean(subscription?.stripe_subscription_id || subscription?.metadata?.provider);
}

/**
 * @param avbrutt spørres før hvert kall etter det første. Når taket i
 *   `harHattTilgangFor` er ute, er svaret alt gitt — da skal ikke en treg
 *   Stripe få flere spørsmål ingen venter på svaret til.
 */
export async function harHattStripeAbonnementFor(stripe: StripeKundeoppslag, email: string, avbrutt: () => boolean = () => false): Promise<boolean> {
  try {
    const kunder = await stripe.customers.list({ email, limit: 5 }, STRIPE_OPPSLAG_KALL);
    for (const kunde of kunder.data) {
      if (avbrutt()) return false;
      const abonnement = await stripe.subscriptions.list({ customer: kunde.id, status: 'all', limit: 1 }, STRIPE_OPPSLAG_KALL);
      if (abonnement.data.length > 0) return true;
    }
  } catch {
    // stille: prøven er default
  }
  return false;
}

/**
 * Den ene inngangen: raden først, så Stripe — innen fristen.
 *
 * @param stripe lages først når raden ikke allerede har svart — og kaster den
 *   (STRIPE_SECRET_KEY mangler), teller det som «ikke hatt», som i checkout
 *   der oppslaget selv er best effort.
 * @param vedFrist kalles når taket gikk ut før Stripe hadde svart, så
 *   kallstedet kan logge det under sitt eget navn. Svaret er da `false`.
 */
export async function harHattTilgangFor(args: {
  subscription: Pick<BillingSubscription, 'stripe_subscription_id' | 'metadata'> | null | undefined;
  email: string | null | undefined;
  stripe: () => StripeKundeoppslag;
  vedFrist?: (fristMs: number) => void;
}): Promise<boolean> {
  if (harHattTilgangIRaden(args.subscription)) return true;
  if (!args.email) return false;
  let stripe: StripeKundeoppslag;
  try {
    stripe = args.stripe();
  } catch {
    return false;
  }

  let fristUte = false;
  let tidtaker: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<'frist'>((resolve) => {
    tidtaker = setTimeout(() => {
      fristUte = true;
      resolve('frist');
    }, STRIPE_OPPSLAG_FRIST_MS);
  });
  try {
    const svar = await Promise.race([harHattStripeAbonnementFor(stripe, args.email, () => fristUte), frist]);
    if (svar === 'frist') {
      args.vedFrist?.(STRIPE_OPPSLAG_FRIST_MS);
      return false;
    }
    return svar;
  } finally {
    clearTimeout(tidtaker);
  }
}
