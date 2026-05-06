import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/log';
import { getOrCreateRequestId } from '@/lib/log/request';

const PROTECTED_PATHS = ['/profile', '/forum/new', '/map', '/admin'];

export async function updateSession(request: NextRequest) {
  // Generate (or reuse from upstream) a per-request correlation ID and
  // inject it into the request headers so downstream route handlers see
  // the same value via `createRequestLogger`. Also surface it on the
  // response so clients can quote it in support tickets.
  const reqId = getOrCreateRequestId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', reqId);

  // NextResponse.next() accepts a ResponseInit-style `headers` field that
  // DOES propagate to the eventual response sent to the client.
  // Setting them via `response.headers.set()` afterwards does not — that's
  // a known Next 14 quirk for App Router. Build the init with both the
  // request-header rewrite (so handlers see x-request-id) and the response
  // headers (so the client gets the same id back) up front.
  function buildInit() {
    return {
      request: { headers: requestHeaders },
      headers: { 'x-request-id': reqId }
    };
  }

  let response = NextResponse.next(buildInit());

  const log = logger.child({ reqId, route: request.nextUrl.pathname });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          // Cookie callbacks reconstruct response — rebuild init with
          // x-request-id so the new response carries it too.
          response = NextResponse.next(buildInit());
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next(buildInit());
          response.cookies.set({ name, value: '', ...options });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isProtectedPath = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (isProtectedPath && !user) {
    log.info('middleware.auth_redirect', { from: request.nextUrl.pathname });
    const redirectUrl = new URL('/auth/login', request.url);
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
    const redirect = NextResponse.redirect(redirectUrl, {
      headers: { 'x-request-id': reqId }
    });
    return redirect;
  }

  return response;
}
