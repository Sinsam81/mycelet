import { describe, expect, it, beforeEach, vi } from 'vitest';
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
    log.info('user.signin', { email: 'sindre@x.no', apiKey: 'secret-123' });

    const out = captured.lines[0].line;
    expect(out).not.toContain('sindre@x.no');
    expect(out).toContain('s***@x.no');
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
});
