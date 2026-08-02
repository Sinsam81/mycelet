/**
 * Brukernavn er OFFENTLIG. `public_findings`-viewet velger `p.username`
 * (migrasjon 001, 005, 015), og navnet vises på funn, i forumet og på profiler.
 *
 * To brukere skrev hele e-postadressen sin i brukernavn-feltet ved
 * registrering — «Trinesavoi@yahoo.com», «Moyfridovea@gmail.com» — og
 * registreringen tok imot det uten et ord. Begge hadde samtidig fylt inn et
 * fornuftig visningsnavn («Trinemor1980», «Frida»), så de mente åpenbart ikke
 * at adressen skulle bli det offentlige navnet deres.
 *
 * De rakk aldri å bli synlige, fordi de manglet profilrad og derfor ikke kunne
 * poste noe i det hele tatt (funn H9/H20). Bakfyllingen i migrasjon 037 ga dem
 * profilrad — og dermed ville adressene blitt offentlige første gang de la ut
 * et funn. Migrasjon 038 retter navnene; denne filen hindrer at det skjer igjen.
 *
 * Regelen er bevisst mild: vi AVVISER ikke, vi TRIMMER. En bruker som skriver
 * adressen sin har ikke gjort noe galt — hen har misforstått feltet. Å svare
 * med en feilmelding midt i en registrering er dårligere enn stille å bruke den
 * delen av det hen skrev som faktisk er et navn.
 */

/** Alt fra og med `@` er domenedelen — den skal aldri bli et offentlig navn. */
export function stripEmailDomain(value: string): string {
  const at = value.indexOf('@');
  return at > 0 ? value.slice(0, at) : value;
}

/**
 * Ser dette ut som en e-postadresse? Bevisst enkel: vi trenger ikke en
 * fullstendig RFC-validering for å avgjøre om noe har en domenedel som ikke bør
 * publiseres.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return false;
  const domain = trimmed.slice(at + 1);
  return domain.includes('.') && !domain.includes('@') && domain.length > 2;
}

/**
 * Gjør en brukerskrevet streng om til et brukernavn som er trygt å vise
 * offentlig. Returnerer tom streng hvis det ikke er noe brukbart igjen — da
 * skal kallstedet falle tilbake på sin egen regel (e-postens lokaldel, eller
 * `bruker-<id>`), akkurat som ensure-profile.ts gjør.
 */
export function toPublicUsername(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return (looksLikeEmail(trimmed) ? stripEmailDomain(trimmed) : trimmed).trim();
}
