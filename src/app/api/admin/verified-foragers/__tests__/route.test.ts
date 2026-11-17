import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Ruta svarte med `error.message` fem steder — databasens egen feilmelding
 * rett til nettleseren. Verst var rolleoppslaget: det kjøres før tilgangen er
 * avgjort, så en hvilken som helst innlogget bruker som traff ruta mens
 * oppslaget feilet, fikk Postgres-teksten.
 *
 * Den satte også søketeksten rett inn i et `.or()`-filter med tjenesterollen,
 * og sendte `userId` til en uuid-kolonne uten å se på den. Begge er voktet
 * nederst.
 */

const s = vi.hoisted(() => ({
  sprak: 'nb' as 'nb' | 'sv',
  bruker: { id: 'mod-1' } as { id: string } | null,
  rolle: 'moderator' as string | null,
  rollefeil: null as { code: string; message: string } | null,
  adminfeil: null as { code: string; message: string } | null,
  logg: [] as Array<{ hendelse: string; ctx: unknown }>,
  upserts: [] as Array<Record<string, unknown>>,
  revisjon: [] as string[],
  /** Filterstrengene søket sendte til `.or()`. */
  orFiltre: [] as string[],
  /** Tabellene det ble kalt `.delete()` på. */
  slettinger: [] as string[]
}));

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => s.sprak }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({
  getClientKey: () => 'test',
  rateLimitResponse: () => new Response(null, { status: 429 })
}));
vi.mock('@/lib/audit/log', () => ({
  logAdminAction: async ({ action }: { action: string }) => {
    s.revisjon.push(action);
  }
}));
vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    error: (hendelse: string, _err: unknown, ctx: unknown) => s.logg.push({ hendelse, ctx }),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: s.bruker } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: s.rollefeil ? null : { role: s.rolle }, error: s.rollefeil })
        })
      })
    })
  })
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabell: string) => {
      const svar = { data: s.adminfeil ? null : [], error: s.adminfeil };
      const kjede: Record<string, unknown> = {
        select: () => kjede,
        order: () => kjede,
        limit: () => kjede,
        or: (filter: string) => {
          s.orFiltre.push(filter);
          return kjede;
        },
        eq: () => kjede,
        delete: () => {
          s.slettinger.push(tabell);
          return kjede;
        },
        upsert: async (rad: Record<string, unknown>) => {
          s.upserts.push(rad);
          return { error: s.adminfeil };
        },
        then: (ferdig: (v: unknown) => unknown) => Promise.resolve(svar).then(ferdig)
      };
      return kjede;
    }
  })
}));

const { GET, POST, DELETE } = await import('../route');

const URL_ = 'https://mycelet.com/api/admin/verified-foragers';
/** En bruker-ID slik databasen har dem. Ruta avviser alt annet før den spør. */
const U = '3f2b8c1e-5a47-4d09-9c6e-1b7d2a4f8e03';
const hent = (q?: string) => GET(new NextRequest(q === undefined ? URL_ : `${URL_}?q=${encodeURIComponent(q)}`));
const lagre = (body: unknown) =>
  POST(new NextRequest(URL_, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const fjern = (userId?: string) =>
  DELETE(new NextRequest(userId ? `${URL_}?userId=${encodeURIComponent(userId)}` : URL_, { method: 'DELETE' }));

const DB_FEIL = { code: '23503', message: 'insert or update on table "verified_foragers" violates foreign key constraint' };

beforeEach(() => {
  s.sprak = 'nb';
  s.bruker = { id: 'mod-1' };
  s.rolle = 'moderator';
  s.rollefeil = null;
  s.adminfeil = null;
  s.logg = [];
  s.upserts = [];
  s.revisjon = [];
  s.orFiltre = [];
  s.slettinger = [];
});

describe('/api/admin/verified-foragers — tilgang', () => {
  it('uten innlogging: 401 med kode', async () => {
    s.bruker = null;
    const res = await hent();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthenticated');
  });

  it('uten moderatorrolle: 403 med kode, på leserens språk', async () => {
    s.rolle = null;
    s.sprak = 'sv';
    const res = await lagre({ userId: U, role: 'expert' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Du har inte åtkomst till detta.', code: 'forbidden' });
    expect(s.upserts).toHaveLength(0);
  });

  it('rolleoppslaget feiler: 500 uten databasens tekst — den står i loggen', async () => {
    s.rollefeil = { code: '42P01', message: 'relation "public.moderator_roles" does not exist' };
    for (const kall of [() => hent(), () => lagre({ userId: U, role: 'expert' }), () => fjern(U)]) {
      const res = await kall();
      expect(res.status).toBe(500);
      const tekst = await res.text();
      expect(tekst).not.toContain('moderator_roles');
      expect(tekst).not.toContain('does not exist');
      expect(JSON.parse(tekst).code).toBe('unexpected');
    }
    expect(s.logg[0]).toEqual({
      hendelse: 'admin.verified_forager.role_lookup_failed',
      ctx: { code: '42P01', message: 'relation "public.moderator_roles" does not exist', userId: 'mod-1' }
    });
  });
});

describe('/api/admin/verified-foragers — databasefeil', () => {
  it('lista: oversatt feil med kode, den rå i loggen', async () => {
    s.adminfeil = DB_FEIL;
    const res = await hent();
    expect(res.status).toBe(500);
    const tekst = await res.text();
    expect(JSON.parse(tekst)).toEqual({ error: 'Kunne ikke hente data.', code: 'admin_load_failed' });
    expect(tekst).not.toContain('foreign key');
    expect(s.logg[0]).toMatchObject({
      hendelse: 'admin.verified_forager.list.profiles_failed',
      ctx: { code: '23503', message: DB_FEIL.message }
    });
  });

  it('lagring: oversatt feil med kode, og ingen rad i revisjonsloggen', async () => {
    s.adminfeil = DB_FEIL;
    s.sprak = 'sv';
    const res = await lagre({ userId: U, role: 'expert' });
    expect(res.status).toBe(500);
    const tekst = await res.text();
    expect(JSON.parse(tekst)).toEqual({ error: 'Kunde inte spara.', code: 'admin_save_failed' });
    expect(tekst).not.toContain('verified_foragers');
    expect(s.logg[0]).toMatchObject({ hendelse: 'admin.verified_forager.upsert.db_error', ctx: { code: '23503' } });
    expect(s.revisjon).toEqual([]);
  });

  it('fjerning: oversatt feil med kode', async () => {
    s.adminfeil = DB_FEIL;
    const res = await fjern(U);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Kunne ikke fjerne.', code: 'admin_remove_failed' });
    expect(s.revisjon).toEqual([]);
  });
});

describe('/api/admin/verified-foragers — ugyldige kall', () => {
  it('sier hva som manglet i hint, og holder selve teksten oversatt', async () => {
    const utenRolle = await (await lagre({ userId: U })).json();
    expect(utenRolle).toEqual({ error: 'Ugyldig forespørsel.', code: 'invalid_request', hint: 'Mangler userId eller role' });

    const res = await lagre({ userId: U, role: 'keiser' });
    expect(res.status).toBe(400);
    expect((await res.json()).hint).toBe('Ugyldig role');

    const utenBruker = await fjern();
    expect(utenBruker.status).toBe(400);
    expect((await utenBruker.json()).hint).toBe('Mangler userId');
  });

  it('en gyldig lagring går gjennom og føres i revisjonsloggen', async () => {
    const res = await lagre({ userId: U, role: 'expert', badgeLabel: ' Soppsakkyndig ' });
    expect(res.status).toBe(200);
    expect(s.upserts[0]).toMatchObject({ user_id: U, role: 'expert', badge_label: 'Soppsakkyndig' });
    expect(s.revisjon).toEqual(['verified_forager.upsert']);
  });

  it('en kropp som ikke er JSON er et ugyldig kall, ikke en krasj', async () => {
    // request.json() kastet utenfor enhver try: plattformens 500, ikke rutens svar.
    const res = await POST(
      new NextRequest(URL_, { method: 'POST', body: '{ikke json', headers: { 'content-type': 'application/json' } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_request');
    expect(s.upserts).toHaveLength(0);
  });

  it('merke og notat som ikke er tekst blir tomme, ikke en krasj', async () => {
    // `.trim()` på et tall kastet.
    const res = await lagre({ userId: U, role: 'expert', badgeLabel: 42, note: { a: 1 } });
    expect(res.status).toBe(200);
    expect(s.upserts[0]).toEqual({ user_id: U, role: 'expert', badge_label: null, note: null });
  });
});

/**
 * `user_id` er en uuid-kolonne, og klienten her er tjenesterollen. En verdi
 * som ikke er en uuid ga 22P02 fra Postgres (en 500), og gikk urørt inn i
 * spørringen.
 */
describe('/api/admin/verified-foragers — userId må være en uuid', () => {
  const UGYLDIGE = ['u', '1', 'not-a-uuid', `${U} or 1=1`, `${U},role.eq.admin`, '../profiles'];

  it.each(UGYLDIGE)('lagring med userId «%s»: 400, og ingenting skrives', async (userId) => {
    const res = await lagre({ userId, role: 'expert' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ugyldig forespørsel.', code: 'invalid_request', hint: 'Ugyldig userId' });
    expect(s.upserts).toHaveLength(0);
    expect(s.revisjon).toEqual([]);
  });

  it('lagring med en userId som ikke er tekst: 400', async () => {
    const res = await lagre({ userId: { id: U }, role: 'expert' });
    expect(res.status).toBe(400);
    expect(s.upserts).toHaveLength(0);
  });

  it.each(UGYLDIGE)('fjerning med userId «%s»: 400, og ingenting slettes', async (userId) => {
    const res = await fjern(userId);
    expect(res.status).toBe(400);
    expect((await res.json()).hint).toBe('Ugyldig userId');
    expect(s.slettinger).toEqual([]);
    expect(s.revisjon).toEqual([]);
  });

  it('en ekte uuid slipper gjennom, uansett store eller små bokstaver', async () => {
    expect((await fjern(U.toUpperCase())).status).toBe(200);
    expect(s.slettinger).toEqual(['verified_foragers']);
    expect(s.revisjon).toEqual(['verified_forager.delete']);
  });
});

/**
 * Søket sto rett i filterstrengen: `username.ilike.%${q}%,display_name…`.
 * `.or()` tar hele filteret som tekst, så et komma i søket var et nytt vilkår.
 */
describe('/api/admin/verified-foragers — søket', () => {
  it('et vanlig søk gir de to vilkårene det alltid har gitt', async () => {
    expect((await hent('ola')).status).toBe(200);
    expect(s.orFiltre).toEqual(['username.ilike."%ola%",display_name.ilike."%ola%"']);
  });

  it('under to tegn søkes det ikke', async () => {
    await hent('o');
    await hent('   ');
    await hent();
    expect(s.orFiltre).toEqual([]);
  });

  it('komma, parenteser og punktum i søket er tekst, ikke syntaks', async () => {
    await hent('x%,id.not.is.null,username.ilike.%');
    expect(s.orFiltre).toHaveLength(1);
    // Hele søket står inni anførselstegnene, med jokertegnene escapet: `%` blir
    // `\%` for LIKE, og bakstreken dobles for PostgREST. Utenfor
    // anførselstegnene finnes fortsatt bare de to vilkårene ruta selv skrev.
    const verdi = String.raw`"%x\\%,id.not.is.null,username.ilike.\\%%"`;
    expect(s.orFiltre[0]).toBe(`username.ilike.${verdi},display_name.ilike.${verdi}`);
    const utenforSitat = s.orFiltre[0].replace(/"(?:[^"\\]|\\.)*"/g, '«»');
    expect(utenforSitat).toBe('username.ilike.«»,display_name.ilike.«»');
  });

  it('et anførselstegn i søket kan ikke lukke verdien', async () => {
    await hent('a",id.not.is.null,username.ilike."b');
    const utenforSitat = s.orFiltre[0].replace(/"(?:[^"\\]|\\.)*"/g, '«»');
    expect(utenforSitat).toBe('username.ilike.«»,display_name.ilike.«»');
  });

  it('et absurd langt søk kappes før det sendes videre', async () => {
    await hent('a'.repeat(5000));
    expect(s.orFiltre[0].length).toBeLessThan(250);
  });
});
