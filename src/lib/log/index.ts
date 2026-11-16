/**
 * Application logger for Mycelet.
 *
 * Five levels, ordered by verbosity:
 *
 *   trace  — step-by-step flow, request lifecycle. Off by default.
 *   debug  — extra context for understanding logic in dev. Off in prod.
 *   info   — high-signal events: request started, payment processed,
 *            user signed in. The default level in production.
 *   warn   — recoverable problems: deprecated path hit, retried request,
 *            unusual input. Worth investigating later, not now.
 *   error  — unrecoverable: an operation failed and the user is affected.
 *            Pages someone if we ever wire alerting.
 *
 * Audit logging (compliance trail of admin actions) lives separately in
 * `src/lib/audit/log.ts` — it writes to the `admin_audit_log` DB table
 * with append-only triggers and survives user deletion. Don't try to
 * use this runtime logger as an audit trail; the two solve different
 * problems.
 *
 * Output:
 *   - `NODE_ENV !== 'production'` — pretty-printed single line, friendly
 *     for terminal reading
 *   - `NODE_ENV === 'production'` — JSON object per line, parseable by
 *     Vercel logs, Sentry, log drains
 *
 * Level control:
 *   - `LOG_LEVEL` env var. Defaults: `debug` in dev, `info` in prod.
 *   - Set `LOG_LEVEL=trace` to crank up. Set `LOG_LEVEL=error` to silence
 *     everything but failures (useful in load tests).
 *
 * PII handling:
 *   - All ctx and error payloads pass through `redactPII` before output.
 *   - Object keys matching password/secret/token/apikey/etc. → '<redacted>'
 *   - Email-shaped strings anywhere → 's***@domain.tld'
 *   - Internal IDs (UUIDs, numeric DB IDs) are NOT redacted — meaningless
 *     in isolation, useful for cross-referencing.
 */

import { redactPII } from './pii';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

export interface LogContext {
  /** Request correlation ID from middleware. */
  reqId?: string;
  /** Authenticated user, when known. UUID is fine — internal-only. */
  userId?: string;
  /** Route or operation namespace, e.g. '/api/identify' or 'billing.checkout'. */
  route?: string;
  /** Anything else relevant for the event. PII redacted automatically. */
  [key: string]: unknown;
}

interface LoggerWriter {
  write(line: string): void;
}

const consoleWriter: LoggerWriter = {
  write(line: string) {
    // We always go through console.log so Next/Vercel ingest the line via
    // the same path. Level is in the structured payload, not via
    // console.warn/error which can have different formatting.
    console.log(line);
  }
};

function resolveDefaultLevel(): LogLevel {
  const env = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) as LogLevel | undefined;
  if (env && env in LEVEL_PRIORITY) return env;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function isProduction(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
}

function formatPretty(level: LogLevel, msg: string, ctx: LogContext, ts: string): string {
  const { reqId, userId, route, ...rest } = ctx;
  const prefix = [
    `[${ts}]`,
    `[${level.toUpperCase().padEnd(5)}]`,
    reqId ? `req=${reqId}` : null,
    route ? `route=${route}` : null,
    userId ? `user=${userId.slice(0, 8)}…` : null
  ]
    .filter(Boolean)
    .join(' ');
  const restStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `${prefix}  ${msg}${restStr}`;
}

function formatJson(level: LogLevel, msg: string, ctx: LogContext, ts: string): string {
  return JSON.stringify({
    ts,
    level,
    msg,
    ...ctx
  });
}

/** Keys an error object carries. A plain object with only these is an error, not context. */
const FEILNOKLER = new Set([
  'name',
  'message',
  'code',
  'details',
  'hint',
  'stack',
  'status',
  'statusCode',
  'statusText',
  'cause',
  'error',
  'error_description',
  'errno',
  'syscall'
]);

/** At least one of these must be present for a plain object to count as an error. */
const FEILSIGNAL = ['message', 'code', 'details', 'hint', 'stack', 'error'];

function erVanligObjekt(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function erFeilformet(value: Record<string, unknown>): boolean {
  const nokler = Object.keys(value);
  return (
    nokler.length > 0 &&
    nokler.every((n) => FEILNOKLER.has(n)) &&
    FEILSIGNAL.some((n) => value[n] !== undefined && value[n] !== null)
  );
}

/** A plain object passed in the error position that is really context. */
function erKontekstobjekt(value: unknown): value is LogContext {
  return erVanligObjekt(value) && !erFeilformet(value);
}

/**
 * The `err` field for anything that is not undefined. Errors are kept as
 * they are (redactPII serialises them); other objects keep their own
 * fields so code/details/hint reach the log instead of `[object Object]`.
 */
function feilnyttelast(err: unknown): unknown {
  if (err instanceof Error) return err;
  if (err === null || typeof err !== 'object') {
    return { name: 'NonError', message: String(err) };
  }
  if (Array.isArray(err)) return { name: 'NonError', value: err };

  const felt: Record<string, unknown> = {};
  for (const [nokkel, verdi] of Object.entries(err as Record<string, unknown>)) {
    felt[nokkel] = verdi;
  }
  if (typeof felt.name !== 'string') felt.name = 'NonError';
  if (felt.message === undefined) {
    const tekst = String(err);
    if (tekst !== '[object Object]') felt.message = tekst;
  }
  return felt;
}

interface LoggerOptions {
  level?: LogLevel;
  baseContext?: LogContext;
  writer?: LoggerWriter;
}

export class Logger {
  private level: LogLevel;
  private baseContext: LogContext;
  private writer: LoggerWriter;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? resolveDefaultLevel();
    this.baseContext = opts.baseContext ?? {};
    this.writer = opts.writer ?? consoleWriter;
  }

  private isEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (!this.isEnabled(level)) return;

    const merged: LogContext = { ...this.baseContext, ...(ctx ?? {}) };
    const safe = redactPII(merged) as LogContext;
    const ts = new Date().toISOString();

    const line = isProduction() ? formatJson(level, msg, safe, ts) : formatPretty(level, msg, safe, ts);
    this.writer.write(line);
  }

  trace(msg: string, ctx?: LogContext): void {
    this.emit('trace', msg, ctx);
  }

  debug(msg: string, ctx?: LogContext): void {
    this.emit('debug', msg, ctx);
  }

  info(msg: string, ctx?: LogContext): void {
    this.emit('info', msg, ctx);
  }

  warn(msg: string, ctx?: LogContext): void {
    this.emit('warn', msg, ctx);
  }

  /**
   * Log an error event.
   *
   * The second argument is the error (an `Error`, a thrown value or a
   * Supabase/PostgREST error object) and the third is context. Many call
   * sites pass something else second, so it is normalised here instead of
   * at every call site — before this, anything that was not an `Error`
   * went through `String()` and the line said `[object Object]`:
   *
   *   • `Error` (also `PostgrestError`, which extends it) → `err` with
   *     name, message, stack and its own fields such as code/details/hint.
   *   • A plain object that only carries error fields (message, code,
   *     details, hint…) → `err` with those fields, `name: 'NonError'`.
   *   • Any other plain object, with no third argument → treated as the
   *     context it is (`log.error('x', { userId, message })`).
   *   • Any other non-Error object → `err` with its own fields.
   *   • A primitive → `err: { name: 'NonError', message: String(value) }`.
   *
   * Everything still passes through PII redaction in `emit`.
   */
  error(msg: string, err?: unknown, ctx?: LogContext): void {
    if (err === undefined) {
      this.emit('error', msg, ctx);
      return;
    }
    if (ctx === undefined && erKontekstobjekt(err)) {
      this.emit('error', msg, err);
      return;
    }
    this.emit('error', msg, { ...(ctx ?? {}), err: feilnyttelast(err) });
  }

  /**
   * Return a new logger with `additionalCtx` merged into baseContext. Use
   * for request-scoped or operation-scoped child loggers so you don't
   * have to pass reqId/userId through every call.
   */
  child(additionalCtx: LogContext): Logger {
    return new Logger({
      level: this.level,
      baseContext: { ...this.baseContext, ...additionalCtx },
      writer: this.writer
    });
  }

  /** Test/inspection only. */
  _getEffectiveLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Default singleton. Use this in 99% of cases. Use `logger.child(...)` to
 * scope a child logger to a request or operation.
 */
export const logger = new Logger();

/**
 * Test-only factory. Production code should use `logger`.
 */
export function _createTestLogger(opts: LoggerOptions): Logger {
  return new Logger(opts);
}
