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
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000))
  };
  if (result.retryAfterSeconds !== null) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return NextResponse.json(
    {
      error: 'For mange forespørsler — prøv igjen om litt',
      retryAfterSeconds: result.retryAfterSeconds
    },
    { status: 429, headers }
  );
}
