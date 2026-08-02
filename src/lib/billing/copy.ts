import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import type { BillingTier } from './plans';

/**
 * Tekstene /api/billing/checkout og /api/billing/portal sender til kunden.
 *
 * To feil de retter opp:
 *
 * 1. Språk. Svarene er generert på serveren, og next-intl dekker derfor ikke
 *    disse — samme felle som prediksjonstekstene og rate-limit-meldingen gikk
 *    i. En svensk kunde som prøvde å bytte plan fikk 130 ord norsk instruksjon
 *    midt i kjøpsflyten. Mønsteret er hentet fra src/lib/rate-limit/route.ts.
 *
 * 2. Lekkasje. Rutene sendte tidligere den rå unntaksteksten fra Stripe og
 *    navnet på miljøvariabelen som manglet (`Mangler env: STRIPE_PRICE_…`)
 *    rett til nettleseren, og prissiden viste den. Slikt hører hjemme i
 *    loggen. Kunden skal ha en tekst hen kan gjøre noe med.
 */

export type BillingMessageKey =
  | 'unauthenticated'
  | 'invalidPlan'
  | 'missingConsent'
  | 'checkoutUnavailable'
  | 'checkoutFailed'
  | 'saveFailed'
  | 'planChangeBlocked'
  | 'planChangeBlockedDetails'
  | 'portalNoCustomer'
  | 'portalFailed';

const COPY: Record<BillingMessageKey, Record<Locale, string>> = {
  unauthenticated: {
    nb: 'Ikke autentisert',
    sv: 'Inte autentiserad'
  },
  invalidPlan: {
    nb: 'Ugyldig plan',
    sv: 'Ogiltig plan'
  },
  missingConsent: {
    nb: 'Du må bekrefte kjøpsvilkårene før du kan fortsette',
    sv: 'Du måste godkänna köpvillkoren innan du kan fortsätta'
  },
  // Feilkonfigurasjon hos oss (manglende pris-ID i miljøet). Kunden kan ikke
  // gjøre noe med den, og navnet på variabelen er vår sak — ikke deres.
  checkoutUnavailable: {
    nb: 'Kjøp er midlertidig utilgjengelig. Prøv igjen senere.',
    sv: 'Köp är tillfälligt otillgängligt. Försök igen senare.'
  },
  checkoutFailed: {
    nb: 'Vi fikk ikke startet betalingen. Prøv igjen om litt.',
    sv: 'Vi kunde inte starta betalningen. Försök igen om en stund.'
  },
  saveFailed: {
    nb: 'Vi fikk ikke lagret abonnementet. Prøv igjen om litt.',
    sv: 'Vi kunde inte spara prenumerationen. Försök igen om en stund.'
  },
  planChangeBlocked: {
    nb: 'Du må avslutte den nåværende planen først',
    sv: 'Du måste avsluta den nuvarande planen först'
  },
  planChangeBlockedDetails: {
    nb: 'Du har allerede et aktivt abonnement. Vi kan ikke sette i gang et nytt før det er avsluttet, fordi du da ville blitt belastet for begge. Avslutt abonnementet under kontoinnstillinger — du beholder tilgangen ut perioden du har betalt for — og kjøp den nye planen etterpå.',
    sv: 'Du har redan en aktiv prenumeration. Vi kan inte starta en ny innan den är avslutad, eftersom du då skulle debiteras för båda. Avsluta prenumerationen under kontoinställningar — du behåller åtkomsten perioden ut som du redan har betalat för — och köp den nya planen efteråt.'
  },
  portalNoCustomer: {
    nb: 'Vi fant ingen aktiv betalingskonto å administrere.',
    sv: 'Vi hittade inget aktivt betalkonto att hantera.'
  },
  portalFailed: {
    nb: 'Vi fikk ikke åpnet kundesiden. Prøv igjen om litt.',
    sv: 'Vi kunde inte öppna kundsidan. Försök igen om en stund.'
  }
};

/** Plannavnene slik kunden ser dem. «Sesongpass» heter «Säsongspass» på svensk. */
const TIER_LABELS: Record<Exclude<BillingTier, 'free'>, Record<Locale, string>> = {
  premium: { nb: 'Premium', sv: 'Premium' },
  season_pass: { nb: 'Sesongpass', sv: 'Säsongspass' }
};

export function billingCopy(key: BillingMessageKey, locale: Locale): string {
  return COPY[key][locale] ?? COPY[key][DEFAULT_LOCALE];
}

export function billingTierLabel(tier: Exclude<BillingTier, 'free'>, locale: Locale): string {
  return TIER_LABELS[tier][locale] ?? TIER_LABELS[tier][DEFAULT_LOCALE];
}

/** «Du har allerede aktiv Sesongpass-plan.» — trenger både språk og plannavn. */
export function alreadyOnPlanMessage(tier: Exclude<BillingTier, 'free'>, locale: Locale): string {
  const label = billingTierLabel(tier, locale);
  return locale === 'sv'
    ? `Du har redan en aktiv ${label}-plan.`
    : `Du har allerede aktiv ${label}-plan.`;
}
