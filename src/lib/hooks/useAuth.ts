'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { nullstillDelingsnivaStandard } from '@/lib/findings/delingsniva';
import { TERMS_VERSION } from '@/lib/legal';
import { ensureProfileOnce } from '@/lib/auth/profile-self-heal';

interface SignUpPayload {
  email: string;
  password: string;
  username?: string;
  displayName?: string;
}

export function useAuth() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Selvhelbredelse for kontoer som mistet profilen sin under registrering
    // (se ensure-profile.ts). ProfileSelfHeal gjør det samme for enhver økt,
    // men her venter vi på svaret FØR innloggingen regnes som ferdig, slik at
    // brukeren ikke lander på /map og lagrer et funn i det halvsekundet
    // reparasjonen fortsatt er underveis.
    //
    // ensureProfileOnce deler forsøket med ProfileSelfHeal, så SIGNED_IN-
    // hendelsen og dette kallet blir ett nettverkskall, ikke to.
    if (data.user) {
      const { error: profileError } = await ensureProfileOnce(supabase, data.user);
      if (profileError) {
        // Innloggingen lyktes — vi skal ikke ta den fra dem fordi en
        // reparasjon ikke gikk. Men det må være synlig.
        console.warn('ensureProfile failed after sign-in', profileError.message);
      }
    }
  };

  const signInWithGoogle = async (redirectTo?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo ?? `${window.location.origin}/auth/callback`
      }
    });
    if (error) throw error;
  };

  const signUp = async ({ email, password, username, displayName }: SignUpPayload) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName,
          // Provable consent: the signup form requires accepting the Terms +
          // age (18+/guardian) before this runs, so record the version + time
          // on the auth user. No DB migration needed.
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString()
        }
      }
    });

    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Husket delingsnivå er enhetsglobalt — skal ikke arves av (eller vises
    // for) nestemann som logger inn på en delt enhet.
    nullstillDelingsnivaStandard();
  };

  return {
    user,
    session,
    loading,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    supabase
  };
}
