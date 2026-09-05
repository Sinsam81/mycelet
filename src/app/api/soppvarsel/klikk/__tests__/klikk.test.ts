import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let rad: Record<string, unknown> | null = null;
let oppdateringer: Array<Record<string, unknown>> = [];

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({ getClientKey: () => 'test' }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rad, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        oppdateringer.push(payload);
        return { eq: async () => ({ error: null }) };
      }
    })
  })
}));

import { GET } from '../route';

const TOKEN = '11111111-2222-4333-8444-555555555555';
const NAA = Date.now();
beforeEach(() => {
  rad = null;
  oppdateringer = [];
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
});

async function klikk(r = 'bergen', t = TOKEN, s?: number) {
  const res = await GET(new NextRequest(`http://localhost/api/soppvarsel/klikk?t=${t}&r=${r}${s ? `&s=${s}` : ''}`));
  return res;
}

describe('varselklikk', () => {
  it('menneskeklikk (≥ 10 min etter utsending) setter forste_apnet_at og sender videre til området', async () => {
    rad = { last_notified_at: new Date(NAA - 3 * 3600_000).toISOString(), forste_apnet_at: null };
    const res = await klikk();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppforhold/bergen');
    expect(res.headers.get('set-cookie')).toContain('mycelet_hopp=1');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0]).toHaveProperty('sist_apnet_at');
    expect(oppdateringer[0]).toHaveProperty('forste_apnet_at');
  });

  it('skannerklikk (2 min etter utsending) noteres bare som sist_apnet_at — låser aldri raden', async () => {
    rad = { last_notified_at: new Date(NAA - 2 * 60_000).toISOString(), forste_apnet_at: null };
    await klikk();
    expect(oppdateringer[0]).toHaveProperty('sist_apnet_at');
    expect(oppdateringer[0]).not.toHaveProperty('forste_apnet_at');
  });

  it('forste_apnet_at overskrives aldri', async () => {
    rad = { last_notified_at: new Date(NAA - 3 * 3600_000).toISOString(), forste_apnet_at: '2026-08-01T00:00:00Z' };
    await klikk();
    expect(oppdateringer[0]).not.toHaveProperty('forste_apnet_at');
  });

  it('ukjent token: samme videresending, ingen skriving', async () => {
    const res = await klikk('oslo', 'ikke-en-uuid');
    expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppforhold/oslo');
    expect(oppdateringer).toHaveLength(0);
  });

  it('ukjent område faller tilbake til oversikten', async () => {
    rad = null;
    const res = await klikk('atlantis');
    expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppforhold');
    expect(oppdateringer).toHaveLength(0);
  });

  it('utsendingstidspunktet i lenka (&s=) vinner over last_notified_at — som kan være rullet tilbake', async () => {
    // Raden sier «åtte dager siden» (tilbakerullet etter feilet sending); lenka sier «for 30 sekunder siden».
    rad = { last_notified_at: new Date(NAA - 8 * 86_400_000).toISOString(), forste_apnet_at: null };
    await klikk('bergen', TOKEN, Math.floor((NAA - 30_000) / 1000));
    expect(oppdateringer[0]).not.toHaveProperty('forste_apnet_at');
    oppdateringer = [];
    await klikk('bergen', TOKEN, Math.floor((NAA - 3 * 3600_000) / 1000));
    expect(oppdateringer[0]).toHaveProperty('forste_apnet_at');
  });
});
