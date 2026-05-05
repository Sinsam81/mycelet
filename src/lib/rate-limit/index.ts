/**
 * In-memory fixed-window rate limiter.
 *
 * Trade-offs you should know about:
 *
 *   ✗ Per-instance only. State lives in module-scoped Map; a horizontally
 *     scaled deployment (Vercel auto-scales) means N instances each with
 *     their own bucket. Effective limit is roughly N * configured limit.
 *     Acceptable for the beta tester program; replace with Upstash Redis
 *     or Vercel KV before opening to general traffic.
 *   ✗ Resets on cold start. Each new lambda invocation starts with empty
 *     state. Bursts during a deploy can briefly exceed limits.
 *   ✗ Edge runtime not supported. Module-scoped Maps don't persist across
 *     Edge invocations. All callers must run on Node runtime — every API
 *     route in this codebase already does, but verify before adding new
 *     callers.
 *
 * Why ship this anyway:
 *
 *   ✓ Real protection against single-IP brute-force or accidental loops
 *     during beta — better than nothing
 *   ✓ Zero infra cost (no Redis to set up)
 *   ✓ Trivial to swap implementation later — `checkRateLimit` is the only
 *     symbol callers depend on
 */

interface Bucket {
  count: number;
  resetAt: number;
}

// Module-scoped, intentional. Reused across requests within a single
// lambda instance.
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the bucket resets. Set when blocked, null otherwise. */
  retryAfterSeconds: number | null;
  /** Wall-clock ms when the bucket resets. Useful for X-RateLimit-Reset. */
  resetAt: number;
}

/**
 * Check (and atomically increment if allowed) the bucket for `key`.
 * Returns whether the request is allowed.
 *
 * `key` should namespace the bucket — typical pattern is `"<route>:<client>"`
 * where client is the user-id when known, falling back to client IP.
 */
export function checkRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  if (limit <= 0 || windowSeconds <= 0) {
    throw new Error('rate-limit: limit and windowSeconds must be > 0');
  }

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const fresh: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSeconds: null,
      resetAt: fresh.resetAt
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      resetAt: existing.resetAt
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: null,
    resetAt: existing.resetAt
  };
}

/**
 * Test/inspection only. Don't call from production code paths — checkRateLimit
 * already increments atomically.
 */
export function _peekBucket(key: string): Bucket | undefined {
  return buckets.get(key);
}

/**
 * Test/inspection only. Lets a test reset state between cases.
 */
export function _resetAllBuckets(): void {
  buckets.clear();
}

// Periodic cleanup of expired buckets so the Map doesn't grow unbounded
// over the lambda's lifetime. unref so we don't keep the event loop alive
// in case the lambda wants to suspend.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
if (typeof setInterval === 'function') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  // Node-only API; ignore on runtimes that don't support it.
  (timer as unknown as { unref?: () => void }).unref?.();
}
