/**
 * Route-handler helpers for the in-memory rate limiter.
 *
 * Typical usage in an API route:
 *
 *   import { checkRateLimit } from '@/lib/rate-limit';
 *   import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
 *
 *   const key = `identify:${getClientKey(request, user?.id ?? null)}`;
 *   const result = checkRateLimit(key, 30, 60);
 *   if (!result.allowed) return rateLimitResponse(result);
 */

import { NextRequest, NextResponse } from 'next/server';
import type { RateLimitResult } from './index';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * Feilteksten er generert på serveren, og next-intl dekker derfor ikke denne —
 * samme felle som prediksjonstekstene gikk i. En svensk bruker som traff en
 * grense fikk norsk beskjed.
 */
const COPY: Record<Locale, string> = {
  nb: 'For mange forespørsler — prøv igjen om litt',
  sv: 'För många förfrågningar — försök igen om en stund'
};

/**
 * Build a stable per-client identifier for bucket keys.
 *
 * Authenticated users key by user-id (stable across IPs, NAT, mobile
 * networks). Anonymous traffic falls back to client IP from
 * x-forwarded-for (first hop = original client) or x-real-ip.
 *
 * Returns "unknown" if neither a user-id nor headers are available — that
 * bucket effectively rate-limits all unidentifiable traffic together,
 * which is the right failure mode (don't let unidentifiable traffic
 * bypass limits).
 */
export function getClientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `user:${userId}`;

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstHop = forwardedFor.split(',')[0]?.trim();
    if (firstHop) return `ip:${firstHop}`;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return `ip:${realIp.trim()}`;

  return 'ip:unknown';
}

/**
 * Standard 429 response with Retry-After + RateLimit-* headers per
 * draft-ietf-httpapi-ratelimit-headers semantics.
 *
 * Finner leserens språk selv når `locale` ikke oppgis. Det er med vilje:
 * hjelperen kalles fra 18 rutehandlere, og en valgfri parameter hver enkelt
 * kunne glemme å sende ville betydd at 17 av dem fortsatt svarte på norsk.
 * Kostnaden er ett cookie-oppslag, og bare når noen faktisk treffer en grense.
 *
 * Ruter som allerede har slått opp språket kan sende det inn og spare
 * oppslaget.
 */
export async function rateLimitResponse(
  result: RateLimitResult,
  locale?: Locale
): Promise<NextResponse> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000))
  };
  if (result.retryAfterSeconds !== null) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  // Språkoppslaget leser cookies, som kan kaste utenfor en request-kontekst.
  // En 429 skal aldri bli en 500 fordi vi ikke fant språket.
  let lang: Locale = locale ?? DEFAULT_LOCALE;
  if (!locale) {
    try {
      lang = await getUserLocale();
    } catch {
      lang = DEFAULT_LOCALE;
    }
  }

  return NextResponse.json(
    {
      error: COPY[lang] ?? COPY[DEFAULT_LOCALE],
      retryAfterSeconds: result.retryAfterSeconds
    },
    { status: 429, headers }
  );
}
