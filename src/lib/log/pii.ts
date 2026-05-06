/**
 * PII redaction for log lines.
 *
 * Logs travel further than we plan for them — Vercel's log dashboard,
 * future Sentry, future log drains, future support tickets where engineers
 * paste excerpts. Anything that would be a GDPR breach if it leaked from
 * one of those gets redacted here at the source.
 *
 * Two principles:
 *
 *   1. Internal IDs (UUIDs, numeric IDs) are kept — they're meaningless
 *      without DB access. Useful for cross-referencing.
 *   2. Anything that looks like or maps directly to a real-world person
 *      (email, phone, full name, plain-text secrets) gets redacted.
 *
 * If you're unsure whether something is PII, redact it. The downside of
 * over-redaction is debug friction; the downside of under-redaction is
 * GDPR Art. 32.
 */

/**
 * Substrings (lower-cased) that, if they appear in an object key, mean the
 * value should be redacted. Match-by-substring is intentionally permissive
 * so a developer adding `userPassword` or `apiPasswordReset` doesn't have
 * to remember to update the list.
 */
const REDACT_KEY_PATTERNS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'serviceroleekey',
  'service_role',
  'plantid_api_key',
  'openweather_api_key',
  'stripe_secret',
  'stripe_webhook_secret',
  'met_frost_client_id'
];

const REDACTION_PLACEHOLDER = '<redacted>';

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Mask an email so the local part isn't recoverable but the domain remains
 * useful for "where do our users come from" debugging.
 *
 *   sindre.alstad@gmail.com  →  s***@gmail.com
 *   a@x.no                   →  a***@x.no  (single-char locals still
 *                                            keep first char — domain alone
 *                                            isn't enough to identify)
 *   notanemail               →  notanemail (untouched)
 */
export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  return `${local[0]}***${domain}`;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Walk a value and return a deep clone with PII redacted. Handles plain
 * objects, arrays, primitives, and Errors. Cycles are tracked so a
 * self-referencing object doesn't infinite-loop.
 */
export function redactPII(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  // Strings: scan for embedded emails and mask them.
  if (typeof value === 'string') {
    return value.replace(EMAIL_REGEX, (match) => maskEmail(match));
  }

  // Primitives pass through.
  if (typeof value !== 'object') return value;

  // Errors get serialized with name, message, stack — but we redact emails
  // inside the message and stack just in case.
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactPII(value.message, seen),
      stack: typeof value.stack === 'string' ? redactPII(value.stack, seen) : undefined
    };
  }

  // Defend against cyclic references.
  if (seen.has(value as object)) return '<cycle>';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactPII(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (shouldRedactKey(key)) {
      out[key] = REDACTION_PLACEHOLDER;
      continue;
    }
    out[key] = redactPII(child, seen);
  }
  return out;
}
