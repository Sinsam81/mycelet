import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Personvernerklæringen sier at det som overlever en kontosletting er «kun
 * observasjoner med omtrentlig delingsnivå (±500 m)». Ruta slettet bare de
 * PRIVATE negative observasjonene, så også de offentlige ble liggende — med
 * det eksakte GPS-punktet, tidsstempelet og arten, uten bruker-ID.
 *
 * Testene under leser hvilke spørringer ruta faktisk sender.
 */

interface Operation {
  table: string;
  op: 'select' | 'delete' | 'update';
  filters: Array<{ kind: string; column: string; value: unknown }>;
  values?: Record<string, unknown>;
}

let adminOps: Operation[] = [];
let retainedRows: Array<{ id: string; display_latitude: number | null; display_longitude: number | null }> = [];
let deletedUserId: string | null = null;
/** Ny bruker per test — rate-limiteren nøkler på bruker-ID og slår inn på 5/min. */
let currentUserId = 'bruker-0';

/* eslint-disable @typescript-eslint/no-explicit-any */
function builder(table: string, record: Operation[], resolve: (op: Operation) => unknown) {
  const state: Operation = { table, op: 'select', filters: [] };
  const api: any = {
    select: () => api,
    delete: () => {
      state.op = 'delete';
      return api;
    },
    update: (values: Record<string, unknown>) => {
      state.op = 'update';
      state.values = values;
      return api;
    },
    eq: (column: string, value: unknown) => {
      state.filters.push({ kind: 'eq', column, value });
      return api;
    },
    neq: (column: string, value: unknown) => {
      state.filters.push({ kind: 'neq', column, value });
      return api;
    },
    in: (column: string, value: unknown) => {
      state.filters.push({ kind: 'in', column, value });
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
    then: (onFulfilled: (v: unknown) => unknown) => {
      record.push({ ...state, filters: [...state.filters] });
      return Promise.resolve(resolve(state)).then(onFulfilled);
    }
  };
  return api;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: currentUserId, email: 'a@b.no' } } }),
      signOut: async () => ({})
    },
    // Tellinger til kvitteringen — vi bryr oss ikke om tallene her.
    from: (table: string) => builder(table, [], () => ({ count: 0, error: null }))
  })
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      builder(table, adminOps, (op) =>
        op.op === 'select' ? { data: retainedRows, error: null } : { error: null }
      ),
    storage: {},
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deletedUserId = id;
          return { error: null };
        }
      }
    }
  })
}));

vi.mock('@/lib/storage/delete-user-objects', () => ({
  deleteUserStorageObjects: async () => ({ removed: 0, failures: [] })
}));

vi.mock('@/lib/audit/log', () => ({ logAdminAction: async () => undefined }));

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

const { POST } = await import('../route');

let requestCounter = 0;
function makeRequest(confirm = 'DELETE-MY-ACCOUNT') {
  requestCounter += 1;
  return new NextRequest('https://mycelet.com/api/me/delete', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.1.0.${requestCounter}`, 'content-type': 'application/json' },
    body: JSON.stringify({ confirm })
  });
}

const findingDeletes = () => adminOps.filter((op) => op.table === 'findings' && op.op === 'delete');
const findingUpdates = () => adminOps.filter((op) => op.table === 'findings' && op.op === 'update');

beforeEach(() => {
  adminOps = [];
  retainedRows = [];
  deletedUserId = null;
  currentUserId = `bruker-${requestCounter}`;
});

describe('POST /api/me/delete', () => {
  it('krever den eksakte bekreftelsen', async () => {
    const res = await POST(makeRequest('slett'));
    expect(res.status).toBe(400);
    expect(adminOps).toHaveLength(0);
  });

  it('sletter alle negative observasjoner som ikke er delt på omtrentlig nivå', async () => {
    await POST(makeRequest());

    const negativeDelete = findingDeletes().find((op) =>
      op.filters.some((f) => f.column === 'is_negative_observation' && f.value === true)
    );
    expect(negativeDelete, 'ingen sletting av negative observasjoner').toBeDefined();

    const visibilityFilter = negativeDelete!.filters.find((f) => f.column === 'visibility');
    // Var .eq('visibility', 'private') — da overlevde de OFFENTLIGE, med
    // eksakt koordinat, stikk i strid med erklæringen.
    expect(visibilityFilter).toEqual({ kind: 'neq', column: 'visibility', value: 'approximate' });
  });

  /**
   * Soft delete (migrasjon 055) lar raden ligge i 30 dager. En negativ,
   * 'approximate' observasjon som brukeren ALLEREDE hadde slettet ville ellers
   * sluppet gjennom filteret på synlighet og blitt liggende som anonymisert
   * treningsdata — slettet to ganger av brukeren, og likevel beholdt.
   */
  it('fjerner funn brukeren allerede hadde slettet selv', async () => {
    await POST(makeRequest());

    const softDelete = findingDeletes().find((op) =>
      op.filters.some((f) => f.column === 'deleted_at')
    );
    expect(softDelete, 'ingen opprydding av soft-slettede funn').toBeDefined();
    expect(softDelete!.filters).toContainEqual({
      kind: 'not.is',
      column: 'deleted_at',
      value: null
    });
    // Uten synlighetsfilter: ALT brukeren har slettet skal med, også det
    // negative og omtrentlige som ellers beholdes.
    expect(softDelete!.filters.some((f) => f.column === 'visibility')).toBe(false);
  });

  it('sletter alle positive funn uansett delingsnivå', async () => {
    await POST(makeRequest());
    const positiveDelete = findingDeletes().find((op) =>
      op.filters.some((f) => f.column === 'is_negative_observation' && f.value === false)
    );
    expect(positiveDelete).toBeDefined();
    expect(positiveDelete!.filters.some((f) => f.column === 'visibility')).toBe(false);
  });

  it('grovkorner posisjonen på observasjonene som blir liggende igjen', async () => {
    retainedRows = [{ id: 'obs-1', display_latitude: 59.9, display_longitude: 10.7 }];
    await POST(makeRequest());

    expect(findingUpdates()).toHaveLength(1);
    expect(findingUpdates()[0].values).toEqual({ latitude: 59.9, longitude: 10.7 });
  });

  it('sletter auth-brukeren til slutt', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(deletedUserId).toBe(currentUserId);
  });

  it('sletter ikke kontoen hvis grovkorningen feiler', async () => {
    // Rekkefølgen er poenget: brukeren skal kunne prøve igjen, og skal ikke
    // ende opp med konto borte og eksakt posisjon igjen.
    retainedRows = [{ id: 'obs-1', display_latitude: null, display_longitude: null }];
    const failing = await import('@/lib/supabase/admin');
    vi.spyOn(failing, 'createAdminClient').mockReturnValueOnce({
      from: (table: string) =>
        builder(table, adminOps, (op) =>
          op.op === 'select'
            ? { data: retainedRows, error: null }
            : op.op === 'delete' && op.filters.some((f) => f.kind === 'in')
              ? { error: { message: 'nei' } }
              : { error: null }
        ),
      storage: {},
      auth: { admin: { deleteUser: async () => ({ error: null }) } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(deletedUserId).toBeNull();
  });
});
