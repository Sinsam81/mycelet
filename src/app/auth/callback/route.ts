import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSafeNext } from '@/lib/auth/safe-redirect';
import { ensureProfile } from '@/lib/auth/ensure-profile';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextOrRedirect =
    requestUrl.searchParams.get('next') ??
    requestUrl.searchParams.get('redirect');
  const next = getSafeNext(nextOrRedirect);

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  if (!code) return response;

  // Next 15+: cookies() is async. Resolve once and reuse the store inside
  // each callback to keep the createServerClient signature unchanged.
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: exchanged } = await supabase.auth.exchangeCodeForSession(code);

  // E-mail-confirmation flow: the register page can't create the profile
  // (no session exists pre-confirmation, and RLS requires auth.uid() = id),
  // so ensure it here from the metadata signUp stored. ignoreDuplicates keeps
  // this from overwriting an existing profile; failures must not block login.
  const user = exchanged?.user ?? null;
  if (user) {
    // Samme funksjon som brukes ved passordinnlogging og registrering, slik at
    // det finnes ÉN regel for hvordan en profil sikres — inkludert utveien når
    // brukernavnet er opptatt. Se src/lib/auth/ensure-profile.ts.
    await ensureProfile(supabase, user);
  }

  return response;
}
