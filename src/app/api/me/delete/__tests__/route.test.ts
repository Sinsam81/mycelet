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
/** Leserens språk. Feilsvarene skal følge det. */
let sprak: 'nb' | 'sv' = 'nb';
/** Adressen på kontoen, slik auth oppgir den. undefined = konto uten adresse. */
let currentUserEmail: string | undefined = 'a@b.no';

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));

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
      getUser: async () => ({ data: { user: { id: currentUserId, email: currentUserEmail } } }),
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
          // Med i rekkefølgen, så testene kan se hva som skjedde FØR kontoen forsvant.
          adminOps.push({ table: 'auth.users', op: 'delete', filters: [] });
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
const { createRequestLogger } = await import('@/lib/log/request');
/** Samme logger-objekt som ruta får — mocken over deler ett. */
const logg = createRequestLogger({} as never) as unknown as {
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

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
  currentUserEmail = 'a@b.no';
  sprak = 'nb';
  logg.error.mockClear();
  logg.warn.mockClear();
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
   * Soft delete (migrasjon 056) lar raden ligge i 30 dager. En negativ,
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

/**
 * Slettedialogen viser `details` FØR `error` (AccountDataActions.tsx). Begge var
 * hardkodet norsk, så en svensk bruker som fikk slettingen stoppet halvveis,
 * leste forklaringen — kontoen står, noe kan være borte, prøv igjen — på et
 * annet språk enn resten av dialogen. Én gren sendte i tillegg navnet på en
 * miljøvariabel.
 */
describe('feilsvarene fra POST /api/me/delete', () => {
  /** Tjenesterolle-klient der den første slettingen (positive funn) feiler. */
  async function forsteSlettingFeiler() {
    const adminModul = await import('@/lib/supabase/admin');
    vi.spyOn(adminModul, 'createAdminClient').mockReturnValueOnce({
      from: (table: string) =>
        builder(table, adminOps, (op) =>
          op.op === 'delete'
            ? { error: { code: '57014', message: 'canceling statement due to statement timeout' } }
            : { data: [], error: null }
        ),
      storage: {},
      auth: { admin: { deleteUser: async () => ({ error: null }) } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it('feil bekreftelse: oversatt tekst, stabil kode, og hintet til utvikleren står', async () => {
    sprak = 'sv';
    const res = await POST(makeRequest('slett'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('delete_bad_confirm');
    expect(body.error).toBe('Bekräftelsen saknas eller är felaktig.');
    expect(body.hint).toContain('DELETE-MY-ACCOUNT');
  });

  it('et steg som feiler: en svensk bruker får HELE forklaringen på svensk', async () => {
    sprak = 'sv';
    await forsteSlettingFeiler();
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    // Koden sier hvilket steg; teksten sier hva tilstanden er.
    expect(body.code).toBe('delete_findings_failed');
    expect(body.error).toBe('Kunde inte ta bort dina personliga fynd före kontoraderingen.');
    expect(body.details).toMatch(/INTE raderat/);
    expect(body.details).toMatch(/Försök igen/);
    expect(`${body.error} ${body.details}`).not.toMatch(/IKKE|Kunne|slettet|prøv/i);
    expect(deletedUserId).toBeNull();
  });

  it('… og en norsk bruker får den samme forklaringen som før', async () => {
    await forsteSlettingFeiler();
    const body = await (await POST(makeRequest())).json();
    expect(body.details).toMatch(/IKKE slettet/);
    expect(body.details).toMatch(/trygt å gjenta/);
  });

  it('databasens egen feilmelding står i loggen, aldri i svaret', async () => {
    await forsteSlettingFeiler();
    const tekst = await (await POST(makeRequest())).text();
    expect(tekst).not.toContain('statement timeout');
    expect(tekst).not.toContain('57014');
    // loggFeil legger kode og melding i konteksten. log.error(hendelse, feil)
    // skrev det rene feilobjektet som «[object Object]».
    expect(logg.error).toHaveBeenCalledWith('account.self_delete.positive_findings_delete_failed', undefined, {
      code: '57014',
      message: 'canceling statement due to statement timeout'
    });
  });

  it('mangler tjenestenøkkelen: ingen miljøvariabel i svaret, og ingenting er rørt', async () => {
    const adminModul = await import('@/lib/supabase/admin');
    vi.spyOn(adminModul, 'createAdminClient').mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY mangler');
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const tekst = await res.text();
    // Sto i klartekst i `details`, og dialogen viste det.
    expect(tekst).not.toMatch(/SUPABASE|SERVICE_ROLE|_KEY/);
    const body = JSON.parse(tekst);
    expect(body.code).toBe('delete_unavailable');
    expect(body.details).toMatch(/IKKE slettet, og ingenting er fjernet/);
    expect(adminOps).toHaveLength(0);
    expect(deletedUserId).toBeNull();
  });
});

/**
 * Soppvarselet kan slås på uten konto (migrasjon 057): en rad med user_id NULL
 * og en e-postadresse. Kontoens egne rader tar cascaden, men de kontoløse
 * henger ikke på noe — de ble stående, og den som hadde slettet kontoen sin
 * fikk fortsatt soppvarsel på e-post. /api/me/export regner de samme radene
 * som brukerens egne data.
 */
describe('kontoløse soppvarsel-påmeldinger på brukerens adresse', () => {
  const varselSlettinger = () => adminOps.filter((op) => op.table === 'alert_subscriptions');
  const indeks = (treff: (op: Operation) => boolean) => adminOps.findIndex(treff);

  /** Tjenesterolle-klient der slettingen i alert_subscriptions svarer med `svar`. */
  async function varselSlettingSvarer(svar: { data?: unknown; error: unknown }) {
    const adminModul = await import('@/lib/supabase/admin');
    vi.spyOn(adminModul, 'createAdminClient').mockReturnValueOnce({
      from: (table: string) =>
        builder(table, adminOps, (op) =>
          table === 'alert_subscriptions' ? svar : op.op === 'select' ? { data: [], error: null } : { error: null }
        ),
      storage: {},
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            deletedUserId = id;
            adminOps.push({ table: 'auth.users', op: 'delete', filters: [] });
            return { error: null };
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it('slettes — på nøyaktig brukerens egen adresse, og bare rader uten konto', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(varselSlettinger()).toHaveLength(1);
    const sletting = varselSlettinger()[0];
    expect(sletting.op).toBe('delete');
    // `user_id IS NULL` må stå der: uten det kunne en annen kontos rad på
    // samme adresse blitt med. Og eq, aldri ilike — ingen jokertegn.
    expect(sletting.filters).toEqual([
      { kind: 'is', column: 'user_id', value: null },
      { kind: 'eq', column: 'email', value: 'a@b.no' }
    ]);
  });

  it('sammenligner adressen slik påmeldingsruta skriver den: trimmet, med små bokstaver', async () => {
    currentUserEmail = '  Kari.Sopp@Example.COM ';
    await POST(makeRequest());
    expect(varselSlettinger()[0].filters).toContainEqual({ kind: 'eq', column: 'email', value: 'kari.sopp@example.com' });
  });

  it('skjer før Stripe-oppsigelsen og før kontoen forsvinner', async () => {
    await POST(makeRequest());
    const varsel = indeks((op) => op.table === 'alert_subscriptions');
    const stripe = indeks((op) => op.table === 'billing_subscriptions');
    const konto = indeks((op) => op.table === 'auth.users');
    expect(varsel).toBeGreaterThanOrEqual(0);
    // Oppsigelsen er det ene steget som ikke kan gjøres om — den skal være sist.
    expect(varsel).toBeLessThan(stripe);
    expect(stripe).toBeLessThan(konto);
  });

  it('kvitteringen sier hvor mange som ble fjernet — et tall, aldri adressen', async () => {
    await varselSlettingSvarer({ data: [{ id: 'v1' }, { id: 'v2' }], error: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const tekst = await res.text();
    expect(JSON.parse(tekst).counts.emailAlertSubscriptions).toBe(2);
    expect(tekst).not.toContain('a@b.no');
  });

  it('uten rader å fjerne står tallet som 0', async () => {
    const body = await (await POST(makeRequest())).json();
    expect(body.counts.emailAlertSubscriptions).toBe(0);
  });

  it('en konto uten adresse sletter ingenting i varseltabellen', async () => {
    // Et tomt filter skal aldri kunne treffe noe.
    for (const adresse of [undefined, '', '   ']) {
      adminOps = [];
      deletedUserId = null;
      currentUserEmail = adresse;
      currentUserId = `uten-adresse-${String(adresse).length}`;
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(varselSlettinger()).toEqual([]);
      expect(deletedUserId).toBe(currentUserId);
    }
  });

  it('feiler slettingen, står kontoen — og abonnementet er ikke sagt opp', async () => {
    sprak = 'sv';
    await varselSlettingSvarer({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const tekst = await res.text();
    const body = JSON.parse(tekst);
    expect(body.code).toBe('delete_alerts_failed');
    expect(body.error).toBe('Kunde inte ta bort din anmälan till svampvarningen.');
    // Samme forklaring som de andre stegene: kontoen står, prøv igjen.
    expect(body.details).toMatch(/INTE raderat/);
    expect(tekst).not.toContain('statement timeout');
    expect(deletedUserId).toBeNull();
    expect(indeks((op) => op.table === 'billing_subscriptions')).toBe(-1);
    expect(logg.error).toHaveBeenCalledWith('account.self_delete.email_alerts_delete_failed', undefined, {
      code: '57014',
      message: 'canceling statement due to statement timeout'
    });
  });

  it.each([
    ['tabellen mangler (PostgREST)', 'PGRST205'],
    ['tabellen mangler (Postgres)', '42P01'],
    ['e-postkolonnen mangler i filteret', '42703'],
    ['e-postkolonnen mangler i skjemacachen', 'PGRST204']
  ])('%s: ingenting å slette, og kontoslettingen går videre', async (_navn, code) => {
    // En glemt migrasjon skal ikke stå i veien for retten til å bli slettet.
    await varselSlettingSvarer({ data: null, error: { code, message: 'finnes ikke' } });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(deletedUserId).toBe(currentUserId);
    expect((await res.json()).counts.emailAlertSubscriptions).toBe(0);
    expect(logg.warn).toHaveBeenCalledWith('account.self_delete.email_alerts_unavailable', { code });
  });
});
