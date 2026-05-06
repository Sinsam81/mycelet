import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Next 15+ made `cookies()` async — it now returns Promise<ReadonlyRequestCookies>.
// We capture the promise once at construction time and await it inside each
// callback. This keeps `createClient()` synchronous (so the rest of the
// codebase doesn't have to migrate to `await createClient()` everywhere)
// while still complying with the new API contract under the hood.

export function createClient() {
  const cookieStorePromise = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const store = await cookieStorePromise;
          return store.get(name)?.value;
        },
        set() {},
        remove() {}
      }
    }
  );
}
