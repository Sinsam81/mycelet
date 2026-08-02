/**
 * Sørger for at en innlogget bruker har en profilrad.
 *
 * Bakgrunn: registrering er to skritt — først opprettes auth-brukeren, så
 * profilraden. Feilet det andre skrittet (brukernavnkollisjon mot UNIQUE i
 * migrasjon 001, eller en hvilken som helst forbigående feil), satt brukeren
 * igjen med en konto uten profil og ingen vei videre: e-posten var «allerede
 * registrert», så de kunne ikke prøve på nytt, og appen forventet en profil de
 * ikke hadde.
 *
 * Callback-ruten (OAuth og e-postbekreftelse) reparerte dette allerede ved å
 * upserte profilen fra user_metadata. Passordinnlogging går aldri gjennom
 * callbacken, så der fantes ingen redning. Denne funksjonen er den delte
 * versjonen: er profilen der, gjør den ingenting; mangler den, opprettes den.
 *
 * Selve funksjonen er bare reparasjonen. NÅR den kjøres, avgjøres av
 * src/lib/auth/profile-self-heal.ts (hver økt i nettleseren) og av
 * /api/findings (siste skanse på serveren) — se kommentaren der for hvorfor
 * det ikke holder å kalle den ved registrering og innlogging alene.
 *
 * Brukernavn og visningsnavn ligger allerede i user_metadata fra signUp, så vi
 * gjenskaper det brukeren faktisk valgte — ikke en tilfeldig erstatning.
 */

export interface MinimalUser {
  id: string;
  email?: string | null;
  user_metadata?: { username?: string; display_name?: string } | null;
}

export interface ProfileUpsertClient {
  from(table: 'profiles'): {
    upsert(
      values: { id: string; username: string; display_name: string },
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
}

/** Postgres: unique_violation. Her betyr det at brukernavnet er opptatt. */
const UNIQUE_VIOLATION = '23505';

/** Fallback når metadata mangler — samme regel som callback-ruten bruker. */
export function defaultUsernameFor(user: MinimalUser): string {
  return user.email?.split('@')[0] || `bruker-${user.id.slice(0, 8)}`;
}

export interface EnsureProfileResult {
  /** Brukernavnet profilen endte opp med (kan være suffikset ved kollisjon). */
  username: string;
  /** Satt hvis vi ikke fikk opprettet profilen i det hele tatt. */
  error: { code?: string; message: string } | null;
}

export async function ensureProfile(
  supabase: ProfileUpsertClient,
  user: MinimalUser
): Promise<EnsureProfileResult> {
  const meta = user.user_metadata ?? {};
  const desired = meta.username || defaultUsernameFor(user);
  const displayName = meta.display_name || desired;

  const attempt = (username: string) =>
    supabase
      .from('profiles')
      .upsert(
        { id: user.id, username, display_name: displayName },
        // onConflict på id + ignoreDuplicates: har brukeren allerede en profil,
        // rører vi den ikke. Dette skal aldri overskrive noe.
        { onConflict: 'id', ignoreDuplicates: true }
      );

  const { error } = await attempt(desired);
  if (!error) return { username: desired, error: null };

  // Brukernavnet er opptatt av en ANNEN bruker. Uten en utvei ville kontoen
  // forblitt uten profil for alltid; en suffiksert variant er bedre enn ingen
  // konto, og brukeren kan endre den i profilinnstillingene etterpå.
  if (error.code === UNIQUE_VIOLATION) {
    const fallback = `${desired}-${user.id.slice(0, 6)}`;
    const { error: fallbackError } = await attempt(fallback);
    return { username: fallback, error: fallbackError };
  }

  return { username: desired, error };
}
