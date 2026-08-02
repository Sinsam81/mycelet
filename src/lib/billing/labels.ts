import type { BillingStatus, BillingTier } from './plans';

/**
 * Menneskelige navn på abonnementsnivå og -status, ett sted.
 *
 * Prissiden hadde disse tabellene inne i komponenten, mens profilsiden skrev ut
 * råverdien fra databasen. Resultatet var at samme abonnement het «Sesongpass ·
 * Aktiv» på den ene siden og «Season pass · active» på den andre — og at
 * `past_due`, altså «kortet ditt gikk ikke gjennom», møtte brukeren som teknisk
 * engelsk snake_case begge steder på profilen.
 *
 * Nøklene ligger i `Pricing`-seksjonen i messages/{nb,sv}.json. Modulen holder
 * bare nøkkelnavnene, ikke teksten, så den kan brukes fra både klient
 * (useTranslations) og server (getTranslations).
 */

type Translator = (key: string) => string;

export const TIER_LABEL_KEYS: Record<BillingTier, string> = {
  free: 'tierFree',
  premium: 'tierPremium',
  season_pass: 'tierSeasonPass'
};

export const STATUS_LABEL_KEYS: Record<BillingStatus, string> = {
  active: 'statusActive',
  trialing: 'statusTrialing',
  past_due: 'statusPastDue',
  canceled: 'statusCanceled',
  unpaid: 'statusUnpaid',
  incomplete: 'statusIncomplete',
  incomplete_expired: 'statusIncompleteExpired',
  inactive: 'statusInactive'
};

/**
 * Ukjent verdi faller tilbake på råverdien i stedet for å kaste. Stripe kan
 * finne på å innføre en ny status; da skal profilsiden vise noe stygt, ikke
 * krasje for en betalende kunde.
 */
function lookup(keys: Record<string, string>, value: string | null | undefined, t: Translator): string {
  if (!value) return '';
  const key = keys[value];
  return key ? t(key) : value;
}

export function tierLabel(tier: BillingTier | string | null | undefined, t: Translator): string {
  return lookup(TIER_LABEL_KEYS, tier, t);
}

export function statusLabel(status: BillingStatus | string | null | undefined, t: Translator): string {
  return lookup(STATUS_LABEL_KEYS, status, t);
}
