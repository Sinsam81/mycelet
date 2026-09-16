import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Cronens rekkefølge er det som holder GBIF-kallene nede og tabellen ærlig:
 * ett kall for utgaven, ut igjen hvis den er målt, vent til søkeindeksen har
 * utgaven, og skriv ALT eller INGENTING.
 */

const db = {
  antall: 0,
  lesFeil: null as { message: string } | null,
  upserts: [] as unknown[][]
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ count: db.antall, error: db.lesFeil }) }),
      upsert: async (rader: unknown[]) => {
        db.upserts.push(rader);
        return { error: null };
      }
    })
  })
}));
vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: (h: string | null) => h === 'Bearer hemmelig' }));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

const henting = {
  utgave: '2026-09-12',
  indeksert: true,
  tell: vi.fn()
};

vi.mock('@/lib/rapport/soppregistreringer-henting', async (orig) => {
  const ekte = await orig<typeof import('@/lib/rapport/soppregistreringer-henting')>();
  return {
    ...ekte,
    lagGbifKlient: () => ({ hent: vi.fn(), kall: () => 0, brukt: () => 0 }),
    lesUtgave: async () => ({ dato: henting.utgave, endret: '2026-09-14T11:35:52.268+00:00' }),
    sjekkIndeksering: async () => ({ ferdig: henting.indeksert, grunn: henting.indeksert ? 'indeksert' : 'henting 494 har ikke startet i pipelines' }),
    tellSoppregistreringer: (...a: unknown[]) => henting.tell(...a)
  };
});

const { GET } = await import('../route');
const { FristUteFeil } = await import('@/lib/rapport/soppregistreringer-henting');
const { byggRader, vinduerFor } = await import('@/lib/rapport/soppregistreringer');

function kall(auth = 'Bearer hemmelig') {
  return GET({ headers: new Headers({ authorization: auth, 'x-request-id': 't' }), url: 'http://x/api/cron/soppregistreringer', nextUrl: new URL('http://x/api/cron/soppregistreringer') } as unknown as NextRequest);
}

function tommeRader() {
  const tomt = () => ({ sesong: { alle: new Map(), storsopp: new Map() }, uke: { alle: new Map(), storsopp: new Map() } });
  return byggRader('2026-09-12', vinduerFor('2026-09-12')!, { iAar: tomt(), tidligere: new Map([[2025, tomt()]]), grenser: {} });
}

beforeEach(() => {
  db.antall = 0;
  db.lesFeil = null;
  db.upserts = [];
  henting.utgave = '2026-09-12';
  henting.indeksert = true;
  henting.tell = vi.fn(async () => ({ snapshot: '2026-09-12', vinduer: vinduerFor('2026-09-12'), rader: tommeRader(), kall: 61, bruktMs: 140_000 }));
});

describe('cron/soppregistreringer', () => {
  it('401 uten riktig hemmelighet', async () => {
    expect((await kall('Bearer feil')).status).toBe(401);
    expect(henting.tell).not.toHaveBeenCalled();
  });

  it('ny utgave: teller og skriver alle 64 rader i én upsert', async () => {
    const res = await kall();
    expect(res.status).toBe(200);
    expect(henting.tell).toHaveBeenCalledTimes(1);
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toHaveLength(64);
    expect(db.upserts[0][0]).toMatchObject({ snapshot: '2026-09-12', per_aar: expect.any(Object), grenser: expect.any(Object) });
  });

  it('allerede målt: ut uten å telle', async () => {
    db.antall = 64;
    const body = await (await kall()).json();
    expect(body.hoppetOver).toBe('allerede målt');
    expect(henting.tell).not.toHaveBeenCalled();
  });

  it('utenfor sesongen: ut før databasen og tellingen', async () => {
    henting.utgave = '2026-03-01';
    const body = await (await kall()).json();
    expect(body.hoppetOver).toBe('utenfor sesongen');
    expect(henting.tell).not.toHaveBeenCalled();
  });

  it('søkeindeksen har ikke utgaven ennå: ut uten å telle, med grunnen', async () => {
    henting.indeksert = false;
    const body = await (await kall()).json();
    expect(body.hoppetOver).toMatch(/ikke indeksert/);
    expect(body.grunn).toMatch(/pipelines/);
    expect(henting.tell).not.toHaveBeenCalled();
    expect(db.upserts).toHaveLength(0);
  });

  it('tabellen svarer ikke: ingen GBIF-telling bortkastet', async () => {
    db.lesFeil = { message: 'relation does not exist' };
    expect((await kall()).status).toBe(500);
    expect(henting.tell).not.toHaveBeenCalled();
  });

  it('fristen gikk ut eller GBIF feilet: ingenting skrives', async () => {
    henting.tell = vi.fn(async () => {
      throw new FristUteFeil(54);
    });
    expect((await kall()).status).toBe(503);
    henting.tell = vi.fn(async () => {
      throw new Error('HTTP 503');
    });
    expect((await kall()).status).toBe(502);
    expect(db.upserts).toHaveLength(0);
  });
});
