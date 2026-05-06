import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

function getSafeNext(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/')) return '/';
  if (rawNext.startsWith('//')) return '/';
  return rawNext;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextOrRedirect =
    requestUrl.searchParams.get('next') ??
    requestUrl.searchParams.get('redirect');
  const next = getSafeNext(nextOrRedirect);

  let response = NextResponse.redirect(new URL(next, requestUrl.origin));
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

  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
