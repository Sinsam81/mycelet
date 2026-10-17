import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { BRUKERE_PER_SIDE, MAKS_SIDER, hentAlleBrukere } from '../alle-brukere';

/**
 * Supabase gir høyst 1000 kontoer per side og sier ikke fra at det finnes
 * flere. Testene vokter mot den stille versjonen: en liste som ser komplett
 * ut, men mangler alle etter de første tusen.
 */

function brukere(n: number, prefiks: string): User[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefiks}-${i}`, created_at: '2026-10-01T00:00:00Z' }) as User);
}

function kilde(sider: User[][], feilPaaSide?: number) {
  const kall: number[] = [];
  return {
    kall,
    listUsers: async ({ page }: { page: number; perPage: number }) => {
      kall.push(page);
      if (page === feilPaaSide) return { data: null, error: { message: 'nede' } };
      return { data: { users: sider[page - 1] ?? [] }, error: null };
    }
  };
}

describe('hentAlleBrukere', () => {
  it('blar videre etter en full side og stopper på den første korte', async () => {
    const k = kilde([brukere(BRUKERE_PER_SIDE, 'a'), brukere(3, 'b')]);
    const r = await hentAlleBrukere(k);
    if ('feil' in r) throw new Error(r.feil);
    expect(r.brukere).toHaveLength(BRUKERE_PER_SIDE + 3);
    expect(r.brukere.at(-1)?.id).toBe('b-2');
    expect(r.avkortet).toBe(false);
    expect(k.kall).toEqual([1, 2]);
  });

  it('én kort side er hele lista — ett kall', async () => {
    const k = kilde([brukere(120, 'a')]);
    expect(await hentAlleBrukere(k)).toMatchObject({ avkortet: false });
    expect(k.kall).toEqual([1]);
  });

  it('en tom første side gir tom liste, ikke feil', async () => {
    expect(await hentAlleBrukere(kilde([]))).toEqual({ brukere: [], avkortet: false });
  });

  it('en feil underveis gir feil, ikke en halv liste', async () => {
    const k = kilde([brukere(BRUKERE_PER_SIDE, 'a'), brukere(5, 'b')], 2);
    expect(await hentAlleBrukere(k)).toEqual({ feil: 'nede' });
  });

  it('sier fra når taket nås med en full siste side', async () => {
    const sider = Array.from({ length: MAKS_SIDER + 1 }, (_, i) => brukere(BRUKERE_PER_SIDE, `s${i}`));
    const k = kilde(sider);
    const r = await hentAlleBrukere(k);
    if ('feil' in r) throw new Error(r.feil);
    expect(r.avkortet).toBe(true);
    expect(r.brukere).toHaveLength(MAKS_SIDER * BRUKERE_PER_SIDE);
    expect(k.kall).toHaveLength(MAKS_SIDER);
  });
});
