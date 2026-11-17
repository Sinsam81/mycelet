import { describe, expect, it } from 'vitest';
import { MAX_STRING_LENGTH, maskEmail, redactPII } from '../pii';

describe('maskEmail', () => {
  it('masks the local part to first char + asterisks', () => {
    expect(maskEmail('ola.nordmann@example.com')).toBe('o***@example.com');
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
      msg: 'User ola.nordmann@example.com signed in',
      list: ['ab@x.no logged out']
    }) as Record<string, unknown>;

    expect(out.msg).toBe('User o***@example.com signed in');
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
    const e = new Error('Failed for ola@x.no');
    const out = redactPII(e) as Record<string, unknown>;
    expect(out.name).toBe('Error');
    expect(out.message).toBe('Failed for o***@x.no');
    expect(typeof out.stack === 'string' || out.stack === undefined).toBe(true);
  });

  it('keeps only the allowlisted own fields of an Error, never a body, a header or a request', () => {
    // Library errors carry more than the caller sees: Stripe keeps the raw
    // webhook body and the signature header, HTTP clients keep the request
    // and the response. Only the fields that explain a failure come along.
    const e = Object.assign(new Error('upstream failed'), {
      code: 'E_UPSTREAM',
      status: 502,
      details: 'for ola@x.no',
      payload: '{"name":"Kari Nordmann"}',
      header: 't=1,v1=00',
      request: { body: 'kropp' },
      response: { data: 'svar' },
      config: { url: 'https://example.com' },
      raw: { message: 'raw' }
    });
    const out = redactPII(e) as Record<string, unknown>;
    expect(out.code).toBe('E_UPSTREAM');
    expect(out.status).toBe(502);
    expect(out.details).toBe('for o***@x.no');
    for (const key of ['payload', 'header', 'request', 'response', 'config', 'raw']) {
      expect(out).not.toHaveProperty(key);
    }
    expect(JSON.stringify(out)).not.toContain('Kari Nordmann');
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

  it('redacts header-style keys with a hyphen (Api-Key, X-Api-Key)', () => {
    // Kindwise-kallet setter headeren nøyaktig slik: 'Api-Key'. Før normali-
    // seringen slapp den gjennom fordi «api-key» ikke inneholder «apikey».
    const out = redactPII({
      'Api-Key': 'kw_live_abc123def456',
      'X-Api-Key': 'kw_live_abc123def456',
      'set-cookie': 'sb-access-token=abc',
      publicId: 'OK'
    }) as Record<string, unknown>;

    expect(out['Api-Key']).toBe('<redacted>');
    expect(out['X-Api-Key']).toBe('<redacted>');
    expect(out['set-cookie']).toBe('<redacted>');
    expect(out.publicId).toBe('OK');
  });

  it('redacts secrets that appear as a VALUE under an unknown key', () => {
    const out = redactPII({
      header: 'Bearer sk_live_abc123def456',
      note: 'used sk_live_51Hxxxxxxxxxxxxxxxxx while debugging',
      hook: 'whsec_abcdef123456',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'
    }) as Record<string, unknown>;

    expect(out.header).toBe('Bearer <redacted>');
    expect(out.note).toBe('used <redacted> while debugging');
    expect(out.hook).toBe('<redacted>');
    expect(out.jwt).toBe('<redacted>');
  });

  it('leaves ordinary prose and identifiers alone', () => {
    const out = redactPII({
      msg: 'Kantarell funnet i Bærumsmarka, 3 stk',
      reqId: 'req_01HZY3',
      route: '/api/identify',
      species: 'Cantharellus cibarius'
    }) as Record<string, unknown>;

    expect(out.msg).toBe('Kantarell funnet i Bærumsmarka, 3 stk');
    expect(out.reqId).toBe('req_01HZY3');
    expect(out.route).toBe('/api/identify');
    expect(out.species).toBe('Cantharellus cibarius');
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

describe('redactPII on a long string', () => {
  it('leaves a string at the cap alone, and cuts a longer one saying how long it was', () => {
    const atCap = 'ord '.repeat(MAX_STRING_LENGTH / 4);
    expect(redactPII(atCap)).toBe(atCap);

    const longer = 'ord '.repeat(5_000);
    expect(redactPII(longer)).toBe(`${atCap}…<truncated: 20000 chars>`);
  });

  it('still masks what it keeps', () => {
    const text = `kari@y.se ${'x'.repeat(20_000)}`;
    expect(redactPII(text)).toBe(`k***@y.se …<truncated: ${text.length} chars>`);
  });

  it('never cuts an address or a token in half — half of one is no longer recognised and would stand in clear', () => {
    // The cut falls inside the domain of the address (EMAIL_REGEX needs the
    // «.tld»), and inside the claims part of the JWT (the rule needs all
    // three parts). Cut there, «ola.nordmann» and the start of the claims
    // would be written as they are.
    for (const [secret, into] of [
      ['ola.nordmann@example.com', 16],
      ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl', 26]
    ] as const) {
      const before = 'x '.repeat((MAX_STRING_LENGTH - into) / 2);
      const text = `${before}${secret} ${'y'.repeat(20_000)}`;
      expect(text.slice(MAX_STRING_LENGTH - into, MAX_STRING_LENGTH)).toBe(secret.slice(0, into));

      const out = redactPII(text) as string;
      expect(out).not.toContain(secret.slice(0, into));
      expect(out).toBe(`${before}…<truncated: ${text.length} chars>`);
    }
  });
});
