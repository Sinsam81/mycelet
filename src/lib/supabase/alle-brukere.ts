import type { User } from '@supabase/supabase-js';

export const BRUKERE_PER_SIDE = 1000;
/**
 * Bevisst tak: 50 000 kontoer. Ved den grensen skal dette være en
 * SQL-spørring mot auth.users, ikke sidevis henting fra en sidevisning eller
 * en cron.
 */
export const MAKS_SIDER = 50;

/** Det vi trenger av admin-API-et — strukturelt, så tester kan gi en falsk. */
export interface BrukerKilde {
  listUsers(params: { page: number; perPage: number }): Promise<{ data: { users: User[] } | null; error: { message: string } | null }>;
}

export type AlleBrukere = { brukere: User[]; avkortet: boolean };

/**
 * Alle kontoer i auth.users, side for side.
 *
 * auth.users er ikke eksponert gjennom PostgREST; admin-API-et er veien inn,
 * og det gir høyst 1000 per side uten å si fra at det finnes flere. Fram til
 * oktober 2026 leste dagsrapporten bare side 1 mens /admin bladde videre, så
 * de to kunne være uenige om hvilke kontoer som var interne — og dermed om et
 * App Store-kjøp var et salg eller testing. Nå henter begge gjennom denne.
 *
 * `avkortet` er sann når taket på MAKS_SIDER ble nådd med en full siste side:
 * da kan det finnes kontoer som ikke er med, og den som kaller skal si fra.
 */
export async function hentAlleBrukere(auth: BrukerKilde): Promise<AlleBrukere | { feil: string }> {
  const brukere: User[] = [];
  for (let side = 1; side <= MAKS_SIDER; side++) {
    const { data, error } = await auth.listUsers({ page: side, perPage: BRUKERE_PER_SIDE });
    if (error) return { feil: error.message };
    const users = data?.users ?? [];
    brukere.push(...users);
    if (users.length < BRUKERE_PER_SIDE) return { brukere, avkortet: false };
  }
  return { brukere, avkortet: true };
}
