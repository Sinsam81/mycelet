/**
 * Bygger filstien et brukerbilde lastes opp til.
 *
 * Hvorfor dette ikke bare er `Date.now()`:
 *
 * Bøttene `finding-images` og `forum-images` er offentlige (migrasjon 019), og
 * appen leser bildene via getPublicUrl(). Det betyr at den som kjenner stien,
 * kan hente bildet — også for et funn brukeren har merket som PRIVAT.
 *
 * Den gamle stien var `${user.id}/${Date.now()}.jpg`, og begge delene var
 * gjettbare:
 *   • user_id ligger åpent i public_findings for alle som har lagt ut ett
 *     eneste offentlig funn.
 *   • Date.now() er et tidspunkt. Kjenner du omtrent når bildet ble lastet opp,
 *     er søkerommet sekunder, ikke millisekunder.
 *
 * Til sammen var et privat funns bilde praktisk gjettbart for en som ville
 * målrette én bruker. Med en tilfeldig UUID er det ikke det.
 *
 * MERK at dette bare gjelder framover. Bilder som allerede ligger der, beholder
 * sine gamle stier — å endre dem ville brutt URL-ene som er lagret i
 * findings.thumbnail_url og forum_posts. Den ordentlige løsningen er å gjøre
 * bøttene private og servere signerte URL-er; det er en større endring som
 * treffer hver eneste bildevisning i appen, og bør gjøres bevisst.
 */

/** Brukerens mappe er fortsatt prefikset — slettingen ved kontosletting nøkler på den. */
export function buildUserUploadPath(userId: string, extension = 'jpg'): string {
  return `${userId}/${randomId()}.${extension}`;
}

function randomId(): string {
  // crypto.randomUUID finnes i alle nettlesere vi støtter og i Node 19+.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Nødløsning: 128 bit fra getRandomValues.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Skal aldri skje i praksis. Kaster heller enn å falle tilbake på
  // Math.random(), som ville gjenopprettet nøyaktig den gjettbarheten vi
  // prøver å bli kvitt.
  throw new Error('Ingen kryptografisk tilfeldighetskilde tilgjengelig for opplastingssti');
}
