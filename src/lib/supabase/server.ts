import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Next 15+ made `cookies()` async — it returns Promise<ReadonlyRequestCookies>.
// We capture the promise once at construction and await it inside each cookie
// callback, so `createClient()` stays synchronous for call sites.
//
// Uses the getAll/setAll adapter (the form Supabase SSR requires). In route
// handlers and server actions the cookie store is writable, so setAll persists
// a refreshed session; in server components writing throws, which we swallow
// (session refresh is handled by the middleware there instead).

export function createClient() {
  const cookieStorePromise = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookieStorePromise;
          return store.getAll();
        },
        async setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            const store = await cookieStorePromise;
            cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component (read-only cookies). Safe to
            // ignore — the middleware refreshes the session in that context.
          }
        }
      }
    }
  );
}
