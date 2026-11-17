/**
 * Delt mellom PATCH og DELETE /api/findings/:id og POST /api/findings/:id/restore.
 *
 * Feilsvarene (også «funksjonen er ikke slått på ennå») bor i ../svar.ts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Mangler kolonnen — altså: er migrasjon 056 (`deleted_at`) ikke kjørt?
 *
 * To koder, fordi svaret kommer fra to steder:
 *  · `42703` (Postgres: undefined_column) når kolonnen står i et FILTER, som
 *    `.is('deleted_at', null)`.
 *  · `PGRST204` (PostgREST) når kolonnen står i det som SKRIVES, som
 *    `.update({ deleted_at })`. PostgREST sjekker nøklene mot skjemacachen
 *    før spørringen når databasen, så Postgres får aldri sagt 42703.
 *
 * Sjekken så bare etter 42703. Slettingen har kolonnen begge steder, og da er
 * det PostgREST som svarer først — brukeren ville fått «Kunne ikke slette
 * funnet» i stedet for beskjeden om at funnet er trygt.
 */
export function erManglendeKolonne(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}
