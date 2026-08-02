/**
 * Hvor ligger abonnementsperioden i en Stripe-payload?
 *
 * Feilen dette løser: webhooken leste `subscription.current_period_end` direkte.
 * Stripe flyttet `current_period_start`/`current_period_end` fra
 * abonnementsobjektet ned på hvert linjeelement (`items.data[i]`) i
 * Basil-generasjonen av API-et. Kontoen vår står i dag på `2026-05-27.dahlia`,
 * og webhook-endepunktet er ikke pinnet (`api_version: null`) — da rendrer
 * Stripe leveransen i kontoens standardversjon, ikke i versjonen SDK-en er
 * pinnet til (`2024-06-20`, src/lib/stripe/server.ts). Feltene på topnivå er
 * altså borte i det webhooken faktisk får, mens TypeScript-typene fra
 * stripe@16 fortsatt lover at de finnes.
 *
 * Resultatet var `new Date(undefined * 1000)`-grenen i toIso() → null, skrevet
 * ubemerket til `billing_subscriptions.current_period_end`. Og
 * hasPaidAccess() (plans.ts) leser null som «ingen utløpsdato» = evig tilgang.
 *
 * Derfor tar denne funksjonen `unknown` og ikke `Stripe.Subscription`: hele
 * poenget er at typene lyver om formen. Vi leser strukturen slik den faktisk
 * kommer over ledningen, og sier fra hvor vi fant den.
 */

/** Hvor periodedatoene ble funnet — brukes til logging, ikke til logikk. */
export type SubscriptionPeriodSource =
  /** Topnivå på abonnementet (2024-06-20 og eldre). */
  | 'subscription'
  /** På linjeelementet (Basil/dahlia og nyere). */
  | 'items'
  /** Ingen av stedene — ukjent periode. */
  | 'missing';

export interface SubscriptionPeriod {
  /** ISO-8601, eller null hvis vi ikke fant en startdato. */
  start: string | null;
  /** ISO-8601, eller null hvis vi ikke fant en sluttdato. */
  end: string | null;
  source: SubscriptionPeriodSource;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Stripe oppgir tidspunkter som unix-sekunder. Vi godtar bare et endelig,
 * positivt tall — null, undefined, 0 og strenger er alle «ikke en dato».
 */
function readUnixSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function toIso(unixSeconds: number | null): string | null {
  if (unixSeconds === null) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Finn abonnementsperioden uansett hvilken API-versjon payloaden er rendret i.
 *
 * Rekkefølge: topnivå først (gammel form), deretter første linjeelement som
 * har en sluttdato (ny form). Vi krever `current_period_end` for å godta en
 * kilde — det er feltet tilgangen avhenger av; en startdato alene sier
 * ingenting om når tilgangen tar slutt.
 */
export function resolveSubscriptionPeriod(subscription: unknown): SubscriptionPeriod {
  const sub = asRecord(subscription);
  const topLevelStart = readUnixSeconds(sub?.current_period_start);
  const topLevelEnd = readUnixSeconds(sub?.current_period_end);

  if (topLevelEnd !== null) {
    return { start: toIso(topLevelStart), end: toIso(topLevelEnd), source: 'subscription' };
  }

  const items = asRecord(sub?.items)?.data;
  if (Array.isArray(items)) {
    for (const rawItem of items) {
      const item = asRecord(rawItem);
      const itemEnd = readUnixSeconds(item?.current_period_end);
      if (itemEnd === null) continue;
      // Startdatoen faller tilbake på topnivå hvis bare slutten ligger på
      // elementet — bedre enn å miste en dato vi faktisk har.
      const itemStart = readUnixSeconds(item?.current_period_start) ?? topLevelStart;
      return { start: toIso(itemStart), end: toIso(itemEnd), source: 'items' };
    }
  }

  // Ukjent periode. Startdatoen tas med hvis den finnes, men `end: null` her
  // betyr «vi vet ikke» — ikke «ingen utløpsdato». Kalleren må logge dette og
  // la en eksisterende dato i databasen stå.
  return { start: toIso(topLevelStart), end: null, source: 'missing' };
}
