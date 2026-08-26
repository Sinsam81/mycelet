import { NextResponse } from 'next/server';

/**
 * Delt mellom DELETE /api/findings/:id og POST /api/findings/:id/restore.
 */

/** Postgres: undefined_column. Her: `deleted_at` finnes ikke ennå. */
export const MIGRATION_MISSING = '42703';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Migrasjonene kjøres for hånd i Supabase SQL Editor (se CLAUDE.md), så det
 * finnes et vindu rett etter utrulling der koden er ute og kolonnen ikke er
 * det. Da skal brukeren få vite at funnet IKKE er slettet — ikke en anonym
 * 500 som lar hen tro at det er borte.
 */
export function migrationMissingResponse(details: string) {
  return NextResponse.json(
    { error: 'Funksjonen er ikke slått på ennå', details },
    { status: 503 }
  );
}

/** Slettingen rakk aldri å skje — si det, så brukeren ikke tror funnet er borte. */
export const DELETE_MIGRATION_MISSING =
  'Funnet ditt er trygt og IKKE slettet. Denne funksjonen mangler en databaseoppdatering som ikke er kjørt ennå. Prøv igjen senere.';

export const RESTORE_MIGRATION_MISSING =
  'Kunne ikke gjenopprette funnet — denne funksjonen mangler en databaseoppdatering som ikke er kjørt ennå. Prøv igjen senere.';
