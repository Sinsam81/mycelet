/**
 * Delte konstanter for identifiseringshistorikken.
 *
 * De bor samlet her fordi de leses fra fem steder som ikke må kunne komme i
 * utakt: skrivestien (/api/identify), opplastingen (identify-siden),
 * lesestien (/identifiseringer + /api/identifications/[id]), kontoslettingen
 * (delete-user-objects) og retensjonsjobben (/api/cron/purge-identifications).
 */

/** Den PRIVATE Storage-bøtta historikkbildene ligger i (migrasjon 055). */
export const IDENTIFY_HISTORY_BUCKET = 'identify-history';

/**
 * Hvor lenge en historikkrad lever før retensjonsjobben tar den.
 *
 * Historikken er et MELLOMLAGER, ikke et arkiv: det du vil beholde, lagrer du
 * som funn — og funn beholdes så lenge kontoen finnes. Tolv måneder gir «hva
 * fant jeg i fjor på denne tida» én sesong tilbake, og setter et hardt tak på
 * lagringskostnaden. Tallet er normativt og speiles i docs/retention-policy.md
 * og i personvernerklæringen § 5 (begge språk) — endres det her, må begge
 * stedene følge etter.
 */
export const IDENTIFICATION_RETENTION_DAYS = 365;

/**
 * Bildestørrelsen historikken lagrer.
 *
 * Valgt for Supabase FREE-planen, som har 1 GB fillagring totalt — delt med
 * finding-images og forum-images. 640 px / q0,72 gir ~60 KB per bilde, altså
 * rundt 17 000 identifiseringer innenfor taket; dagens 1500 px-fil (~450 KB)
 * ville sprengt det etter ~2 200.
 *
 * Konsekvensen er ærlig og synlig i UI-et: lagrer du et funn med én gang, får
 * funnet det fulle bildet fra økta. Lagrer du det SENERE fra historikken, er
 * det denne mindre kopien som følger med. Går prosjektet over til Supabase Pro,
 * er det disse to tallene som skal opp (se docs/identifiseringshistorikk-design.md § 4.2).
 */
export const HISTORY_IMAGE_MAX_DIM = 640;
export const HISTORY_IMAGE_QUALITY = 0.72;

/**
 * Filstien er DETERMINERT av rad-id-en, ikke tilfeldig.
 *
 * Det er motsatt av buildUserUploadPath (som med vilje er ugjettbar, fordi
 * finding-images er en OFFENTLIG bøtte der stien i praksis er tilgangskontroll).
 * Her er bøtta privat med eier-policy på storage.objects, så gjettbarhet gir
 * ingen tilgang — og en determinert sti betyr at serveren kan skrive
 * image_path allerede ved innsetting. Da slipper klienten en ekstra
 * skriveoperasjon, og UPDATE-rettigheten kan holdes på to kolonner.
 *
 * Første ledd MÅ være bruker-id-en: både storage-policyene og
 * deleteUserStorageObjects nøkler på den mappa.
 */
export function buildHistoryImagePath(userId: string, identificationId: string): string {
  return `${userId}/${identificationId}.jpg`;
}
