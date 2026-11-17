import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Moderasjonsruten skjuler innhold med tjenesterollen. Tre ting må derfor
 * holde: bare moderatorer slipper inn, målet utledes fra rapportraden (aldri
 * fra forespørselen), og hver handling etterlater en rad i revisjonsloggen.
 */

interface Kall {
  table: string;
  op: 'select' | 'update';
  values?: Record<string, unknown>;
  columns?: string;
  filters: Array<[string, string, unknown]>;
  sorter?: { kolonne: string; stigende: boolean };
  grense?: number;
  /** `count`-valget til select, når spørringen ber om en telling. */
  telling?: string;
}

/** Hvordan tellingen av åpne rapporter svarer: som vanlig, med en feil, eller uten tall. */
let tellingSvar: 'ok' | 'feil' | 'uten-tall' = 'ok';

let bruker: { id: string } | null = { id: 'mod-1' };
let rolle: string | null = 'moderator';
let rolleFeil = false;
let adminKall: Kall[] = [];
let tabeller: Record<string, Array<Record<string, unknown>>> = {};
const logAdminAction = vi.fn(async (_entry: Record<string, unknown>) => undefined);

function passer(rad: Record<string, unknown>, filters: Kall['filters']) {
  return filters.every(([type, kolonne, verdi]) =>
    type === 'eq' ? rad[kolonne] === verdi : type === 'in' ? (verdi as unknown[]).includes(rad[kolonne]) : true
  );
}

function adminFrom(table: string) {
  const kall: Kall = { table, op: 'select', filters: [] };
  adminKall.push(kall);
  const rader = () => (tabeller[table] ?? []).filter((rad) => passer(rad, kall.filters));
  const builder: Record<string, unknown> = {
    select: (columns?: string, valg?: { count?: string }) => {
      kall.columns = columns;
      kall.telling = valg?.count;
      return builder;
    },
    update: (values: Record<string, unknown>) => {
      kall.op = 'update';
      kall.values = values;
      return builder;
    },
    eq: (kolonne: string, verdi: unknown) => {
      kall.filters.push(['eq', kolonne, verdi]);
      return builder;
    },
    in: (kolonne: string, verdi: unknown) => {
      kall.filters.push(['in', kolonne, verdi]);
      return builder;
    },
    order: (kolonne: string, valg?: { ascending?: boolean }) => {
      kall.sorter = { kolonne, stigende: valg?.ascending !== false };
      return builder;
    },
    limit: (antall: number) => {
      kall.grense = antall;
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: rader()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      if (kall.op === 'update') {
        for (const rad of rader()) Object.assign(rad, kall.values);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
      if (kall.telling && tellingSvar === 'feil') {
        return Promise.resolve({
          data: null,
          error: { message: 'canceling statement due to statement timeout', code: '57014' },
          count: null
        }).then(resolve);
      }
      // Som PostgREST: `count` er alle treffene, `data` er sortert og kappet.
      const treff = rader();
      const sorter = kall.sorter;
      const sortert = sorter
        ? [...treff].sort((a, b) => String(a[sorter.kolonne]).localeCompare(String(b[sorter.kolonne])) * (sorter.stigende ? 1 : -1))
        : treff;
      const data = kall.grense === undefined ? sortert : sortert.slice(0, kall.grense);
      const count = kall.telling && tellingSvar === 'uten-tall' ? null : treff.length;
      return Promise.resolve({ data, error: null, count }).then(resolve);
    }
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: bruker } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            rolleFeil ? { data: null, error: { message: 'nede' } } : { data: rolle ? { role: rolle } : null, error: null }
        })
      })
    })
  })
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom })
}));

vi.mock('@/lib/audit/log', () => ({ logAdminAction: (entry: Record<string, unknown>) => logAdminAction(entry) }));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));

let sprak: 'nb' | 'sv' = 'nb';
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

import { GET, POST } from '../route';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/admin/moderation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const oppdateringer = (table: string) => adminKall.filter((k) => k.table === table && k.op === 'update');

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  sprak = 'nb';
  tellingSvar = 'ok';
  bruker = { id: 'mod-1' };
  rolle = 'moderator';
  rolleFeil = false;
  adminKall = [];
  logAdminAction.mockClear();
  tabeller = {
    reports: [
      { id: 'r-post', reporter_id: 'melder-1', reason: 'dangerous_advice', description: 'Farlig', status: 'pending', created_at: '2026-09-01T10:00:00Z', post_id: 'p1', comment_id: null, finding_id: null },
      { id: 'r-post-2', reporter_id: 'melder-2', reason: 'misinformation', description: null, status: 'reviewed', created_at: '2026-09-01T11:00:00Z', post_id: 'p1', comment_id: null, finding_id: null },
      { id: 'r-kommentar', reporter_id: 'melder-1', reason: 'harassment', description: null, status: 'pending', created_at: '2026-09-01T12:00:00Z', post_id: null, comment_id: 'c1', finding_id: null },
      { id: 'r-funn', reporter_id: 'melder-3', reason: 'privacy', description: null, status: 'pending', created_at: '2026-09-01T13:00:00Z', post_id: null, comment_id: null, finding_id: 'f1' }
    ],
    forum_posts: [
      { id: 'p1', user_id: 'forfatter-1', title: 'Tittel', content: 'Innhold', images: [], is_hidden: false },
      { id: 'p-annen', user_id: 'forfatter-2', title: 'Urørt', content: 'x', images: [], is_hidden: false }
    ],
    comments: [{ id: 'c1', user_id: 'forfatter-2', post_id: 'p1', content: 'Kommentar', is_hidden: false }],
    findings: [
      { id: 'f1', user_id: 'forfatter-3', species_name_override: 'Steinsopp', found_at: '2026-08-20T08:00:00Z', visibility: 'public', is_zone_finding: false, zone_label: null, notes: 'n', thumbnail_url: null, deleted_at: null }
    ],
    profiles: [
      { id: 'forfatter-1', username: 'en' },
      { id: 'forfatter-2', username: 'to' },
      { id: 'forfatter-3', username: 'tre' }
    ]
  };
});

describe('tilgang', () => {
  it('utlogget får 401 og ingenting leses med tjenesterollen', async () => {
    bruker = null;
    const res = await GET(new NextRequest('http://localhost/api/admin/moderation'));
    expect(res.status).toBe(401);
    expect(adminKall).toHaveLength(0);
  });

  it('innlogget uten moderatorrolle får 403 på både lesing og handling', async () => {
    rolle = null;
    expect((await GET(new NextRequest('http://localhost/api/admin/moderation'))).status).toBe(403);
    expect((await POST(post({ reportId: 'r-post', action: 'hide' }))).status).toBe(403);
    expect(adminKall).toHaveLength(0);
    expect(tabeller.forum_posts[0].is_hidden).toBe(false);
  });

  it('feilsvarene har stabil kode og følger leserens språk', async () => {
    rolle = null;
    sprak = 'sv';
    const nekt = await POST(post({ reportId: 'r-post', action: 'hide' }));
    expect(await nekt.json()).toEqual({ code: 'forbidden', error: 'Du har inte åtkomst till detta.' });

    rolle = 'moderator';
    const mangler = await POST(post({ reportId: 'finnes-ikke', action: 'hide' }));
    expect(mangler.status).toBe(404);
    expect(await mangler.json()).toEqual({ code: 'moderation_report_not_found', error: 'Anmälan finns inte.' });

    sprak = 'nb';
    const funn = await POST(post({ reportId: 'r-funn', action: 'hide' }));
    expect(funn.status).toBe(400);
    expect(await funn.json()).toEqual({ code: 'moderation_finding_not_hideable', error: 'Funn kan ikke skjules herfra ennå.' });
  });

  it('feiler rolleoppslaget, er svaret nei', async () => {
    rolleFeil = true;
    const res = await POST(post({ reportId: 'r-post', action: 'hide' }));
    expect(res.status).toBe(500);
    expect(adminKall).toHaveLength(0);
  });
});

describe('GET', () => {
  it('viser åpne rapporter med innholdet, uten å røpe hvem som meldte', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/moderation'));
    expect(res.status).toBe(200);
    const json = await res.json();

    // «Gjennomgått» (r-post-2) er sett, ikke avsluttet — den står blant de åpne.
    expect(json.reports.map((r: { id: string }) => r.id).sort()).toEqual(['r-funn', 'r-kommentar', 'r-post', 'r-post-2']);
    const innlegg = json.reports.find((r: { id: string }) => r.id === 'r-post');
    expect(innlegg.target).toMatchObject({ type: 'post', title: 'Tittel', excerpt: 'Innhold', authorUsername: 'en', canHide: true });
    const funn = json.reports.find((r: { id: string }) => r.id === 'r-funn');
    expect(funn.target).toMatchObject({ type: 'finding', id: 'f1', canHide: false, speciesOverride: 'Steinsopp', shownAs: 'public' });

    expect(JSON.stringify(json)).not.toMatch(/melder-|reporter/);
    expect(json.pending.antall).toBe(4);
  });

  it('«Åpne» og tellingen bruker samme regel: avsluttede rapporter er ute av begge', async () => {
    tabeller.reports[0].status = 'resolved';
    tabeller.reports[2].status = 'dismissed';
    const json = await (await GET(new NextRequest('http://localhost/api/admin/moderation'))).json();
    expect(json.reports.map((r: { id: string }) => r.id).sort()).toEqual(['r-funn', 'r-post-2']);
    expect(json.pending.antall).toBe(2);
  });

  it('døgnfristen regnes fra den eldste åpne rapporten, også når den er gjennomgått', async () => {
    // Før telte bare `pending`: en rapport som var sett, men ikke avsluttet,
    // forsvant fra banneret og kunne bli liggende uten at noe sa fra.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    tabeller.reports = [
      { id: 'r-gammel', reporter_id: 'melder-1', reason: 'spam', description: null, status: 'reviewed', created_at: '2026-09-01T10:00:00Z', post_id: 'p1', comment_id: null, finding_id: null },
      { id: 'r-ny', reporter_id: 'melder-2', reason: 'spam', description: null, status: 'pending', created_at: '2026-09-03T09:00:00Z', post_id: 'p1', comment_id: null, finding_id: null }
    ];
    const json = await (await GET(new NextRequest('http://localhost/api/admin/moderation'))).json();
    expect(json.pending).toEqual({ antall: 2, eldsteTimer: 50, over24t: true });
  });

  it('teller med samme spørring som dagsrapporten, kveldsvarselet og /admin', async () => {
    await GET(new NextRequest('http://localhost/api/admin/moderation'));
    const telling = adminKall.filter((k) => k.table === 'reports' && k.telling);
    expect(telling).toHaveLength(1);
    expect(telling[0]).toMatchObject({
      telling: 'exact',
      columns: 'created_at',
      filters: [['in', 'status', ['pending', 'reviewed']]],
      sorter: { kolonne: 'created_at', stigende: true },
      grense: 1
    });
  });

  it('sier «ikke målt» (null) når tellingen feiler — aldri «0 åpne»', async () => {
    // Før ble en feilet telling til antall 0. Da forsvant banneret, og med det
    // døgnfristvarselet, akkurat når ingen visste om noe hadde ligget for lenge.
    tellingSvar = 'feil';
    const res = await GET(new NextRequest('http://localhost/api/admin/moderation'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pending).toBeNull();
    // Rapportene er det viktigste å få fram, og de kommer likevel.
    expect(json.reports.map((r: { id: string }) => r.id).sort()).toEqual(['r-funn', 'r-kommentar', 'r-post', 'r-post-2']);
  });

  it('et svar uten tall er heller ikke 0', async () => {
    // Med count: 'exact' har et vellykket svar alltid et tall. Mangler det,
    // vet vi ikke — og da er svaret «ikke målt».
    tellingSvar = 'uten-tall';
    const json = await (await GET(new NextRequest('http://localhost/api/admin/moderation'))).json();
    expect(json.pending).toBeNull();
    expect(json.reports).toHaveLength(4);
  });

  it('ingen åpne rapporter er et målt 0 — ikke «ikke målt»', async () => {
    for (const rapport of tabeller.reports) rapport.status = 'resolved';
    const json = await (await GET(new NextRequest('http://localhost/api/admin/moderation'))).json();
    expect(json.pending).toEqual({ antall: 0, eldsteTimer: null, over24t: false });
  });

  it('?status=all tar med de som ikke lenger er åpne', async () => {
    tabeller.reports[0].status = 'resolved';
    tabeller.reports[2].status = 'dismissed';
    const res = await GET(new NextRequest('http://localhost/api/admin/moderation?status=all'));
    const json = await res.json();
    expect(json.reports).toHaveLength(4);
    // Tellingen gjelder fortsatt bare de åpne.
    expect(json.pending.antall).toBe(2);
  });

  it('notatet fra et funn som ikke er helt offentlig når aldri konsollen', async () => {
    // Samme regel som viewet public_findings. Byggeren kan bare følge den når
    // spørringen faktisk henter soneflagget.
    tabeller.findings[0] = { ...tabeller.findings[0], visibility: 'approximate', notes: 'Bak låven, tredje gran fra bekken' };
    const json = await (await GET(new NextRequest('http://localhost/api/admin/moderation'))).json();
    const funn = json.reports.find((r: { id: string }) => r.id === 'r-funn');
    expect(funn.target).toMatchObject({ excerpt: null, shownAs: 'approximate' });
    expect(JSON.stringify(json)).not.toContain('låven');
    expect(adminKall.find((k) => k.table === 'findings')?.columns).toMatch(/\bis_zone_finding\b/);
  });

  it('henter aldri koordinater for et meldt funn', async () => {
    // Den falske klienten gir hele raden uansett kolonneliste, så dette
    // prøver både spørringen og det som slipper ut av byggeren.
    tabeller.findings = tabeller.findings.map((f) => ({ ...f, latitude: 59.9, longitude: 10.7, display_latitude: 59.9 }));
    const res = await GET(new NextRequest('http://localhost/api/admin/moderation'));
    const json = await res.json();
    expect(JSON.stringify(json)).not.toMatch(/latitude|longitude|59\.9/);
    const funnKolonner = adminKall.find((k) => k.table === 'findings')?.columns ?? '';
    expect(funnKolonner).not.toBe('');
    expect(funnKolonner).not.toMatch(/latitude|longitude|location_name/);
  });
});

describe('POST', () => {
  it('skjuler innlegget rapporten peker på, løser alle åpne rapporter på det og skriver revisjonslogg', async () => {
    const res = await POST(post({ reportId: 'r-post', action: 'hide' }));
    expect(res.status).toBe(200);

    expect(tabeller.forum_posts.find((p) => p.id === 'p1')?.is_hidden).toBe(true);
    expect(tabeller.forum_posts.find((p) => p.id === 'p-annen')?.is_hidden).toBe(false);
    expect(tabeller.reports.filter((r) => r.post_id === 'p1').map((r) => r.status)).toEqual(['resolved', 'resolved']);
    expect(tabeller.reports.find((r) => r.id === 'r-post')?.resolved_at).toEqual(expect.any(String));
    // Rapporten på kommentaren i samme tråd er en egen sak.
    expect(tabeller.reports.find((r) => r.id === 'r-kommentar')?.status).toBe('pending');

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({
      actorId: 'mod-1',
      action: 'moderation.hide',
      targetUserId: 'forfatter-1',
      metadata: { reportId: 'r-post', postId: 'p1', reason: 'dangerous_advice' }
    });
  });

  it('utleder målet fra rapporten — tabell og id i forespørselen ignoreres', async () => {
    const res = await POST(post({ reportId: 'r-kommentar', action: 'hide', table: 'forum_posts', postId: 'p-annen', id: 'p-annen' }));
    expect(res.status).toBe(200);
    expect(tabeller.comments[0].is_hidden).toBe(true);
    expect(tabeller.forum_posts.every((p) => p.is_hidden === false)).toBe(true);
    expect(oppdateringer('forum_posts')).toHaveLength(0);
  });

  it('vis igjen fjerner skjulingen og logges', async () => {
    tabeller.forum_posts[0].is_hidden = true;
    const res = await POST(post({ reportId: 'r-post', action: 'unhide' }));
    expect(res.status).toBe(200);
    expect(tabeller.forum_posts[0].is_hidden).toBe(false);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({ action: 'moderation.unhide' });
  });

  it('skjul og vis igjen: rapportene skjulingen løste, åpnes på nytt', async () => {
    // Før sto de som «løst» om innhold som var synlig igjen, uten en knapp
    // som kunne endre det.
    expect((await POST(post({ reportId: 'r-post', action: 'hide' }))).status).toBe(200);
    expect(tabeller.reports.filter((r) => r.post_id === 'p1').map((r) => r.status)).toEqual(['resolved', 'resolved']);

    expect((await POST(post({ reportId: 'r-post', action: 'unhide' }))).status).toBe(200);
    const paaInnlegget = tabeller.reports.filter((r) => r.post_id === 'p1');
    expect(paaInnlegget.map((r) => r.status)).toEqual(['reviewed', 'reviewed']);
    // Sluttdatoen styrer når rapporten slettes; en åpen rapport har ingen.
    expect(paaInnlegget.map((r) => r.resolved_at)).toEqual([null, null]);

    const json = await (await GET(new NextRequest('http://localhost/api/admin/moderation'))).json();
    expect(json.reports.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['r-post', 'r-post-2']));
  });

  it('vis igjen åpner bare løste rapporter på samme innhold — avviste og andres står', async () => {
    tabeller.forum_posts[0].is_hidden = true;
    tabeller.reports[0] = { ...tabeller.reports[0], status: 'resolved', resolved_at: '2026-09-02T00:00:00Z' };
    tabeller.reports[1] = { ...tabeller.reports[1], status: 'dismissed', resolved_at: '2026-09-01T12:00:00Z' };
    tabeller.reports[2] = { ...tabeller.reports[2], status: 'resolved', resolved_at: '2026-09-02T00:00:00Z' };

    expect((await POST(post({ reportId: 'r-post', action: 'unhide' }))).status).toBe(200);
    expect(tabeller.reports.find((r) => r.id === 'r-post')).toMatchObject({ status: 'reviewed', resolved_at: null });
    expect(tabeller.reports.find((r) => r.id === 'r-post-2')).toMatchObject({ status: 'dismissed', resolved_at: '2026-09-01T12:00:00Z' });
    // Kommentaren i samme tråd er en egen sak, med egne rapporter.
    expect(tabeller.reports.find((r) => r.id === 'r-kommentar')).toMatchObject({ status: 'resolved', resolved_at: '2026-09-02T00:00:00Z' });
  });

  it('vis igjen på innhold som ikke var skjult, åpner ingen rapporter', async () => {
    tabeller.reports[0] = { ...tabeller.reports[0], status: 'resolved', resolved_at: '2026-09-02T00:00:00Z' };
    expect((await POST(post({ reportId: 'r-post', action: 'unhide' }))).status).toBe(200);
    expect(tabeller.reports.find((r) => r.id === 'r-post')).toMatchObject({ status: 'resolved', resolved_at: '2026-09-02T00:00:00Z' });
  });

  it('avvis setter sluttdato, gjennomgått gjør det ikke, og ingen av dem rører innholdet', async () => {
    expect((await POST(post({ reportId: 'r-post', action: 'dismiss' }))).status).toBe(200);
    expect(tabeller.reports.find((r) => r.id === 'r-post')).toMatchObject({ status: 'dismissed', resolved_at: expect.any(String) });

    expect((await POST(post({ reportId: 'r-kommentar', action: 'reviewed' }))).status).toBe(200);
    const gjennomgaatt = tabeller.reports.find((r) => r.id === 'r-kommentar');
    expect(gjennomgaatt?.status).toBe('reviewed');
    expect(gjennomgaatt?.resolved_at).toBeUndefined();

    expect(oppdateringer('forum_posts')).toHaveLength(0);
    expect(oppdateringer('comments')).toHaveLength(0);
    expect(logAdminAction).toHaveBeenCalledTimes(2);
  });

  it('et funn kan ikke skjules — og slettes i hvert fall ikke', async () => {
    const res = await POST(post({ reportId: 'r-funn', action: 'hide' }));
    expect(res.status).toBe(400);
    expect(adminKall.filter((k) => k.table === 'findings')).toHaveLength(0);
    expect(tabeller.findings[0].deleted_at).toBeNull();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('en funnrapport kan avvises', async () => {
    const res = await POST(post({ reportId: 'r-funn', action: 'dismiss' }));
    expect(res.status).toBe(200);
    expect(tabeller.reports.find((r) => r.id === 'r-funn')?.status).toBe('dismissed');
  });

  it('en funnrapport kan markeres som løst — den eneste avslutningen når noe faktisk ble gjort', async () => {
    // Funn kan ikke skjules herfra. Uten «løst» sto melderen igjen med
    // «avvist» på en rapport som førte til at funnet ble fjernet for hånd.
    const res = await POST(post({ reportId: 'r-funn', action: 'resolve' }));
    expect(res.status).toBe(200);
    expect(tabeller.reports.find((r) => r.id === 'r-funn')).toMatchObject({ status: 'resolved', resolved_at: expect.any(String) });
    expect(adminKall.filter((k) => k.table === 'findings')).toHaveLength(0);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({
      actorId: 'mod-1',
      action: 'moderation.resolve',
      metadata: { reportId: 'r-funn', findingId: 'f1', reason: 'privacy' }
    });
  });

  it('løst gjelder bare den ene rapporten og rører ikke innholdet', async () => {
    expect((await POST(post({ reportId: 'r-post-2', action: 'resolve' }))).status).toBe(200);
    expect(tabeller.reports.find((r) => r.id === 'r-post-2')).toMatchObject({ status: 'resolved', resolved_at: expect.any(String) });
    expect(tabeller.reports.find((r) => r.id === 'r-post')?.status).toBe('pending');
    expect(tabeller.forum_posts.every((p) => p.is_hidden === false)).toBe(true);
    expect(oppdateringer('forum_posts')).toHaveLength(0);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({ action: 'moderation.resolve', targetUserId: 'forfatter-1' });
  });

  it('ukjent rapport gir 404, ugyldig handling 400', async () => {
    expect((await POST(post({ reportId: 'finnes-ikke', action: 'hide' }))).status).toBe(404);
    expect((await POST(post({ reportId: 'r-post', action: 'delete' }))).status).toBe(400);
    expect((await POST(post({ action: 'hide' }))).status).toBe(400);
    expect(oppdateringer('forum_posts')).toHaveLength(0);
  });

  it('skjuling av innhold som er slettet gir 404', async () => {
    tabeller.forum_posts = [];
    const res = await POST(post({ reportId: 'r-post', action: 'hide' }));
    expect(res.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
