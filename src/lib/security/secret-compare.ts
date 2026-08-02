import { createHash, timingSafeEqual } from 'crypto';

/**
 * Konstant-tids sammenligning av delte hemmeligheter.
 *
 * Bakgrunn: kodebasen hadde tre ulike måter å sjekke en hemmelighet på.
 * RevenueCat-webhooken gjorde det riktig (timingSafeEqual på SHA-256-digester),
 * mens de to cron-rutene brukte `!==` på strengen. Praktisk utnyttelse over
 * HTTPS mot en serverless-funksjon er urealistisk — nettverksstøyen er større
 * enn tidsforskjellen — men det er ingen grunn til å ha to regler når den
 * riktige allerede var skrevet. Hele poenget her er at det finnes ÉN.
 *
 * Hvorfor hashe først: timingSafeEqual kaster hvis bufferne har ulik lengde,
 * og en lengdesjekk ville i seg selv vært et orakel. SHA-256 gir alltid 32
 * byte, uansett hva som kom inn.
 */
export function secretsMatch(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  // Ingen hemmelighet konfigurert = ingen adgang. Fail closed.
  if (!expected) return false;
  const a = createHash('sha256').update(received ?? '').digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Samme sjekk for en `Authorization: Bearer <hemmelighet>`-header.
 * Hele headerverdien sammenlignes, så «Bearer»-prefikset må stemme også.
 */
export function bearerSecretMatches(
  authorizationHeader: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!expected) return false;
  return secretsMatch(authorizationHeader, `Bearer ${expected}`);
}
