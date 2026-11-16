import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Banneret om automatisk sletting spør denne ruta på hver sidevisning.
 *
 * En databasefeil ble sendt som `error.message` rett til nettleseren, og ble
 * ikke logget noe sted.
 */

const s = vi.hoisted(() => ({
  sprak: 'nb' as 'nb' | 'sv',
  bruker: { id: 'bruker-1' } as { id: string } | null,
  rad: null as { warned_at: string; scheduled_deletion_at: string } | null,
  feil: null as { code?: string; message: string } | null,
  logg: [] as Array<{ hendelse: string; ctx: unknown }>
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => s.sprak }));
vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    error: (hendelse: string, _err: unknown, ctx: unknown) => s.logg.push({ hendelse, ctx }),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: s.bruker } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: s.feil ? null : s.rad, error: s.feil })
        })
      })
    })
  })
}));

const { GET } = await import('../route');

const kall = () => GET(new NextRequest('https://mycelet.com/api/me/deletion-warning'));

beforeEach(() => {
  s.sprak = 'nb';
  s.bruker = { id: 'bruker-1' };
  s.rad = null;
  s.feil = null;
  s.logg = [];
});

describe('GET /api/me/deletion-warning', () => {
  it('ingen planlagt sletting: { warning: null }', async () => {
    const res = await kall();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ warning: null });
  });

  it('planlagt sletting: datoene banneret trenger', async () => {
    s.rad = { warned_at: '2026-11-01T00:00:00Z', scheduled_deletion_at: '2026-12-01T00:00:00Z' };
    expect(await (await kall()).json()).toEqual({
      warning: { warnedAt: '2026-11-01T00:00:00Z', scheduledDeletionAt: '2026-12-01T00:00:00Z' }
    });
  });

  it('uten innlogging: 401 med kode', async () => {
    s.bruker = null;
    const res = await kall();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthenticated');
  });

  it('en databasefeil gir en oversatt feil — databasens tekst står i loggen, ikke i svaret', async () => {
    s.feil = { code: '42501', message: 'permission denied for table account_deletion_warnings' };
    s.sprak = 'sv';
    const res = await kall();
    expect(res.status).toBe(500);
    const tekst = await res.text();
    expect(JSON.parse(tekst)).toEqual({ error: 'Något gick fel. Försök igen om en stund.', code: 'unexpected' });
    expect(tekst).not.toContain('permission denied');
    expect(tekst).not.toContain('account_deletion_warnings');
    expect(s.logg).toEqual([
      {
        hendelse: 'me.deletion_warning.read_failed',
        ctx: { code: '42501', message: 'permission denied for table account_deletion_warnings' }
      }
    ]);
  });
});

/**
 * Vakta for «migrasjon 011 er ikke kjørt» lette etter Postgres' ordlyd
 * («relation … does not exist») i meldingen. PostgREST svarer med koden
 * PGRST205 og en helt annen setning, så vakta kunne aldri slå til.
 */
describe('GET /api/me/deletion-warning når tabellen mangler', () => {
  it('PostgREST sin PGRST205 leses som «ingen varsel» — banneret holder seg skjult', async () => {
    s.feil = {
      code: 'PGRST205',
      message: "Could not find the table 'public.account_deletion_warnings' in the schema cache"
    };
    const res = await kall();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ warning: null });
    // En manglende tabell er en kjent tilstand, ikke en feil å logge per sidevisning.
    expect(s.logg).toEqual([]);
  });

  it('Postgres sin 42P01 leses likt', async () => {
    s.feil = { code: '42P01', message: 'relation "public.account_deletion_warnings" does not exist' };
    expect(await (await kall()).json()).toEqual({ warning: null });
  });

  it('avgjøres av koden, ikke av ordlyden', async () => {
    // Samme setning som før slo ut vakta, men med en kode som betyr noe annet.
    s.feil = { code: '42501', message: 'relation "x" does not exist' };
    expect((await kall()).status).toBe(500);
  });
});
