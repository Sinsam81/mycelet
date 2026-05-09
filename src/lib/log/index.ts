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
    // eslint-disable-next-line no-console
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
   * Log an error event. The error object (or unknown thrown value) is
   * serialized into the `err` field with name + message + stack, also
   * passed through PII redaction.
   */
  error(msg: string, err?: unknown, ctx?: LogContext): void {
    const errPayload = err instanceof Error ? err : err !== undefined ? { name: 'NonError', message: String(err) } : undefined;
    this.emit('error', msg, { ...(ctx ?? {}), err: errPayload });
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
