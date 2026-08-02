import type { Locale } from '@/i18n/config';
import { intlLocale } from './intl-locale';

/** Alt vi trenger av en auth-bruker eller en profilrad her: når den ble til. */
export interface CreatedAtRow {
  created_at?: string | null;
}

/**
 * «Medlem siden» skal svare på når KONTOEN ble opprettet — ikke når profilraden
 * tilfeldigvis ble skrevet.
 *
 * De to er ikke det samme i denne appen. Profilraden lages av appkoden
 * (src/lib/auth/ensure-profile.ts), ikke av en databasetrigger, og
 * selvreparasjonen i profile-self-heal.ts kan opprette den lenge etter
 * registreringen. Migrasjon 037 backfyller til og med profiler for kontoer som
 * har stått uten i månedsvis — de radene får dagens dato. Bruker vi
 * profiles.created_at, forteller profilen dem at de ble medlem den dagen vi
 * ryddet opp i vår egen feil.
 *
 * auth.users.created_at er den ekte registreringstiden, og den ligger allerede
 * i økten. Profilraden er kun en reserve for det tilfellet at auth-datoen
 * mangler.
 */
export function memberSinceIso(user: CreatedAtRow | null, profile: CreatedAtRow | null): string | null {
  return user?.created_at ?? profile?.created_at ?? null;
}

/** Samme valg som over, formatert som «måned år» på brukerens språk. */
export function formatMemberSince(
  user: CreatedAtRow | null,
  profile: CreatedAtRow | null,
  locale: Locale | string
): string | null {
  const iso = memberSinceIso(user, profile);
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(intlLocale(locale), { year: 'numeric', month: 'long' });
}
