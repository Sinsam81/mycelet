'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * Er leseren moderator eller admin? Brukes bare til å vise lenken til
 * moderasjonen i forumet — tilgangen avgjøres av rollesjekken i
 * /forum/moderation, aldri av dette svaret.
 *
 * Billig for de fleste: økta leses lokalt (getSession, ingen nettverkskall),
 * og en utlogget leser gjør ingen forespørsel i det hele tatt. Bare innloggede
 * slår opp sin egen rad i moderator_roles (RLS: egen rad), én gang per økt og
 * konto. En feil leses som «nei».
 */
export function useErModerator(): boolean {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (aktiv) setUserId(data.session?.user?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, [supabase]);

  const { data } = useQuery({
    queryKey: ['er-moderator', userId],
    enabled: Boolean(userId),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data: rad, error } = await supabase
        .from('moderator_roles')
        .select('role')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) return false;
      return rad?.role === 'moderator' || rad?.role === 'admin';
    }
  });

  return data === true;
}
