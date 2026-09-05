import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let oppdateringer: Array<{ payload: Record<string, unknown>; filtre: Array<[string, string, unknown]> }> = [];

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
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
beforeEach(() => {
  oppdateringer = [];
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
});

describe('varselklikk', () => {
  it('noterer klikket og sender videre til områdesiden', async () => {
    const res = await GET(new NextRequest(`http://localhost/api/soppvarsel/klikk?t=${TOKEN}&r=bergen`));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppforhold/bergen');
    expect(oppdateringer).toHaveLength(2);
    expect(oppdateringer[0].payload).toHaveProperty('sist_apnet_at');
    expect(oppdateringer[1].payload).toHaveProperty('forste_apnet_at');
    expect(oppdateringer[1].filtre).toContainEqual(['is', 'forste_apnet_at', null]);
  });

  it('ukjent token: samme videresending, ingen skriving', async () => {
    const res = await GET(new NextRequest('http://localhost/api/soppvarsel/klikk?t=ikke-en-uuid&r=oslo'));
    expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppforhold/oslo');
    expect(oppdateringer).toHaveLength(0);
  });

  it('ukjent område faller tilbake til oversikten', async () => {
    const res = await GET(new NextRequest(`http://localhost/api/soppvarsel/klikk?t=${TOKEN}&r=atlantis`));
    expect(res.headers.get('location')).toBe('https://www.mycelet.com/soppforhold');
  });
});
