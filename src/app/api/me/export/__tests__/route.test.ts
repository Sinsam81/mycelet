import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Kjernepåstanden: eksporten skal ALDRI levere en fil som ser komplett ut når
 * en av spørringene feilet. Før denne endringen ble hvert resultat lest som
 * `data ?? []`, så en feilet spørring ble til en tom liste inne i en fil
 * brukeren fikk som svar på et innsynskrav etter GDPR art. 15.
 */

type TableResult = { data: unknown; error: { message: string } | null };

/** Hva hver tabell skal svare i den aktuelle testen. */
let tableResponses: Record<string, TableResult> = {};
let currentUser: { id: string; email: string; created_at: string } | null = null;

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
    from: (table: string) =>
      makeQuery(tableResponses[table] ?? { data: [], error: null })
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

  describe('feiler lukket', () => {
    // Én test per tabell som kan feile: poenget er at ingen av dem har lov til
    // å bli stille borte.
    const tables = ['findings', 'forum_posts', 'comments', 'profiles', 'billing_subscriptions'];

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
