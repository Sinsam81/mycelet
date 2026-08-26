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
 *
 * Skilletegn spiller ingen rolle: både nøkkelen og mønsteret strippes for alt
 * som ikke er bokstav/tall før sammenligningen (se normalizeKey). Uten det
 * slapp HTTP-headeren `Api-Key` gjennom — den skrivemåten koden selv bruker mot
 * Kindwise — fordi «api-key» ikke inneholder «apikey».
 */
const REDACT_KEY_PATTERNS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'servicerolekey',
  'service_role',
  'plantid_api_key',
  'openweather_api_key',
  'stripe_secret',
  'stripe_webhook_secret',
  'met_frost_client_id'
];

const REDACTION_PLACEHOLDER = '<redacted>';

/** Bokstaver og tall bare — «Api-Key», «api_key» og «apiKey» blir alle «apikey». */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALIZED_REDACT_KEY_PATTERNS = REDACT_KEY_PATTERNS.map(normalizeKey);

function shouldRedactKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return NORMALIZED_REDACT_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Hemmeligheter som opptrer som VERDI, under en nøkkel vi ikke gjenkjenner.
 *
 * Nøkkellisten over hjelper ikke mot `log.debug('kindwise.request', { headers })`
 * eller `{ note: 'brukte sk_live_…' }`. Formen på selve verdien er det eneste
 * signalet vi har igjen da, og disse fire formene er entydige nok til at en
 * treffer aldri er tilfeldig tekst:
 *
 *   • `Bearer <noe>`            — Authorization-verdien, uansett hvor den står
 *   • `sk_live_…`, `kw_test_…`  — leverandørnøkler (Stripe, Kindwise, m.fl.)
 *   • `whsec_…`                 — Stripes webhook-hemmelighet
 *   • `eyJ….….…`                — JWT (base64 av `{"`), f.eks. et Supabase-token
 */
const SECRET_VALUE_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: `Bearer ${REDACTION_PLACEHOLDER}` },
  { pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\bwhsec_[A-Za-z0-9_-]{6,}/g, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\b[A-Za-z][A-Za-z0-9]{0,7}_(?:live|test)_[A-Za-z0-9]{6,}/g, replacement: REDACTION_PLACEHOLDER }
];

function redactSecretValues(value: string): string {
  return SECRET_VALUE_RULES.reduce(
    (acc, rule) => acc.replace(rule.pattern, rule.replacement),
    value
  );
}

/**
 * Mask an email so the local part isn't recoverable but the domain remains
 * useful for "where do our users come from" debugging.
 *
 *   ola.nordmann@example.com  →  o***@example.com
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

  // Strings: mask embedded secrets first, then embedded emails.
  if (typeof value === 'string') {
    return redactSecretValues(value).replace(EMAIL_REGEX, (match) => maskEmail(match));
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
