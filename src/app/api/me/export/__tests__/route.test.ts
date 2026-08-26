import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Kjernepåstanden: eksporten skal ALDRI levere en fil som ser komplett ut når
 * en av spørringene feilet. Før denne endringen ble hvert resultat lest som
 * `data ?? []`, så en feilet spørring ble til en tom liste inne i en fil
 * brukeren fikk som svar på et innsynskrav etter GDPR art. 15.
 */

type TableResult = { data: unknown; error: { message: string; code?: string } | null };

/** Hva hver tabell skal svare i den aktuelle testen. */
let tableResponses: Record<string, TableResult> = {};
let currentUser: { id: string; email: string; created_at: string } | null = null;
/** Hvilke tabeller ble spurt om, og med hvilken klient. */
let queriedWithSession: string[] = [];
let queriedWithAdmin: string[] = [];
/** Simulerer at SUPABASE_SERVICE_ROLE_KEY mangler. */
let adminClientAvailable = true;

/**
 * Minimal Supabase-etterligning. Query-byggeren er «thenable», så både
 * `await from(x).select().eq()` og `.maybeSingle()` løser til samme resultat —
 * det er nok for denne ruten, som aldri filtrerer på annet enn eier.
 */
function makeQuery(result: TableResult) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: TableResult) => unknown) => Promise.resolve(result).then(resolve)
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => {
      queriedWithSession.push(table);
      return makeQuery(tableResponses[table] ?? { data: [], error: null });
    }
  })
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!adminClientAvailable) throw new Error('SUPABASE_SERVICE_ROLE_KEY mangler');
    return {
      from: (table: string) => {
        queriedWithAdmin.push(table);
        return makeQuery(tableResponses[table] ?? { data: [], error: null });
      }
    };
  }
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

const { GET } = await import('../route');

/** Ny request hver gang, med unik IP så rate-limiteren ikke slår inn. */
let requestCounter = 0;
function makeRequest() {
  requestCounter += 1;
  return new NextRequest('https://mycelet.com/api/me/export', {
    headers: { 'x-forwarded-for': `10.0.0.${requestCounter}` }
  });
}

beforeEach(() => {
  currentUser = { id: `bruker-${requestCounter}`, email: 'test@example.com', created_at: '2026-01-01T00:00:00Z' };
  tableResponses = {};
  queriedWithSession = [];
  queriedWithAdmin = [];
  adminClientAvailable = true;
});

describe('GET /api/me/export', () => {
  it('krever innlogging', async () => {
    currentUser = null;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('leverer eksport når alle spørringer går bra', async () => {
    tableResponses = {
      findings: { data: [{ id: 1 }, { id: 2 }], error: null },
      forum_posts: { data: [{ id: 9 }], error: null },
      profiles: { data: { id: 'x', username: 'sopp' }, error: null }
    };

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const body = JSON.parse(await res.text());
    expect(body.findings).toHaveLength(2);
    expect(body._manifest.complete).toBe(true);
    expect(body._manifest.datasets.findings).toBe(2);
  });

  /**
   * spot_feedback er det datasettet med de mest presise koordinatene vi lagrer
   * om en bruker (fem desimaler ≈ 1 m, utenfor visibility-modellen). Det lå
   * utenfor eksporten mens fila erklærte seg fullstendig.
   */
  describe('dekker alle tabellene som er knyttet til brukeren', () => {
    it('tar med tilbakemeldinger på steder — koordinatene og alt', async () => {
      tableResponses = {
        spot_feedback: {
          data: [{ id: 'sf1', latitude: 59.91234, longitude: 10.75678, found: true }],
          error: null
        }
      };

      const body = JSON.parse(await (await GET(makeRequest())).text());
      expect(queriedWithSession).toContain('spot_feedback');
      expect(body.spotFeedback).toHaveLength(1);
      expect(body.spotFeedback[0].latitude).toBe(59.91234);
      expect(body._manifest.datasets.spotFeedback).toBe(1);
    });

    it('tar med de markerte stedene', async () => {
      // saved_places ligger utenfor funnenes synlighetsmodell og har like
      // presise koordinater som spot_feedback. Glemmes de her, er «fullstendig»
      // i manifestet en usannhet.
      tableResponses['saved_places'] = {
        data: [{ id: 's1', name: 'Kantarellskogen', latitude: 59.91234, longitude: 10.75678 }],
        error: null
      };
      const res = await GET(makeRequest());
      const body = await res.json();

      expect(queriedWithSession).toContain('saved_places');
      expect(body.savedPlaces).toHaveLength(1);
      expect(body.savedPlaces[0].name).toBe('Kantarellskogen');
      expect(body._manifest.datasets.savedPlaces).toBe(1);
    });

    /**
     * Migrasjoner kjøres manuelt i dette prosjektet. Deployes koden før
     * migrasjon 055 er limt inn, finnes ikke saved_places — og uten unntaket i
     * ruta ville hvert eneste innsynskrav etter GDPR art. 15 svart 500.
     * Finnes ikke tabellen, finnes det heller ingen steder å utelate.
     */
    it('leverer eksporten selv om saved_places ennå ikke er migrert', async () => {
      tableResponses['saved_places'] = {
        data: null,
        error: { message: 'Could not find the table', code: 'PGRST205' }
      };
      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.savedPlaces).toEqual([]);
      expect(body._manifest.complete).toBe(true);
    });

    it('feiler fortsatt lukket når saved_places feiler av en ANNEN grunn', async () => {
      tableResponses['saved_places'] = {
        data: null,
        error: { message: 'statement timeout', code: '57014' }
      };
      const res = await GET(makeRequest());

      expect(res.status).toBe(500);
      expect((await res.json())._manifest).toBeUndefined();
    });

    it('tar med varselet om automatisk sletting', async () => {
      tableResponses = {
        account_deletion_warnings: { data: { user_id: 'x', scheduled_deletion_at: '2029-01-01' }, error: null }
      };
      const body = JSON.parse(await (await GET(makeRequest())).text());
      expect(queriedWithSession).toContain('account_deletion_warnings');
      expect(body.deletionWarning.scheduled_deletion_at).toBe('2029-01-01');
    });

    it('leser AI-tellerne med tjenesterollen, ikke med øktklienten', async () => {
      // ai_identifications har RLS på uten policyer. Øktklienten ville gitt en
      // tom liste som ser ut som et svar.
      tableResponses = {
        ai_identifications: { data: [{ id: 1 }, { id: 2 }], error: null }
      };
      const body = JSON.parse(await (await GET(makeRequest())).text());
      expect(queriedWithAdmin).toContain('ai_identifications');
      expect(queriedWithSession).not.toContain('ai_identifications');
      expect(body._manifest.datasets.aiIdentifications).toBe(2);
    });

    it('sier fra i stedet for å levere en fil uten AI-tellerne', async () => {
      adminClientAvailable = false;
      const res = await GET(makeRequest());
      expect(res.status).toBe(500);
      const body = JSON.parse(await res.text());
      expect(body._manifest).toBeUndefined();
      expect(body.details).toMatch(/IKKE fått en ufullstendig fil/);
    });
  });

  describe('feiler lukket', () => {
    // Én test per tabell som kan feile: poenget er at ingen av dem har lov til
    // å bli stille borte.
    const tables = [
      'findings',
      'forum_posts',
      'comments',
      'profiles',
      'billing_subscriptions',
      'spot_feedback',
      'account_deletion_warnings',
      'ai_identifications'
    ];

    it.each(tables)('%s som feiler gir 500, ikke en delvis fil', async (table) => {
      tableResponses = {
        findings: { data: [{ id: 1 }], error: null },
        [table]: { data: null, error: { message: 'connection reset' } }
      };

      const res = await GET(makeRequest());
      expect(res.status).toBe(500);

      const body = JSON.parse(await res.text());
      // Ingen brukerdata skal lekke ut i feilsvaret …
      expect(body.findings).toBeUndefined();
      expect(body._manifest).toBeUndefined();
      // … og brukeren skal få vite at de IKKE sitter med en ufullstendig fil.
      expect(body.details).toMatch(/IKKE fått en ufullstendig fil/);
    });

    it('lekker ikke leverandørens feilmelding til klienten', async () => {
      tableResponses = {
        findings: { data: null, error: { message: 'relation "findings" does not exist in schema public' } }
      };

      const res = await GET(makeRequest());
      const text = await res.text();
      expect(text).not.toContain('does not exist');
      expect(text).not.toContain('schema public');
    });

    it('viser personvernadressen så brukeren vet hvor de skal', async () => {
      tableResponses = { findings: { data: null, error: { message: 'boom' } } };
      const body = JSON.parse(await (await GET(makeRequest())).text());
      expect(body.details).toContain('privacy@mycelet.com');
    });
  });

  it('tom tabell er ikke en feil — den eksporteres som tom', async () => {
    // Viktig grense: RLS som lovlig gir null rader skal fortsatt gi 200.
    tableResponses = { findings: { data: [], error: null } };
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    expect(body.findings).toEqual([]);
    expect(body._manifest.datasets.findings).toBe(0);
  });

  it('manifestet teller hvert datasett', async () => {
    tableResponses = {
      findings: { data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null },
      comments: { data: [{ id: 7 }], error: null },
      profiles: { data: { id: 'x' }, error: null },
      moderator_roles: { data: null, error: null }
    };

    const body = JSON.parse(await (await GET(makeRequest())).text());
    expect(body._manifest.datasets).toMatchObject({
      findings: 3,
      comments: 1,
      profile: 1,
      moderatorRole: 0
    });
    expect(body._manifest.generatedAt).toBe(body.exportedAt);
  });
});
