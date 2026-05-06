import type { NextRequest } from 'next/server';
import { logger, type Logger } from './index';

/**
 * Request-scoped logger.
 *
 * Generates a short correlation ID per request and bundles it with the
 * route path so every log line emitted during that request's lifetime
 * shares the same `reqId`. That's how you reconstruct what happened on
 * one specific request when scrolling through Vercel logs.
 *
 * Usage in a route handler:
 *
 *   export async function GET(request: NextRequest) {
 *     const log = createRequestLogger(request);
 *     log.info('identify.start');
 *     try {
 *       const result = await doWork();
 *       log.info('identify.success', { speciesId: result.id });
 *       return NextResponse.json(result);
 *     } catch (err) {
 *       log.error('identify.failed', err);
 *       return NextResponse.json({ error: '...' }, { status: 500 });
 *     }
 *   }
 *
 * Pass the correlation ID downstream by setting an `X-Request-Id` header
 * on the response — the client can then quote that ID in a support ticket.
 */

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Read an upstream-provided request id from the headers, or generate a
 * fresh one. Vercel and most reverse proxies set this; honor it so a
 * single ID flows from edge → Next → Supabase.
 */
export function getOrCreateRequestId(request: NextRequest): string {
  const upstream = request.headers.get(REQUEST_ID_HEADER);
  if (upstream && upstream.length > 0 && upstream.length < 100) return upstream;
  // crypto.randomUUID is available in Node 19+ and the Edge runtime.
  // Slice the UUID to 8 chars — short enough to scan in logs, low collision
  // odds within a request lifetime (we don't need global uniqueness).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Build a logger pre-bound with this request's reqId, route, and user
 * agent (truncated). Pass `userId` once you've authenticated.
 */
export function createRequestLogger(request: NextRequest): Logger {
  const reqId = getOrCreateRequestId(request);
  const url = new URL(request.url);
  return logger.child({
    reqId,
    route: url.pathname,
    method: request.method,
    ua: request.headers.get('user-agent')?.slice(0, 80) ?? undefined
  });
}
