import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * «Behold konto» i banneret om automatisk sletting.
 *
 * To ting gikk til nettleseren som ikke skulle dit: bekreftelsen var
 * hardkodet norsk (en svensk bruker fikk «Sletting av kontoen din er avbrutt.»
 * på den vellykkede stien, selv om sv.json har teksten), og en databasefeil
 * ble sendt som `error.message` — Postgres på engelsk, i en toast.
 */

const s = vi.hoisted(() => ({
  sprak: 'nb' as 'nb' | 'sv',
  bruker: { id: 'bruker-1' } as { id: string } | null,
  slettet: [] as Array<{ user_id: string }>,
  feil: null as { code: string; message: string } | null,
  logg: [] as Array<{ hendelse: string; err: unknown; ctx: unknown }>
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => s.sprak }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({
  getClientKey: () => 'test',
  rateLimitResponse: () => new Response(null, { status: 429 })
}));
vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    error: (hendelse: string, err: unknown, ctx: unknown) => s.logg.push({ hendelse, err, ctx }),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: s.bruker } }) },
    from: () => ({
      delete: () => ({
        eq: () => ({
          select: async () => ({ data: s.feil ? null : s.slettet, error: s.feil })
        })
      })
    })
  })
}));

const { POST } = await import('../route');

const kall = () => POST(new NextRequest('https://mycelet.com/api/me/extend-retention', { method: 'POST' }));

beforeEach(() => {
  s.sprak = 'nb';
  s.bruker = { id: 'bruker-1' };
  s.slettet = [{ user_id: 'bruker-1' }];
  s.feil = null;
  s.logg = [];
});

describe('POST /api/me/extend-retention', () => {
  it('avbryter slettingen og bekrefter på norsk', async () => {
    const res = await kall();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cleared: true, message: 'Sletting av kontoen din er avbrutt.' });
  });

  it('en svensk bruker får bekreftelsen på svensk — den samme som sv.json har', async () => {
    const sv = (await import('../../../../../../messages/sv.json')).default;
    s.sprak = 'sv';
    const body = await (await kall()).json();
    expect(body.cleared).toBe(true);
    expect(body.message).toBe(sv.RetentionWarningBanner.cancelSuccess);
  });

  it('sier fra når det ikke fantes noen planlagt sletting — på leserens språk', async () => {
    s.slettet = [];
    expect((await (await kall()).json()).message).toMatch(/ikke planlagt slettet/);
    s.sprak = 'sv';
    const body = await (await kall()).json();
    expect(body).toMatchObject({ ok: true, cleared: false });
    expect(body.message).toMatch(/inte schemalagt att raderas/);
  });

  it('en databasefeil gir en oversatt feil med kode — aldri databasens egen melding', async () => {
    s.feil = { code: '42501', message: 'permission denied for table account_deletion_warnings' };
    s.sprak = 'sv';
    const res = await kall();
    expect(res.status).toBe(500);
    const tekst = await res.text();
    expect(JSON.parse(tekst)).toEqual({
      error: 'Kunde inte avbryta raderingen. Försök igen.',
      code: 'retention_cancel_failed'
    });
    expect(tekst).not.toContain('permission denied');
    expect(tekst).not.toContain('account_deletion_warnings');
  });

  it('… men den rå feilen står i loggen, med kode og melding', async () => {
    s.feil = { code: '42501', message: 'permission denied for table account_deletion_warnings' };
    await kall();
    expect(s.logg).toEqual([
      {
        hendelse: 'me.extend_retention.delete_failed',
        err: undefined,
        ctx: { code: '42501', message: 'permission denied for table account_deletion_warnings' }
      }
    ]);
  });

  it('uten innlogging: 401 med kode', async () => {
    s.bruker = null;
    const res = await kall();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthenticated');
  });
});
