import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/log';
import { getOrCreateRequestId } from '@/lib/log/request';

const PROTECTED_PATHS = ['/profile', '/forum/new', '/map', '/admin', '/mine-steder'];

export async function updateSession(request: NextRequest) {
  // Per-request correlation ID. Injected into the forwarded request headers so
  // downstream route handlers see the same value via `createRequestLogger`, and
  // also set on the response.
  //
  // KNOWN NEXT 14+ LIMITATION: response headers set from middleware do NOT
  // propagate to the client when a route handler/page builds the response. The
  // request-header rewrite half DOES work (so createRequestLogger picks up
  // x-request-id server-side). See docs/logging.md § "Kjent begrensning".
  const reqId = getOrCreateRequestId(request);

  // Rebuilds the forwarded response from the CURRENT request state. We call it
  // again inside setAll() after a session refresh so the refreshed cookies
  // propagate to downstream handlers within the same request. `new
  // Headers(request.headers)` is read fresh each call, so it picks up cookies
  // written via `request.cookies.set(...)` immediately before.
  const buildResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', reqId);
    return NextResponse.next({
      request: { headers: requestHeaders },
      headers: { 'x-request-id': reqId }
    });
  };

  let response = buildResponse();

  const log = logger.child({ reqId, route: request.nextUrl.pathname });

  // Supabase SSR REQUIRES the getAll/setAll cookie adapter. The older
  // get/set/remove form did not reliably forward a refreshed session to the
  // route handler in the same request: once the short-lived access token
  // expired, the rotating refresh token got consumed here while the handler
  // still saw the old cookie, so its getUser() returned 401 — surfacing as
  // users randomly appearing logged out (and paid users seeing "Free").
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // 1) Update the request cookie jar so the forwarded request (and any
          //    route handler after this middleware) sees the refreshed session.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // 2) Rebuild the response so the updated cookie header is forwarded
          //    downstream (re-attaching x-request-id).
          response = buildResponse();
          // 3) Write the refreshed cookies onto the response so the browser
          //    stores them for subsequent requests.
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  // Do not run logic between client creation and getUser(): getUser() is what
  // revalidates the token and triggers the cookie refresh (setAll) above.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isProtectedPath = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (isProtectedPath && !user) {
    log.info('middleware.auth_redirect', { from: request.nextUrl.pathname });
    const redirectUrl = new URL('/auth/login', request.url);
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl, {
      headers: { 'x-request-id': reqId }
    });
  }

  return response;
}
