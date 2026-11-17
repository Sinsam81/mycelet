import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BILLING_PLANS } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { harHattTilgangFor } from '@/lib/billing/tidligere-abonnent';
import { getStripeServerClient } from '@/lib/stripe/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { logger } from '@/lib/log';
import { billingCopy } from '@/lib/billing/copy';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

// Called frequently from the client to render subscription state — logging
// every successful call would just be noise. We log only failures.

/**
 * Taket for hele kallet. Ruta leses av headeren, forsidekortet, arket og
 * prissiden; et normalt svar tar noen hundre millisekunder. Samme tak som de
 * andre korte lese- og skriverutene (places, findings, spot-feedback).
 */
export const maxDuration = 15;

/**
 * Teksten prissiden viser når statusen ikke lot seg hente. Generert på
 * serveren, så next-intl dekker den ikke — den sto på norsk også for svenske
 * brukere. Samme ordlyd som katalogens `Pricing.errorLoadStatus`.
 */
const STATUS_FEILET: Record<Locale, string> = {
  nb: 'Kunne ikke hente abonnementsstatus',
  sv: 'Kunde inte hämta prenumerationsstatus'
};

async function hentSprak(): Promise<Locale> {
  try {
    return await getUserLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      // Samme tekst og språk som checkout og portalen (src/lib/billing/copy.ts).
      return NextResponse.json({ error: billingCopy('unauthenticated', await hentSprak()) }, { status: 401 });
    }

    // Read endpoint, called from layouts/headers — generous limit so normal
    // page-rendering loops don't trip it. Catches runaway client polling.
    const rateLimit = checkRateLimit(`billing-status:${getClientKey(request, user.id)}`, 120, 60);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const capabilities = getBillingCapabilities(subscription);

    // Får kunden gratisuka? Én fasit, den samme som checkout bruker når den
    // avgjør trial_period_days (harHattTilgangFor i tidligere-abonnent.ts).
    // Headeren, kartarket og prissiden leser svaret herfra
    // (kanFaaProveperiode); flatene leste før «finnes det en rad?» og lovet
    // uka til en som hadde slettet kontoen etter en betalt sesong. Betalende
    // spør vi ikke om — de kan ikke løse inn noe, og Stripe slipper et
    // oppslag per sidevisning.
    //
    // Fristen for Stripe-oppslaget (4 s per kall, 5 s samlet) ligger i
    // tidligere-abonnent.ts, ikke her: denne ruta og checkout kaller samme
    // funksjon, venter like lenge og svarer likt når Stripe er tregt. Går
    // taket ut, er svaret det samme som når Stripe feiler — prøven som
    // standard, slik checkout også gir den — i stedet for at headeren, arket
    // og prissiden henger for alle som ikke betaler. Herfra kommer bare
    // logglinja. (Det er to oppslag til hver sin tid: et Stripe som svarer på
    // det ene og ikke det andre, kan fortsatt gi to svar — se
    // tidligere-abonnent.ts.)
    //
    // Forsidens innhold (startarket og Premium-kortet) gjør IKKE dette
    // oppslaget. Det bruker visningsvarianten provesvarForVisning
    // (tidligere-abonnent-visning.ts): samme regel, men kortere frist (2,5 s),
    // og et svar som ikke kom i tide eller feilet er «ukjent» — da lover
    // forsiden ingenting i stedet for å gjette på prøven. En treg Stripe-dag
    // kan derfor gi nøytral knapp og intet ark på forsiden mens headeren over
    // den, som leser denne ruta, sier «Prøv gratis». Det er bevisst: forsiden
    // avgjør ingenting, og «ukjent» kan aldri love en uke checkout nekter.
    const kanFaaProve =
      !capabilities.paid &&
      !(await harHattTilgangFor({
        subscription,
        email: user.email,
        stripe: getStripeServerClient,
        vedFrist: (fristMs) => logger.warn('billing.status.stripe_lookup_timeout', { route: '/api/billing/status', userId: user.id, fristMs })
      }));

    return NextResponse.json({
      subscription,
      capabilities,
      kanFaaProve,
      plans: BILLING_PLANS
    });
  } catch (error) {
    logger.error('billing.status.failed', error, { route: '/api/billing/status' });
    // Ingen `details`: unntaksteksten gikk før rett til nettleseren, og
    // prissiden viser `error` til kunden. Den hører hjemme i loggen over.
    const locale = await hentSprak();
    return NextResponse.json({ error: STATUS_FEILET[locale] ?? STATUS_FEILET[DEFAULT_LOCALE] }, { status: 500 });
  }
}
