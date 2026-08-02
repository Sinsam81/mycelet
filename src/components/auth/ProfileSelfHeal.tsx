'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { startProfileSelfHeal } from '@/lib/auth/profile-self-heal';

/**
 * Monteres i Providers, altså på hver eneste side. Rendrer ingenting — den
 * finnes bare for at profilreparasjonen skal kjøre for enhver innlogget økt,
 * ikke bare i innloggingsøyeblikket. Se src/lib/auth/profile-self-heal.ts.
 */
export function ProfileSelfHeal() {
  useEffect(() => startProfileSelfHeal(createClient()), []);
  return null;
}
