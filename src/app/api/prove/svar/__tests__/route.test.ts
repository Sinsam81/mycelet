import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Ett trykk fra e-posten, uten innlogging: gyldig token og valg → raden
 * skrives og «Takk» vises på lenkas språk. Tuklet token, ukjent valg eller
 * en lenke lenge etter prøveslutt → ingenting skrives.
 */

const BRUKER = '11111111-2222-4333-8444-555555555555';
const HEMMELIG = 'test-tjenestenokkel';

const db = {
  upserts: [] as Array<{ rad: Record<string, unknown>; valg: Record<string, unknown> }>,
  feil: null as { message: string } | null
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (rad: Record<string, unknown>, valg: Record<string, unknown>) => {
        db.upserts.push({ rad, valg });
        return { error: db.feil };
      }
    })
  })
}));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({ getClientKey: () => 'test', rateLimitResponse: () => new Response(null, { status: 429 }) }));

const { GET, SVAR_FRIST_DAGER } = await import('../route');
const { lagProveSvarToken } = await import('@/lib/billing/prove-svar-token');

function kall(query: string) {
  return GET(new NextRequest(`https://www.mycelet.com/api/prove/svar?${query}`));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));
  process.env.SUPABASE_SERVICE_ROLE_KEY = HEMMELIG;
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
  db.upserts = [];
  db.feil = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/prove/svar', () => {
  const token = () => lagProveSvarToken(BRUKER, '2026-09-27', HEMMELIG);

  it('gyldig token og valg: skriver svaret og viser «Takk» på norsk', async () => {
    const res = await kall(`t=${token()}&valg=offline&sprak=nb`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<html lang="nb">');
    expect(html).toContain('Takk!');
    expect(html).toContain('href="https://www.mycelet.com"');
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].rad).toMatchObject({ user_id: BRUKER, prove_slutt: '2026-09-27', valg: 'offline', svart_at: '2026-09-25T10:00:00.000Z' });
    expect(db.upserts[0].valg).toEqual({ onConflict: 'user_id,prove_slutt' });
  });

  it('svensk lenke gir svensk side', async () => {
    const res = await kall(`t=${token()}&valg=ai&sprak=sv`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Tack!');
    expect(html).not.toContain('Takk!');
  });

  it('ukjent språk faller tilbake på norsk', async () => {
    const html = await (await kall(`t=${token()}&valg=omrader&sprak=en`)).text();
    expect(html).toContain('<html lang="nb">');
  });

  it('tuklet token: 400, ingenting skrives', async () => {
    const [id, dato, sig] = token().split('.');
    const annen = `22222222-2222-4333-8444-555555555555.${dato}.${sig}`;
    expect((await kall(`t=${annen}&valg=offline`)).status).toBe(400);
    const vippet = `${id}.${dato}.${(sig[0] === '0' ? '1' : '0') + sig.slice(1)}`;
    expect((await kall(`t=${vippet}&valg=offline`)).status).toBe(400);
    expect((await kall('t=tull&valg=offline')).status).toBe(400);
    expect((await kall('valg=offline')).status).toBe(400);
    expect(db.upserts).toEqual([]);
    const html = await (await kall(`t=${annen}&valg=offline`)).text();
    expect(html).toContain('Lenken virker ikke');
  });

  it('ukjent valg: 400, ingenting skrives', async () => {
    expect((await kall(`t=${token()}&valg=annet`)).status).toBe(400);
    expect((await kall(`t=${token()}`)).status).toBe(400);
    expect(db.upserts).toEqual([]);
  });

  it(`lenke mer enn ${SVAR_FRIST_DAGER} dager etter prøveslutt: 410, ingenting skrives`, async () => {
    const gammel = lagProveSvarToken(BRUKER, '2026-08-01', HEMMELIG);
    const res = await kall(`t=${gammel}&valg=offline`);
    expect(res.status).toBe(410);
    expect(db.upserts).toEqual([]);
    // Nøyaktig på fristen går fortsatt.
    vi.setSystemTime(new Date('2026-10-27T10:00:00.000Z'));
    expect((await kall(`t=${token()}&valg=offline`)).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    expect((await kall(`t=${token()}&valg=offline`)).status).toBe(410);
  });

  it('lagringen feiler: siden sier det, ikke «takk»', async () => {
    db.feil = { message: 'nede' };
    const res = await kall(`t=${token()}&valg=offline`);
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain('Vi fikk ikke lagret svaret');
    expect(html).not.toContain('Takk!');
  });

  it('uten tjenestenøkkel kan ingen lenke leses: 500, ingenting skrives', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await kall(`t=${token()}&valg=offline`)).status).toBe(500);
    expect(db.upserts).toEqual([]);
  });
});
