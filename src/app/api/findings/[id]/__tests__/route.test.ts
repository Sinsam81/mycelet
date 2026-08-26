import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Brukeren kunne ikke slette sine egne funn noe sted i appen. RLS tillot det
 * (migrasjon 001:333), men /api/findings eksporterte bare POST, og det fantes
 * ikke ett .delete() mot findings i src/. Et feilregistrert funn var permanent
 * — eneste utvei var å slette hele kontoen.
 *
 * Testene under låser de tre egenskapene som gjør slettingen trygg:
 *   1. Den er MYK (setter deleted_at) — ellers finnes det ingen angrevei.
 *   2. Den er eier-avgrenset, også utenom RLS.
 *   3. Den er idempotent-sikker: et allerede slettet funn gir 404, ikke en ny
 *      30-dagersfrist.
 */

interface Op {
  op: 'update';
  values: Record<string, unknown>;
  filters: Array<{ kind: string; column: string; value: unknown }>;
}

let ops: Op[] = [];
let userId: string | null = 'bruker-1';
/** Hva .maybeSingle() skal svare. */
let result: { data: unknown; error: { code?: string; message: string } | null } = {
  data: { id: 'funn-1' },
  error: null
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function builder() {
  const state: Op = { op: 'update', values: {}, filters: [] };
  const api: any = {
    update: (values: Record<string, unknown>) => {
      state.values = values;
      return api;
    },
    eq: (column: string, value: unknown) => {
      state.filters.push({ kind: 'eq', column, value });
      return api;
    },
    is: (column: string, value: unknown) => {
      state.filters.push({ kind: 'is', column, value });
      return api;
    },
    not: (column: string, operator: string, value: unknown) => {
      state.filters.push({ kind: `not.${operator}`, column, value });
      return api;
    },
    select: () => api,
    maybeSingle: async () => {
      ops.push({ ...state, filters: [...state.filters] });
      return result;
    }
  };
  return api;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: () => builder()
  })
}));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

const { DELETE } = await import('../route');
const { POST: RESTORE } = await import('../restore/route');

const ID = '11111111-2222-3333-4444-555555555555';

let counter = 0;
function req(method: string) {
  counter += 1;
  // Ny IP per kall — rate-limiteren nøkler på klient + bruker.
  return new NextRequest(`https://mycelet.com/api/findings/${ID}`, {
    method,
    headers: { 'x-forwarded-for': `10.2.0.${counter}` }
  });
}

const params = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  ops = [];
  userId = 'bruker-1';
  result = { data: { id: 'funn-1' }, error: null };
});

describe('DELETE /api/findings/:id', () => {
  it('setter deleted_at i stedet for å slette raden', async () => {
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(200);

    expect(ops).toHaveLength(1);
    // Myk sletting: raden består, så angreknappen har noe å gjenopprette.
    expect(Object.keys(ops[0].values)).toEqual(['deleted_at']);
    expect(typeof ops[0].values.deleted_at).toBe('string');
  });

  it('avgrenser til eierens egen rad, i tillegg til RLS', async () => {
    await DELETE(req('DELETE'), params());
    expect(ops[0].filters).toContainEqual({ kind: 'eq', column: 'user_id', value: 'bruker-1' });
    expect(ops[0].filters).toContainEqual({ kind: 'eq', column: 'id', value: ID });
  });

  it('rører ikke et funn som allerede er slettet', async () => {
    await DELETE(req('DELETE'), params());
    // Uten dette filteret ville et dobbelt klikk flyttet 30-dagersfristen.
    expect(ops[0].filters).toContainEqual({ kind: 'is', column: 'deleted_at', value: null });
  });

  it('svarer 404 når ingen rad ble truffet', async () => {
    result = { data: null, error: null };
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(404);
  });

  it('krever innlogging', async () => {
    userId = null;
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(401);
    expect(ops).toHaveLength(0);
  });

  it('avviser en id som ikke er en UUID', async () => {
    const res = await DELETE(req('DELETE'), params('../../slett-alt'));
    expect(res.status).toBe(400);
    expect(ops).toHaveLength(0);
  });

  /**
   * Migrasjonene kjøres for hånd i SQL-editoren, så det finnes et vindu der
   * koden er ute og kolonnen ikke er det. Da skal brukeren få vite at funnet
   * IKKE er slettet — ikke en anonym 500 som lar hen tro at det er borte.
   */
  it('sier tydelig fra hvis databasekolonnen ikke finnes ennå', async () => {
    result = { data: null, error: { code: '42703', message: 'column "deleted_at" does not exist' } };
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.details).toContain('IKKE slettet');
  });
});

describe('POST /api/findings/:id/restore', () => {
  it('nullstiller deleted_at', async () => {
    const res = await RESTORE(req('POST'), params());
    expect(res.status).toBe(200);
    expect(ops[0].values).toEqual({ deleted_at: null });
  });

  /**
   * Uten dette filteret ville ruta vært en skjult skrivevei mot hvilken som
   * helst av eierens rader — ikke bare de slettede.
   */
  it('gjenoppretter bare rader som faktisk er slettet', async () => {
    await RESTORE(req('POST'), params());
    expect(ops[0].filters).toContainEqual({ kind: 'not.is', column: 'deleted_at', value: null });
    expect(ops[0].filters).toContainEqual({ kind: 'eq', column: 'user_id', value: 'bruker-1' });
  });

  it('svarer 404 når funnet ikke er slettet', async () => {
    result = { data: null, error: null };
    const res = await RESTORE(req('POST'), params());
    expect(res.status).toBe(404);
  });

  it('krever innlogging', async () => {
    userId = null;
    const res = await RESTORE(req('POST'), params());
    expect(res.status).toBe(401);
  });
});
