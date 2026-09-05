import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Bekreftelseslenka skal bare gjøre ÉN ting: bekrefte en rad som venter.
 * Før satte den active=true på enhver rad med tokenet — også en avmeldt —
 * så en gammel lenke i innboksen (eller en e-postskanner) gjenopptok
 * abonnementer folk hadde sagt opp. Funnet i den eksterne gjennomgangen
 * 2026-09-05.
 */

let rad: Record<string, unknown> | null = null;
let oppdateringer: Array<{ payload: Record<string, unknown>; filtre: Array<[string, string, unknown]> }> = [];

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rad, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        const filtre: Array<[string, string, unknown]> = [];
        oppdateringer.push({ payload, filtre });
        const b = {
          eq: (k: string, v: unknown) => (filtre.push(['eq', k, v]), b),
          is: (k: string, v: unknown) => (filtre.push(['is', k, v]), b),
          then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r)
        };
        return b;
      }
    })
  })
}));

import { GET } from '../route';

const TOKEN = '11111111-2222-4333-8444-555555555555';
async function klikk() {
  const res = await GET(new NextRequest(`http://localhost/api/soppvarsel/bekreft?t=${TOKEN}`));
  return new URL(res.headers.get('location') ?? '').searchParams.get('status');
}

beforeEach(() => {
  rad = null;
  oppdateringer = [];
});

describe('bekreft', () => {
  it('bekrefter en rad som venter — og setter hopp-markøren så webmail-verten ikke blir kilde', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    const res = await GET(new NextRequest(`http://localhost/api/soppvarsel/bekreft?t=${TOKEN}`));
    expect(res.headers.get('set-cookie')).toContain('mycelet_hopp=1');
    // Kvitteringen er områdesiden, ikke et tomt takk-skjema.
    expect(res.headers.get('location')).toContain('/soppforhold/oslo?status=bekreftet');
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    oppdateringer = [];
    expect(await klikk()).toBe('bekreftet');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0].payload).toMatchObject({ active: true });
    expect(oppdateringer[0].filtre).toContainEqual(['is', 'confirmed_at', null]);
  });

  it('gjenopptar ALDRI en avmeldt rad — gammel lenke er død', async () => {
    rad = { id: 'r1', region: 'Oslo', active: false, confirmed_at: '2026-08-01T00:00:00Z', user_id: null };
    expect(await klikk()).toBe('ugyldig-lenke');
    expect(oppdateringer).toHaveLength(0);
  });

  it('er idempotent for en allerede bekreftet, aktiv rad — uten å re-stemple samtykketidspunktet', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: '2026-08-01T00:00:00Z', user_id: null };
    expect(await klikk()).toBe('bekreftet');
    expect(oppdateringer).toHaveLength(0);
  });

  it('avviser kontorader og ukjente tokens', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: 'bruker' };
    expect(await klikk()).toBe('ugyldig-lenke');
    rad = null;
    expect(await klikk()).toBe('ugyldig-lenke');
    expect(oppdateringer).toHaveLength(0);
  });
});
