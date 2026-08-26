import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/log';
import { getOrCreateRequestId } from '@/lib/log/request';
import { LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/config';
import { classifyTrafficSource } from '@/lib/analytics/traffic-source';

/**
 * Fasit for hvilke ruter en utlogget besøkende sendes til innlogging fra.
 *
 * /forum/moderation og /forum/reports kom med etter lanseringsrevisjonen: de
 * svarte 200 uten innlogging. Ingen data lakk (RLS på `reports` gjelder
 * uansett), men en utlogget besøkende — inkludert en Apple-reviewer — fikk en
 * moderasjonskonsoll med knappene «Marker som løst / Avvis» og en lenke inn i
 * admin-området. Det ser ut som brutt tilgangskontroll enten det er det eller
 * ikke. /forum/reports viser dessuten «mine rapporter», som per definisjon
 * krever en bruker.
 */
export const PROTECTED_PATHS = [
  '/profile',
  '/forum/new',
  '/forum/moderation',
  '/forum/reports',
  '/map',
  '/admin',
  '/mine-steder',
  '/identifiseringer'
];

/** Prefiksmatch: /admin dekker /admin/forum-trust, /map dekker /map?lat=… */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Which language of the static landing page a logged-out visitor should get.
 * Priority: explicit ?lang= toggle click → saved app-wide language cookie →
 * geo-IP (Vercel sets x-vercel-ip-country at the edge; SE → Swedish) →
 * Accept-Language (matches getUserLocale in src/i18n/locale.ts) → Norwegian.
 * Geo-IP is landing-only on purpose: inside the app the user has a language
 * toggle, and their cookie choice must always win over where they happen to be.
 */
function resolveLandingLocale(request: NextRequest): Locale {
  const langParam = request.nextUrl.searchParams.get('lang') ?? undefined;
  if (isLocale(langParam)) return langParam;

  const cookieValue = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  if (request.headers.get('x-vercel-ip-country')?.toUpperCase() === 'SE') return 'sv';

  const acceptLanguage = request.headers.get('accept-language') ?? '';
  if (/(^|[,\s])sv\b/i.test(acceptLanguage)) return 'sv';

  return 'nb';
}

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

  if (isProtectedPath(request.nextUrl.pathname) && !user) {
    log.info('middleware.auth_redirect', { from: request.nextUrl.pathname });
    const redirectUrl = new URL('/auth/login', request.url);
    // Sti OG søkestreng: en lenke som /profile?vis=soppvarsel skal lande på
    // riktig sted ETTER innlogging, ikke på toppen av profilen. (Fragmenter
    // (#...) når aldri serveren og kan ikke bevares her.) Verdien valideres av
    // readSafeNext på login-siden før den brukes.
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl, {
      headers: { 'x-request-id': reqId }
    });
  }

  // Logged-out visitors on the front page get the designed static landing
  // (public/landing/index.html, Swedish: index.sv.html — zero JS, self-hosted
  // fonts). Logged-in users fall through to the app home. NB: Turbopack dev
  // skips middleware, so local dev shows the React fallback in
  // src/app/page.tsx instead — verify this path with `next start` or against
  // prod.
  if (request.nextUrl.pathname === '/' && !user) {
    // Hvor kom de fra? Landingssiden har null JavaScript, så Google Analytics
    // kjører ikke her — se den lange forklaringen i @/lib/analytics/traffic-source.
    // Dette er det ENESTE stedet vi kan se det, og det koster ingenting:
    // henvisningen står allerede i forespørselen.
    //
    // Ingen IP, ingen informasjonskapsler, ingen full adresse — bare hvilken
    // tjeneste de kom fra. Teller trafikk, sporer ikke personer.
    const kilde = classifyTrafficSource(
      request.headers.get('referer'),
      request.nextUrl.host,
      request.nextUrl.searchParams.get('utm_source')
    );
    log.info('landing.besok', {
      kilde: kilde.kind,
      vert: kilde.host,
      kampanje: kilde.campaign,
      utm_medium: request.nextUrl.searchParams.get('utm_medium'),
      utm_campaign: request.nextUrl.searchParams.get('utm_campaign')
    });

    const landingLocale = resolveLandingLocale(request);
    const landingFile = landingLocale === 'sv' ? '/landing/index.sv.html' : '/landing/index.html';
    const landingResponse = NextResponse.rewrite(new URL(landingFile, request.url), {
      headers: { 'x-request-id': reqId }
    });
    // A ?lang= click on the landing toggle persists the choice in the same
    // cookie the in-app language switcher uses, so landing and app stay in
    // the same language from then on.
    const langParam = request.nextUrl.searchParams.get('lang') ?? undefined;
    if (isLocale(langParam) && langParam !== request.cookies.get(LOCALE_COOKIE)?.value) {
      landingResponse.cookies.set(LOCALE_COOKIE, langParam, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax'
      });
    }
    return landingResponse;
  }

  return response;
}
