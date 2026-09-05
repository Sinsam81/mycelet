import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let bruker: { id: string } | null = null;
let upserts: Array<{ rad: Record<string, unknown>; valg: Record<string, unknown> }> = [];
let upsertFeil: { message: string } | null = null;

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({ getClientKey: () => 'test', rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: bruker } }) },
    from: () => ({
      upsert: async (rad: Record<string, unknown>, valg: Record<string, unknown>) => {
        upserts.push({ rad, valg });
        return { error: upsertFeil };
      }
    })
  })
}));

import { POST } from '../route';

beforeEach(() => {
  bruker = { id: 'u1' };
  upserts = [];
  upsertFeil = null;
});

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/me/bruksdag', { method: 'POST', body: JSON.stringify(body) }));
}

describe('POST /api/me/bruksdag', () => {
  it('skriver én rad med serverens dag og brukerens id — aldri klientens', async () => {
    const res = await post({ flate: 'kart', user_id: 'noen-andre', dag: '1999-01-01' });
    expect(res.status).toBe(204);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].rad.user_id).toBe('u1');
    expect(upserts[0].rad.dag).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(upserts[0].rad.dag).not.toBe('1999-01-01');
    expect(upserts[0].rad).toMatchObject({ flate: 'kart', omrade: '' });
    expect(upserts[0].valg).toMatchObject({ ignoreDuplicates: true });
  });

  it('områdesiden krever ett av våre områder', async () => {
    expect((await post({ flate: 'omrade', omrade: 'bergen' })).status).toBe(204);
    expect(upserts[0].rad).toMatchObject({ flate: 'omrade', omrade: 'bergen' });
    expect((await post({ flate: 'omrade', omrade: '<script>' })).status).toBe(400);
    expect((await post({ flate: 'omrade' })).status).toBe(400);
    expect(upserts).toHaveLength(1);
  });

  it('området ignoreres for andre flater', async () => {
    await post({ flate: 'hjem', omrade: 'bergen' });
    expect(upserts[0].rad.omrade).toBe('');
  });

  it('avviser ukjent flate og manglende innlogging', async () => {
    expect((await post({ flate: 'profil' })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect((await post('tekst')).status).toBe(400);
    bruker = null;
    expect((await post({ flate: 'kart' })).status).toBe(401);
    expect(upserts).toHaveLength(0);
  });

  it('en databasefeil stopper ikke svaret — målingen er aldri produktets problem', async () => {
    upsertFeil = { message: 'relation "bruksdager" does not exist' };
    expect((await post({ flate: 'kart' })).status).toBe(204);
  });
});
