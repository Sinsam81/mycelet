/**
 * Si opp et løpende Stripe-abonnement FØR kontoen slettes.
 *
 * Sletteruta fjernet auth-brukeren, cascaden tok billing_subscriptions-raden
 * — og Stripe fikk aldri vite noe. Abonnementet fakturerte videre til en
 * kunde som verken kunne logge inn eller nå kundeportalen (den krever både
 * innlogging og en rad med stripe_customer_id). Webhooken feilet deretter
 * med FK-brudd ved hver fornyelse, i tre døgn, uten at noen så det.
 *
 * Regelen: finnes det et Stripe-abonnement på raden, sies det opp med én
 * gang (cancel, ikke cancel_at_period_end — det er ingen konto igjen å
 * beholde tilgangen for). Feiler Stripe, stopper slettingen: steget ligger
 * før auth-slettingen, så et nytt forsøk er trygt. «Allerede oppsagt» og
 * «finnes ikke» hos Stripe regnes som suksess — målet er at ingen belastes,
 * ikke at kallet lykkes.
 *
 * Stripe-KUNDEN slettes ikke: personvernerklæringen lover fem års
 * betalingshistorikk (bokføringsloven), og den bor der.
 */

interface StripeLikeError {
  code?: string;
  statusCode?: number;
  message?: string;
}

export interface AvsluttResultat {
  ok: boolean;
  /** true bare når et abonnement faktisk ble sagt opp i dette kallet. */
  avsluttet: boolean;
  detalj?: string;
}

export async function avsluttStripeVedSletting(args: {
  admin: { from: (table: string) => any };
  /** Lazy: Stripe-klienten kaster uten STRIPE_SECRET_KEY, og trengs bare når det finnes et abonnement. */
  stripe: () => { subscriptions: { cancel: (id: string) => Promise<unknown> } };
  userId: string;
  log: { info: (m: string, d?: Record<string, unknown>) => void; warn: (m: string, d?: Record<string, unknown>) => void };
}): Promise<AvsluttResultat> {
  const { data, error } = await args.admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id,status')
    .eq('user_id', args.userId);
  if (error) return { ok: false, avsluttet: false, detalj: `kunne ikke lese abonnement: ${error.message}` };

  const rad = (Array.isArray(data) ? data[0] : data) as { stripe_subscription_id?: string | null; status?: string } | undefined;
  const subId = rad?.stripe_subscription_id;
  if (!subId) return { ok: true, avsluttet: false };
  if (rad?.status === 'canceled') return { ok: true, avsluttet: false };

  try {
    await args.stripe().subscriptions.cancel(subId);
    args.log.info('account.self_delete.stripe_canceled', { subscriptionId: subId });
    return { ok: true, avsluttet: true };
  } catch (e) {
    const feil = e as StripeLikeError;
    // Borte hos Stripe, eller allerede oppsagt: ingen belastes — det er det som teller.
    if (feil.code === 'resource_missing' || feil.statusCode === 404) {
      args.log.warn('account.self_delete.stripe_subscription_missing', { subscriptionId: subId });
      return { ok: true, avsluttet: false };
    }
    if (typeof feil.message === 'string' && /already canceled|No such subscription/i.test(feil.message)) {
      return { ok: true, avsluttet: false };
    }
    return { ok: false, avsluttet: false, detalj: feil.message ?? 'ukjent Stripe-feil' };
  }
}
