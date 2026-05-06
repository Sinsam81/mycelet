import { describe, expect, it } from 'vitest';
import { maskEmail, redactPII } from '../pii';

describe('maskEmail', () => {
  it('masks the local part to first char + asterisks', () => {
    expect(maskEmail('sindre.alstad@gmail.com')).toBe('s***@gmail.com');
  });

  it('keeps single-char locals readable but still masked', () => {
    expect(maskEmail('a@x.no')).toBe('a***@x.no');
  });

  it('passes through strings that are not emails', () => {
    expect(maskEmail('not an email')).toBe('not an email');
    expect(maskEmail('@only-at')).toBe('@only-at');
    expect(maskEmail('')).toBe('');
  });
});

describe('redactPII', () => {
  it('redacts known sensitive keys regardless of case', () => {
    const out = redactPII({
      password: 'hunter2',
      apiKey: 'plant-id-key-123',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_xyz',
      stripe_webhook_secret: 'whsec_abc',
      message: 'a normal field'
    }) as Record<string, unknown>;

    expect(out.password).toBe('<redacted>');
    expect(out.apiKey).toBe('<redacted>');
    expect(out.SUPABASE_SERVICE_ROLE_KEY).toBe('<redacted>');
    expect(out.stripe_webhook_secret).toBe('<redacted>');
    expect(out.message).toBe('a normal field');
  });

  it('masks email addresses anywhere in strings', () => {
    const out = redactPII({
      msg: 'User sindre.alstad@gmail.com signed in',
      list: ['ab@x.no logged out']
    }) as Record<string, unknown>;

    expect(out.msg).toBe('User s***@gmail.com signed in');
    expect((out.list as string[])[0]).toBe('a***@x.no logged out');
  });

  it('walks nested structures', () => {
    const out = redactPII({
      user: {
        email: 'a@b.no',
        auth: { authorization: 'Bearer abc', publicId: 'OK' }
      }
    }) as Record<string, unknown>;

    const user = out.user as Record<string, unknown>;
    expect(user.email).toBe('a***@b.no');
    const auth = user.auth as Record<string, unknown>;
    expect(auth.authorization).toBe('<redacted>');
    expect(auth.publicId).toBe('OK');
  });

  it('redacts entire object when parent key matches a sensitive pattern', () => {
    // Parent key "secrets" itself matches "secret" → entire subtree
    // collapses to <redacted>. Documented behavior; consumers should
    // not rely on partial introspection of redacted subtrees.
    const out = redactPII({ secrets: { foo: 'bar' } }) as Record<string, unknown>;
    expect(out.secrets).toBe('<redacted>');
  });

  it('serializes Errors with name/message/stack and redacts within', () => {
    const e = new Error('Failed for sindre@x.no');
    const out = redactPII(e) as Record<string, unknown>;
    expect(out.name).toBe('Error');
    expect(out.message).toBe('Failed for s***@x.no');
    expect(typeof out.stack === 'string' || out.stack === undefined).toBe(true);
  });

  it('handles cycles without infinite-looping', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', a };
    a.b = b; // cycle
    const out = redactPII(a) as Record<string, unknown>;
    // Either side of the cycle should resolve to '<cycle>' marker
    expect(JSON.stringify(out)).toContain('<cycle>');
  });

  it('passes through primitives and null', () => {
    expect(redactPII(null)).toBe(null);
    expect(redactPII(undefined)).toBe(undefined);
    expect(redactPII(42)).toBe(42);
    expect(redactPII(true)).toBe(true);
  });

  it('preserves UUIDs and numeric IDs (internal-only, not PII)', () => {
    const out = redactPII({
      userId: '8e23c7b6-6d4c-4357-a118-3f3554c41caf',
      speciesId: 7
    }) as Record<string, unknown>;
    expect(out.userId).toBe('8e23c7b6-6d4c-4357-a118-3f3554c41caf');
    expect(out.speciesId).toBe(7);
  });
});
