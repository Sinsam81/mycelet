import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { PostgrestError } from '@supabase/postgrest-js';
import { _createTestLogger } from '../index';

interface CapturedLine {
  line: string;
}

function makeWriter(): { writer: { write: (line: string) => void }; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  return {
    writer: {
      write(line: string) {
        lines.push({ line });
      }
    },
    lines
  };
}

describe('Logger', () => {
  let captured: ReturnType<typeof makeWriter>;

  beforeEach(() => {
    captured = makeWriter();
  });

  it('emits at the configured level and above', () => {
    const log = _createTestLogger({ level: 'info', writer: captured.writer });
    log.trace('trace-msg');
    log.debug('debug-msg');
    log.info('info-msg');
    log.warn('warn-msg');
    log.error('error-msg');

    expect(captured.lines.length).toBe(3);
    expect(captured.lines[0].line).toContain('info-msg');
    expect(captured.lines[1].line).toContain('warn-msg');
    expect(captured.lines[2].line).toContain('error-msg');
  });

  it('silences everything below the threshold', () => {
    const log = _createTestLogger({ level: 'error', writer: captured.writer });
    log.info('not-shown');
    log.warn('also-not-shown');
    log.error('shown');

    expect(captured.lines.length).toBe(1);
    expect(captured.lines[0].line).toContain('shown');
  });

  it('redacts PII automatically in context', () => {
    const log = _createTestLogger({ level: 'info', writer: captured.writer });
    log.info('user.signin', { email: 'ola@x.no', apiKey: 'secret-123' });

    const out = captured.lines[0].line;
    expect(out).not.toContain('ola@x.no');
    expect(out).toContain('o***@x.no');
    expect(out).not.toContain('secret-123');
    expect(out).toContain('<redacted>');
  });

  it('child loggers inherit base context and merge new fields', () => {
    const root = _createTestLogger({ level: 'info', writer: captured.writer });
    const reqLog = root.child({ reqId: 'abc123', route: '/api/test' });
    reqLog.info('event.fired', { extra: 'data' });

    const out = captured.lines[0].line;
    expect(out).toContain('abc123');
    expect(out).toContain('/api/test');
    expect(out).toContain('extra');
  });

  it('child of child stacks context', () => {
    const root = _createTestLogger({ level: 'info', writer: captured.writer });
    const reqLog = root.child({ reqId: 'r1' });
    // Use realistic UUID — pretty-print formatter truncates to 8 chars +
    // ellipsis for readability, so check for the prefix that would appear.
    const userLog = reqLog.child({ userId: '8e23c7b6-6d4c-4357-a118-3f3554c41caf' });
    userLog.info('msg');

    const out = captured.lines[0].line;
    expect(out).toContain('r1');
    expect(out).toContain('8e23c7b6');
  });

  it('serializes Error objects on log.error', () => {
    const log = _createTestLogger({ level: 'error', writer: captured.writer });
    log.error('something.failed', new Error('boom'));

    const out = captured.lines[0].line;
    expect(out).toContain('boom');
    expect(out).toContain('Error');
  });

  it('handles non-Error thrown values gracefully', () => {
    const log = _createTestLogger({ level: 'error', writer: captured.writer });
    log.error('weird.failure', 'just a string');

    const out = captured.lines[0].line;
    expect(out).toContain('NonError');
    expect(out).toContain('just a string');
  });

  it('emits trace level when configured', () => {
    const log = _createTestLogger({ level: 'trace', writer: captured.writer });
    log.trace('flow.step.1', { detail: 'a' });
    log.trace('flow.step.2', { detail: 'b' });
    expect(captured.lines.length).toBe(2);
  });

  it('produces JSON output in production NODE_ENV', () => {
    // process.env.NODE_ENV is typed as readonly in TS, so use vi.stubEnv
    // which is vitest's supported way of mutating env in tests.
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const log = _createTestLogger({ level: 'info', writer: captured.writer });
      log.info('json.format', { foo: 'bar' });

      const out = captured.lines[0].line;
      const parsed = JSON.parse(out);
      expect(parsed.level).toBe('info');
      expect(parsed.msg).toBe('json.format');
      expect(parsed.foo).toBe('bar');
      expect(typeof parsed.ts).toBe('string');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('log.error with something other than an Error second', () => {
    // Real logger, both output formats: the point is what reaches the line.
    for (const format of ['dev', 'prod'] as const) {
      describe(format, () => {
        beforeEach(() => {
          if (format === 'prod') vi.stubEnv('NODE_ENV', 'production');
          else vi.stubEnv('NODE_ENV', 'development');
        });
        afterEach(() => {
          vi.unstubAllEnvs();
        });

        function linje(): string {
          return captured.lines[0].line;
        }
        function felter(): Record<string, unknown> {
          const l = linje();
          if (format === 'prod') return JSON.parse(l);
          const start = l.indexOf('{');
          return start >= 0 ? JSON.parse(l.slice(start)) : {};
        }

        it('writes the fields of a plain PostgREST error object, never [object Object]', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          log.error('db.failed', {
            message: 'new row violates row-level security policy',
            code: '42501',
            details: null,
            hint: 'check the policy'
          });
          expect(linje()).not.toContain('[object Object]');
          const err = felter().err as Record<string, unknown>;
          expect(err.code).toBe('42501');
          expect(err.message).toBe('new row violates row-level security policy');
          expect(err.hint).toBe('check the policy');
          expect(err.name).toBe('NonError');
        });

        it('keeps code/details/hint of a real PostgrestError (it extends Error)', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          const feil = new PostgrestError({
            message: 'relation does not exist',
            details: 'det@x.no asked',
            hint: 'run the migration',
            code: 'PGRST205'
          });
          log.error('db.failed', feil, { table: 'bruksdager' });
          const f = felter();
          const err = f.err as Record<string, unknown>;
          expect(err.code).toBe('PGRST205');
          expect(err.hint).toBe('run the migration');
          expect(err.message).toBe('relation does not exist');
          expect(err.details).toBe('d***@x.no asked');
          expect(f.table).toBe('bruksdager');
        });

        it('treats a plain context object passed second as context', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          log.error('home.user_findings_failed', {
            userId: '8e23c7b6-6d4c-4357-a118-3f3554c41caf',
            message: 'timeout',
            email: 'ola@x.no',
            token: 'hemmelig-123'
          });
          const l = linje();
          expect(l).not.toContain('[object Object]');
          expect(l).not.toContain('NonError');
          expect(l).not.toContain('ola@x.no');
          expect(l).not.toContain('hemmelig-123');
          expect(l).toContain('o***@x.no');
          expect(l).toContain('timeout');
          if (format === 'prod') {
            const f = felter();
            expect(f.userId).toBe('8e23c7b6-6d4c-4357-a118-3f3554c41caf');
            expect(f.message).toBe('timeout');
            expect(f.err).toBeUndefined();
          } else {
            expect(l).toContain('user=8e23c7b6');
          }
        });

        it('writes an error object with context given third, redacted', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          log.error('xpost.failed', { message: 'Bearer abcdefghijklmnop failed for kari@y.se', code: 401 }, { type: 'flip' });
          const l = linje();
          expect(l).not.toContain('abcdefghijklmnop');
          expect(l).not.toContain('kari@y.se');
          const f = felter();
          expect(f.type).toBe('flip');
          expect((f.err as Record<string, unknown>).code).toBe(401);
        });

        it('keeps the cause of a wrapped Error', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          const indre = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
          log.error('fetch.failed', new Error('fetch failed', { cause: indre }));
          const err = felter().err as Record<string, unknown>;
          expect(err.message).toBe('fetch failed');
          expect((err.cause as Record<string, unknown>).code).toBe('ECONNRESET');
        });

        it('survives an Error whose cause points back at itself', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          const e = new Error('loop') as Error & { cause?: unknown };
          e.cause = e;
          log.error('loop.failed', e);
          // The err field, not the line: the event name 'loop.failed' contains 'loop' too.
          expect((felter().err as Record<string, unknown>).message).toBe('loop');
        });

        it('still writes null and numbers as NonError', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          // The err field, not the whole line: the line also carries the real
          // timestamp, which contains '42' about one run in twenty, and a
          // dropped payload would still leave 'null' in it as "err":null.
          log.error('weird', null);
          expect(felter().err).toMatchObject({ name: 'NonError', message: 'null' });
          captured.lines.length = 0; // felter() reads the first line
          log.error('weird', 42);
          expect(felter().err).toMatchObject({ name: 'NonError', message: '42' });
        });

        it('keeps context alone when no error is given', () => {
          const log = _createTestLogger({ level: 'error', writer: captured.writer });
          log.error('plain', undefined, { region: 'oslo' });
          const l = linje();
          expect(l).toContain('oslo');
          expect(l).not.toContain('NonError');
        });
      });
    }
  });
});
