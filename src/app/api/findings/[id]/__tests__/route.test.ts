import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { _resetAllBuckets } from '@/lib/rate-limit';
import { _nullstillJitterVakt } from '@/lib/findings/jittervakt';

/**
 * Brukeren kunne ikke slette sine egne funn noe sted i appen. RLS tillot det
 * (migrasjon 001:333), men /api/findings eksporterte bare POST, og det fantes
 * ikke ett .delete() mot findings i src/. Et feilregistrert funn var permanent
 * — eneste utvei var å slette hele kontoen.
 *
 * Slettetestene låser de tre egenskapene som gjør slettingen trygg:
 *   1. Den er MYK (setter deleted_at) — ellers finnes det ingen angrevei.
 *   2. Den er eier-avgrenset, også utenom RLS.
 *   3. Den er idempotent-sikker: et allerede slettet funn gir 404, ikke en ny
 *      30-dagersfrist.
 *
 * PATCH-testene lenger ned låser det samme for endring av et lagret funn, og
 * de fem personvernreglene den hviler på:
 *   1. Å gjøre et funn privat virker ALLTID.
 *   2. Å åpne delingen kan ikke gjentas til jitteret er gjennomsnittet bort.
 *   3. Posisjonen kan aldri endres.
 *   4. Svaret inneholder verken notat eller koordinater.
 *   5. Et funn får ikke en sone-rute som røper mer enn den skal: ingen
 *      omgjøring til sone før migrasjon 075 er bekreftet kjørt, og aldri en
 *      ny rutestørrelse.
 */

interface Op {
  op: 'select' | 'update';
  /** Kolonnene en ren lesing ba om. */
  columns?: string;
  /** Kolonnene en oppdatering ba om tilbake. */
  returning?: string;
  values: Record<string, unknown>;
  filters: Array<{ kind: string; column: string; value: unknown }>;
}

type Svar = { data: unknown; error: { code?: string; message: string } | null };

const { logger, tilstand } = vi.hoisted(() => {
  const l = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: () => l
  };
  return {
    logger: l,
    tilstand: {
      sprak: 'nb' as 'nb' | 'sv',
      /** null = bryteren slik den står i delingsendring.ts. */
      soneAapen: null as boolean | null
    }
  };
});

let ops: Op[] = [];
let userId: string | null = 'bruker-1';
/** Hva en LESING (.select uten .update) skal svare. */
let lest: Svar = { data: null, error: null };
/** Hva en OPPDATERING skal svare. */
let skrevet: Svar = { data: { id: 'funn-1' }, error: null };

/* eslint-disable @typescript-eslint/no-explicit-any */
function builder() {
  const state: Op = { op: 'select', values: {}, filters: [] };
  const api: any = {
    update: (values: Record<string, unknown>) => {
      state.op = 'update';
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
    select: (columns?: string) => {
      if (state.op === 'update') state.returning = columns;
      else state.columns = columns;
      return api;
    },
    maybeSingle: async () => {
      ops.push({ ...state, filters: [...state.filters] });
      return state.op === 'update' ? skrevet : lest;
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

vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logger }));

/**
 * SONE_OMGJORING_AAPEN er en konstant som står av til migrasjon 075 er
 * bekreftet kjørt. Testene må se begge utfall — og bryteren skal kunne slås på
 * uten at de må skrives om — så de styrer den her. Alt annet i modulen er ekte.
 */
vi.mock('@/lib/findings/delingsendring', async (importOriginal) => {
  const ekte = await importOriginal<typeof import('@/lib/findings/delingsendring')>();
  return {
    ...ekte,
    get SONE_OMGJORING_AAPEN() {
      return tilstand.soneAapen ?? ekte.SONE_OMGJORING_AAPEN;
    }
  };
});

// Feiltekstene lages på serveren og følger leserens språk.
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => tilstand.sprak }));

const { DELETE, PATCH } = await import('../route');
const { POST: RESTORE } = await import('../restore/route');
const { SONE_OMGJORING_AAPEN: BRYTEREN_I_KODEN } = await vi.importActual<
  typeof import('@/lib/findings/delingsendring')
>('@/lib/findings/delingsendring');

const ID = '11111111-2222-3333-4444-555555555555';

/** Testene skal ikke avhenge av dagens dato: klokka står stille her. */
const NAA = new Date('2026-11-10T12:00:00.000Z');
const forTimer = (timer: number) => new Date(NAA.getTime() - timer * 60 * 60 * 1000).toISOString();

function req(method: string, body?: unknown) {
  return new NextRequest(`https://mycelet.com/api/findings/${ID}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  });
}

const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const oppdateringer = () => ops.filter((o) => o.op === 'update');
const lesinger = () => ops.filter((o) => o.op === 'select');
/** Kolonnene et kall ba databasen om — lest, eller tilbake fra en skriving. */
const bedtOm = (op: Op) =>
  ((op.op === 'update' ? op.returning : op.columns) ?? '')
    .split(',')
    .map((kolonne) => kolonne.trim())
    .filter(Boolean);

/** Et lagret funn slik PATCH leser det. Privat og aldri endret, om ikke annet er sagt. */
function funn(over: Record<string, unknown> = {}) {
  return {
    id: 'funn-1',
    visibility: 'private',
    is_zone_finding: false,
    zone_label: null,
    zone_precision_km: 5,
    species_id: 3,
    species_name_override: null,
    notes: 'Under den store grana',
    created_at: '2026-09-01T08:00:00.000000+00:00',
    updated_at: '2026-09-01T08:00:00.000000+00:00',
    display_latitude: null,
    display_longitude: null,
    ...over
  };
}

/** Omtrentlig funn med et stemplet jitter-punkt. */
const omtrentlig = (over: Record<string, unknown> = {}) =>
  funn({ visibility: 'approximate', display_latitude: 59.9412, display_longitude: 10.7231, ...over });

/**
 * Det en skriving mot et omtrentlig funn gir tilbake: delingskolonnene
 * triggeren vokter, og punktet slik det står ETTERPÅ. Uendret punkt om ikke
 * annet er sagt.
 */
const etterSkriving = (over: Record<string, unknown> = {}) => ({
  id: 'funn-1',
  visibility: 'approximate',
  is_zone_finding: false,
  zone_precision_km: 5,
  display_latitude: 59.9412,
  display_longitude: 10.7231,
  ...over
});

/** Punktet har flyttet seg. */
const FLYTTET = { display_latitude: 59.9388, display_longitude: 10.7302 };
/** Et privat funn har ikke noe punkt. */
const UTEN_PUNKT = { visibility: 'private', display_latitude: null, display_longitude: null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NAA);
  ops = [];
  userId = 'bruker-1';
  lest = { data: null, error: null };
  skrevet = { data: { id: 'funn-1' }, error: null };
  tilstand.sprak = 'nb';
  tilstand.soneAapen = null;
  logger.error.mockClear();
  logger.info.mockClear();
  // Rate-limiteren nøkler på brukeren når hen er innlogget, så alle testene
  // deler bøtte. Uten nullstilling ville den 31. slettingen i fila fått 429.
  _resetAllBuckets();
  _nullstillJitterVakt();
});

afterAll(() => {
  vi.useRealTimers();
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
    skrevet = { data: null, error: null };
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('not_found');
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
    skrevet = { data: null, error: { code: '42703', message: 'column "deleted_at" does not exist' } };
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.details).toContain('IKKE slettet');
    expect(body.code).toBe('feature_not_enabled');
  });

  /**
   * Slettingen SKRIVER kolonnen, og da er det PostgREST som svarer først —
   * med sin egen kode, ikke Postgres' 42703. Sjekken så bare etter den ene,
   * så beskjeden over ville aldri kommet fram når det gjaldt.
   */
  it('kjenner også igjen PostgRESTs svar på en kolonne som mangler', async () => {
    skrevet = {
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'deleted_at' column of 'findings' in the schema cache" }
    };
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(503);
    expect((await res.json()).details).toContain('IKKE slettet');
  });

  it('svarer på svensk til en svensk leser', async () => {
    tilstand.sprak = 'sv';
    skrevet = { data: null, error: null };
    const body = await (await DELETE(req('DELETE'), params())).json();
    expect(body.error).toBe('Hittade inte fyndet');
    // Koden er den samme på begge språk — det er den klienter forgrener på.
    expect(body.code).toBe('not_found');
  });
});

describe('POST /api/findings/:id/restore', () => {
  it('nullstiller deleted_at', async () => {
    const res = await RESTORE(req('POST'), params());
    expect(res.status).toBe(200);
    expect(oppdateringer()).toHaveLength(1);
    expect(oppdateringer()[0].values).toEqual({ deleted_at: null });
  });

  /**
   * Uten dette filteret ville ruta vært en skjult skrivevei mot hvilken som
   * helst av eierens rader — ikke bare de slettede.
   */
  it('gjenoppretter bare rader som faktisk er slettet', async () => {
    await RESTORE(req('POST'), params());
    const skriv = oppdateringer()[0];
    expect(skriv.filters).toContainEqual({ kind: 'not.is', column: 'deleted_at', value: null });
    expect(skriv.filters).toContainEqual({ kind: 'eq', column: 'user_id', value: 'bruker-1' });
    expect(skriv.filters).toContainEqual({ kind: 'eq', column: 'id', value: ID });
  });

  it('svarer 404 når funnet ikke er slettet', async () => {
    skrevet = { data: null, error: null };
    const res = await RESTORE(req('POST'), params());
    expect(res.status).toBe(404);
  });

  it('krever innlogging', async () => {
    userId = null;
    const res = await RESTORE(req('POST'), params());
    expect(res.status).toBe(401);
    expect(ops).toHaveLength(0);
  });

  it('svarer på svensk til en svensk leser', async () => {
    tilstand.sprak = 'sv';
    skrevet = { data: null, error: { code: '42703', message: 'column "deleted_at" does not exist' } };
    const body = await (await RESTORE(req('POST'), params())).json();
    expect(body.error).toBe('Funktionen är inte aktiverad ännu');
    expect(body.details).toContain('Kunde inte återställa fyndet');
  });

  /**
   * Kommentaren i ruta lover at en gjenoppretting ikke flytter det viste
   * punktet. Det er migrasjon 042 som holder løftet, og den limes inn for
   * hånd. Med «Nylig slettet» er slett → angre blitt en vanlig runde, så en
   * manglende 042 skal ikke kunne gå ubemerket.
   */
  describe('kontrollen av at punktet står stille', () => {
    it('leser punktet før gjenopprettingen, avgrenset til eierens slettede rad', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(), error: null };
      await RESTORE(req('POST'), params());

      expect(lesinger()).toHaveLength(1);
      expect(lesinger()[0].filters).toContainEqual({ kind: 'eq', column: 'user_id', value: 'bruker-1' });
      expect(lesinger()[0].filters).toContainEqual({ kind: 'not.is', column: 'deleted_at', value: null });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('melder fra når gjenopprettingen flyttet punktet til et omtrentlig funn', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(FLYTTET), error: null };
      const res = await RESTORE(req('POST'), params());

      // Funnet skal tilbake uansett — kontrollen stopper aldri en gjenoppretting.
      expect(res.status).toBe(200);
      expect(logger.error).toHaveBeenCalledWith(
        'findings.jitter_guard_missing',
        expect.objectContaining({ flate: 'restore' })
      );
    });

    it('melder ikke fra for et privat funn, der det ikke finnes noe punkt å flytte', async () => {
      lest = { data: funn(), error: null };
      skrevet = { data: etterSkriving(UTEN_PUNKT), error: null };
      await RESTORE(req('POST'), params());
      expect(logger.error).not.toHaveBeenCalled();
    });

    /**
     * Lesingen og skrivingen er to kall. Ble delingen endret imellom, SKAL
     * punktet stemples på nytt — det er ikke et tegn på at vakten mangler.
     */
    it('melder ikke fra når delingen ble endret mellom lesingen og gjenopprettingen', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving({ is_zone_finding: true, display_latitude: 59.93, display_longitude: 10.71 }), error: null };
      await RESTORE(req('POST'), params());
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('gjenoppretter selv om lesingen på forhånd feiler', async () => {
      lest = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
      const res = await RESTORE(req('POST'), params());
      expect(res.status).toBe(200);
      expect(oppdateringer()).toHaveLength(1);
    });

    it('sender aldri punktet ut i svaret', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(), error: null };
      const body = await (await RESTORE(req('POST'), params())).json();
      expect(body).toEqual({ ok: true, id: 'funn-1' });
    });

    /** Det ruta aldri henter, kan den heller ikke lekke. */
    it('ber aldri databasen om den ekte posisjonen eller notatet', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(), error: null };
      await RESTORE(req('POST'), params());

      expect(ops).toHaveLength(2);
      for (const op of ops) {
        for (const forbudt of ['*', 'latitude', 'longitude', 'notes']) expect(bedtOm(op)).not.toContain(forbudt);
      }
    });
  });
});

describe('PATCH /api/findings/:id', () => {
  describe('adgang', () => {
    it('krever innlogging', async () => {
      userId = null;
      const res = await PATCH(req('PATCH', { notes: 'x' }), params());
      expect(res.status).toBe(401);
      expect(ops).toHaveLength(0);
    });

    it('avviser en id som ikke er en UUID', async () => {
      const res = await PATCH(req('PATCH', { notes: 'x' }), params("1' or '1'='1"));
      expect(res.status).toBe(400);
      expect(ops).toHaveLength(0);
    });

    it('avgrenser BÅDE lesingen og skrivingen til eierens egen, ikke-slettede rad', async () => {
      lest = { data: funn(), error: null };
      await PATCH(req('PATCH', { notes: 'Nytt notat' }), params());

      expect(ops.map((o) => o.op)).toEqual(['select', 'update']);
      for (const op of ops) {
        expect(op.filters).toContainEqual({ kind: 'eq', column: 'id', value: ID });
        expect(op.filters).toContainEqual({ kind: 'eq', column: 'user_id', value: 'bruker-1' });
        expect(op.filters).toContainEqual({ kind: 'is', column: 'deleted_at', value: null });
      }
    });

    /**
     * Finnes ikke, er ikke ditt, eller er slettet: lesingen gir ingen rad, og
     * svaret er det samme 404 for alle tre. Et slettet funn må gjenopprettes
     * før det kan endres.
     */
    it('svarer 404 og skriver ingenting når funnet ikke finnes, er en annens eller er slettet', async () => {
      lest = { data: null, error: null };
      const res = await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('not_found');
      expect(oppdateringer()).toHaveLength(0);
    });

    it('svarer 404 når funnet ble slettet mellom lesingen og skrivingen', async () => {
      lest = { data: funn(), error: null };
      skrevet = { data: null, error: null };
      const res = await PATCH(req('PATCH', { notes: 'x' }), params());
      expect(res.status).toBe(404);
    });
  });

  describe('hva som kan endres', () => {
    /**
     * En flyttet posisjon stempler display_* på nytt (migrasjon 042). Kunne
     * den endres her, ville «flytt fram og tilbake» gitt et nytt jitter-punkt
     * hver gang — og display_* direkte ville publisert et valgfritt punkt.
     */
    it.each([
      [{ latitude: 59.91, longitude: 10.75 }],
      [{ notes: 'x', latitude: 59.91 }],
      [{ lat: 59.91 }],
      [{ lng: 10.75 }],
      [{ display_latitude: 59.91, display_longitude: 10.75 }]
    ])('avviser posisjon uten å røre databasen: %j', async (body) => {
      lest = { data: funn(), error: null };
      const res = await PATCH(req('PATCH', body), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('position_not_editable');
      expect(ops).toHaveLength(0);
    });

    it.each([
      [{ imageUrl: 'https://example.com/a.jpg' }],
      [{ thumbnailUrl: 'https://example.com/a.jpg' }],
      [{ foundAt: '2020-01-01T00:00:00Z' }],
      [{ found_at: '2020-01-01T00:00:00Z' }],
      [{ aiUsed: false }],
      [{ user_id: 'bruker-2' }],
      [{ deleted_at: null }],
      [{ isNegativeObservation: true }]
    ])('avviser felt utenfor hvitelista: %j', async (body) => {
      lest = { data: funn(), error: null };
      const res = await PATCH(req('PATCH', body), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('unknown_field');
      expect(ops).toHaveLength(0);
    });

    it('avviser en tom eller uleselig forespørsel', async () => {
      expect((await PATCH(req('PATCH', {}), params())).status).toBe(400);
      expect((await PATCH(req('PATCH', '{ikke json'), params())).status).toBe(400);
      expect((await PATCH(req('PATCH', []), params())).status).toBe(400);
      expect(ops).toHaveLength(0);
    });

    it('skriver BARE notatet når bare notatet er endret', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(), error: null };
      const res = await PATCH(req('PATCH', { notes: '  Ved bekken  ' }), params());

      expect(res.status).toBe(200);
      expect(oppdateringer()[0].values).toEqual({ notes: 'Ved bekken' });
    });

    it('tømmer notatet når det sendes tomt', async () => {
      lest = { data: funn(), error: null };
      await PATCH(req('PATCH', { notes: '' }), params());
      expect(oppdateringer()[0].values).toEqual({ notes: null });
    });

    it('endrer art og eget artsnavn hver for seg', async () => {
      lest = { data: funn(), error: null };
      await PATCH(req('PATCH', { speciesId: 12 }), params());
      expect(oppdateringer()[0].values).toEqual({ species_id: 12 });

      ops = [];
      await PATCH(req('PATCH', { speciesId: null, speciesNameOverride: 'Rødgul piggsopp?' }), params());
      expect(oppdateringer()[0].values).toEqual({ species_id: null, species_name_override: 'Rødgul piggsopp?' });
    });

    it('svarer 400 når arten ikke finnes i artslista', async () => {
      lest = { data: funn(), error: null };
      skrevet = { data: null, error: { code: '23503', message: 'violates foreign key constraint' } };
      const res = await PATCH(req('PATCH', { speciesId: 99999 }), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('unknown_species');
    });

    /**
     * Hver UPDATE setter updated_at, og det er klokka delingskarantenen leser.
     * En lagring som ikke endrer noe, skal derfor aldri nå databasen.
     */
    it('skriver ikke når ingenting er forskjellig fra raden', async () => {
      lest = { data: funn(), error: null };
      const res = await PATCH(
        req('PATCH', { visibility: 'private', notes: 'Under den store grana', speciesId: 3 }),
        params()
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, id: 'funn-1', unchanged: true });
      expect(oppdateringer()).toHaveLength(0);
    });

    /**
     * Notatet er fritekst og kan være privat; koordinatene er det
     * maskeringen finnes for. Ingen av delene har noe i et svar å gjøre.
     */
    it('svarer uten notat og uten koordinater', async () => {
      lest = { data: omtrentlig({ notes: 'hemmelig' }), error: null };
      skrevet = { data: etterSkriving(), error: null };
      const res = await PATCH(req('PATCH', { notes: 'Bak hytta' }), params());

      const body = await res.json();
      expect(body).toEqual({ ok: true, id: 'funn-1', sharing: 'approximate' });
      expect(JSON.stringify(body)).not.toMatch(/Bak hytta|hemmelig|59\.94|10\.72/);
    });

    /**
     * Det ruta aldri henter, kan den heller ikke lekke. Den ekte posisjonen
     * trengs ikke for noe her, og notatet leses bare for å sammenlignes — det
     * skal aldri bes om tilbake fra skrivingen.
     */
    it('ber aldri databasen om den ekte posisjonen, og aldri om notatet tilbake', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(), error: null };
      await PATCH(req('PATCH', { notes: 'Bak hytta', speciesId: 12 }), params());

      expect(ops.map((o) => o.op)).toEqual(['select', 'update']);
      for (const op of ops) {
        for (const forbudt of ['*', 'latitude', 'longitude']) expect(bedtOm(op)).not.toContain(forbudt);
      }
      expect(bedtOm(oppdateringer()[0])).not.toContain('notes');
    });

    it('logger feltnavn, aldri innholdet', async () => {
      lest = { data: funn(), error: null };
      await PATCH(req('PATCH', { notes: 'Bak hytta til naboen' }), params());
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Bak hytta');
      expect(logger.info).toHaveBeenCalledWith('findings.updated', expect.objectContaining({ felt: ['notes'] }));
    });
  });

  describe('soneregler — de samme som ved lagring', () => {
    it.each(['public', 'private'])('avviser sone-funn med synlighet %s', async (visibility) => {
      lest = { data: funn(), error: null };
      const res = await PATCH(
        req('PATCH', { visibility, isZoneFinding: true, zoneLabel: 'Nordmarka sør', zonePrecisionKm: 5 }),
        params()
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('zone_requires_approximate');
      expect(ops).toHaveLength(0);
    });

    it('avviser en sone uten navn', async () => {
      const res = await PATCH(req('PATCH', { visibility: 'approximate', isZoneFinding: true }), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('zone_label_missing');
    });

    it('avviser soneinnstillinger uten synlighet', async () => {
      const res = await PATCH(req('PATCH', { isZoneFinding: false }), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('visibility_required');
    });

    /** Uten rutestørrelse i kroppen — slik «Endre deling» sender den. */
    it('gjør et privat funn til sone-funn når omgjøringen er åpen, uten å skrive rutestørrelse', async () => {
      tilstand.soneAapen = true;
      lest = { data: funn(), error: null };
      const res = await PATCH(
        req('PATCH', { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka sør' }),
        params()
      );
      expect(res.status).toBe(200);
      expect(oppdateringer()[0].values).toEqual({
        visibility: 'approximate',
        is_zone_finding: true,
        zone_label: 'Nordmarka sør'
      });
      expect((await res.json()).sharing).toBe('zone');
    });

    /**
     * public_findings viser zone_label for ALLE delte funn, ikke bare sonene.
     * Et navn som ble stående etter at sonen ble slått av, ville fortsatt
     * gått ut gjennom get_findings_in_bounds.
     */
    it('fjerner sonenavnet når sonen slås av', async () => {
      lest = {
        data: funn({ visibility: 'approximate', is_zone_finding: true, zone_label: 'Nordmarka sør', zone_precision_km: 3 }),
        error: null
      };
      await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(oppdateringer()[0].values).toEqual({ visibility: 'private', is_zone_finding: false, zone_label: null });
    });

    /**
     * Presisjonen er en av de fem kolonnene triggeren i 042 vokter. Lagrings-
     * flaten sender «5» også for funn uten sone; skrev ruta det på et
     * omtrentlig funn som står med 3, ville den trukket et nytt jitter-punkt.
     */
    it('skriver aldri sonepresisjon på et funn som ikke er sone', async () => {
      lest = { data: omtrentlig({ zone_precision_km: 3 }), error: null };
      const res = await PATCH(
        req('PATCH', { visibility: 'approximate', isZoneFinding: false, zoneLabel: null, zonePrecisionKm: 5 }),
        params()
      );
      expect((await res.json()).unchanged).toBe(true);
      expect(oppdateringer()).toHaveLength(0);
    });
  });

  /**
   * Sone-stempelet røpet funnets eksakte breddegrad til migrasjon 075, og
   * flere rutestørrelser for samme funn snevrer inn øst–vest også etter den.
   * Begrunnelsen står under «SONERUTA» i delingsendring.ts.
   */
  describe('sone-ruta legges ikke ut før den er trygg', () => {
    const TIL_SONE = { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka' };
    const sonefunn = (over: Record<string, unknown> = {}) =>
      funn({ visibility: 'approximate', is_zone_finding: true, zone_label: 'Nordmarka', zone_precision_km: 5, ...over });

    it.each([
      ['privat', funn()],
      ['omtrentlig', omtrentlig()],
      ['offentlig', funn({ visibility: 'public', display_latitude: 59.94, display_longitude: 10.72 })]
    ])('nekter å gjøre et %s funn om til sone så lenge omgjøringen er stengt', async (_navn, rad) => {
      tilstand.soneAapen = false;
      lest = { data: rad, error: null };
      const res = await PATCH(req('PATCH', TIL_SONE), params());

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('zone_unavailable');
      // Brukeren skal vite at ingenting skjedde, og hva som alltid går.
      expect(body.error).toContain('IKKE endret');
      expect(body.error).toContain('privat');
      expect(oppdateringer()).toHaveLength(0);
    });

    it('nekter uansett om funnet er nylig endret eller aldri rørt', async () => {
      tilstand.soneAapen = false;
      for (const updated_at of [forTimer(0.5), forTimer(48), '2026-09-01T08:00:00.000000+00:00']) {
        lest = { data: omtrentlig({ updated_at }), error: null };
        expect((await PATCH(req('PATCH', TIL_SONE), params())).status).toBe(503);
      }
      expect(oppdateringer()).toHaveLength(0);
    });

    it('skriver ikke notatet som fulgte med en avvist omgjøring', async () => {
      tilstand.soneAapen = false;
      lest = { data: omtrentlig(), error: null };
      const res = await PATCH(req('PATCH', { ...TIL_SONE, notes: 'Nytt notat' }), params());
      expect(res.status).toBe(503);
      expect(oppdateringer()).toHaveLength(0);
    });

    it('svarer på svensk for en svensk leser', async () => {
      tilstand.soneAapen = false;
      tilstand.sprak = 'sv';
      lest = { data: omtrentlig(), error: null };
      const body = await (await PATCH(req('PATCH', TIL_SONE), params())).json();
      expect(body.error).toContain('INTE ändrats');
      expect(body.error).toContain('zonfynd');
    });

    it('lar et funn som alt er sone, få nytt navn — også med stengt omgjøring', async () => {
      tilstand.soneAapen = false;
      lest = { data: sonefunn(), error: null };
      const res = await PATCH(req('PATCH', { ...TIL_SONE, zoneLabel: 'Marka nord' }), params());
      expect(res.status).toBe(200);
      expect(oppdateringer()[0].values).toEqual({ zone_label: 'Marka nord' });
    });

    it('lar et sone-funn bli privat med stengt omgjøring', async () => {
      tilstand.soneAapen = false;
      lest = { data: sonefunn({ updated_at: forTimer(0.5) }), error: null };
      const res = await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(res.status).toBe(200);
      expect(oppdateringer()[0].values).toEqual({ visibility: 'private', is_zone_finding: false, zone_label: null });
    });

    /** Ruta sender bryteren slik den står i koden — ikke en egen sannhet. */
    it('følger bryteren i delingsendring.ts når ingenting annet er sagt', async () => {
      lest = { data: omtrentlig(), error: null };
      const res = await PATCH(req('PATCH', TIL_SONE), params());
      expect(res.status).toBe(BRYTEREN_I_KODEN ? 200 : 503);
      expect(oppdateringer()).toHaveLength(BRYTEREN_I_KODEN ? 1 : 0);
    });

    it.each([
      ['åpen', true],
      ['stengt', false]
    ])('nekter et sone-funn en ny rutestørrelse (omgjøring %s)', async (_stilling, aapen) => {
      tilstand.soneAapen = aapen;
      for (const updated_at of [forTimer(0.01), forTimer(48), '2026-09-01T08:00:00.000000+00:00']) {
        lest = { data: sonefunn({ updated_at }), error: null };
        const res = await PATCH(req('PATCH', { ...TIL_SONE, zonePrecisionKm: 10 }), params());

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.code).toBe('zone_size_locked');
        expect(body.field).toBe('zonePrecisionKm');
        expect(body.error).toContain('IKKE endret');
      }
      expect(oppdateringer()).toHaveLength(0);
    });

    it('nekter en annen rutestørrelse enn raden står med, også når funnet gjøres om til sone', async () => {
      tilstand.soneAapen = true;
      lest = { data: omtrentlig({ zone_precision_km: 5 }), error: null };
      const res = await PATCH(req('PATCH', { ...TIL_SONE, zonePrecisionKm: 12 }), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('zone_size_locked');
      expect(oppdateringer()).toHaveLength(0);
    });

    it('skriver aldri kolonnen zone_precision_km, uansett hva patchen ber om', async () => {
      tilstand.soneAapen = true;
      const kropper = [
        TIL_SONE,
        { ...TIL_SONE, zonePrecisionKm: 5 },
        { ...TIL_SONE, zoneLabel: 'Marka', zonePrecisionKm: 5 },
        { visibility: 'private', zonePrecisionKm: 9 },
        { visibility: 'approximate', zonePrecisionKm: 9 }
      ];
      for (const rad of [funn(), omtrentlig(), sonefunn()]) {
        for (const kropp of kropper) {
          lest = { data: rad, error: null };
          await PATCH(req('PATCH', kropp), params());
        }
      }
      expect(oppdateringer().length).toBeGreaterThan(5);
      for (const op of oppdateringer()) expect(op.values).not.toHaveProperty('zone_precision_km');
    });

    it('logger hvorfor, uten noe om funnet', async () => {
      tilstand.soneAapen = false;
      lest = { data: omtrentlig(), error: null };
      await PATCH(req('PATCH', TIL_SONE), params());
      expect(logger.info).toHaveBeenCalledWith('findings.patch.zone_refused', { userId: 'bruker-1', grunn: 'omgjoring' });
    });
  });

  /**
   * Hver gang et funn går fra privat (eller sone) til omtrentlig, trekker
   * triggeren et NYTT tilfeldig punkt. Gjennomsnittet av punktene peker mot
   * det ekte stedet. Regelen og regnestykket står i delingsendring.ts.
   */
  describe('delingen kan strammes inn når som helst, men ikke åpnes igjen og igjen', () => {
    const nettoppEndret = { updated_at: forTimer(0.02) };

    it.each([
      ['omtrentlig', omtrentlig(nettoppEndret)],
      ['offentlig', funn({ visibility: 'public', display_latitude: 59.94, display_longitude: 10.72, ...nettoppEndret })],
      [
        'sone',
        funn({ visibility: 'approximate', is_zone_finding: true, zone_label: 'Nordmarka', ...nettoppEndret })
      ]
    ])('gjør et %s funn privat selv om det nettopp er endret', async (_navn, rad) => {
      lest = { data: rad, error: null };
      const res = await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(res.status).toBe(200);
      expect(oppdateringer()[0].values).toMatchObject({ visibility: 'private' });
      expect((await res.json()).sharing).toBe('private');
    });

    it('lar et funn som aldri er endret, deles omtrentlig med en gang', async () => {
      lest = { data: funn(), error: null };
      const res = await PATCH(req('PATCH', { visibility: 'approximate' }), params());
      expect(res.status).toBe(200);
      expect(oppdateringer()[0].values).toEqual({ visibility: 'approximate' });
    });

    it('lar et funn som har stått urørt i over et døgn, deles omtrentlig', async () => {
      lest = { data: funn({ updated_at: forTimer(24.5) }), error: null };
      const res = await PATCH(req('PATCH', { visibility: 'approximate' }), params());
      expect(res.status).toBe(200);
    });

    it('nekter å dele omtrentlig på nytt når funnet er endret det siste døgnet', async () => {
      lest = { data: funn({ updated_at: forTimer(2) }), error: null };
      const res = await PATCH(req('PATCH', { visibility: 'approximate' }), params());

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe('sharing_cooldown');
      // 22 timer igjen av døgnet.
      expect(body.availableAt).toBe('2026-11-11T10:00:00.000Z');
      expect(res.headers.get('Retry-After')).toBe(String(22 * 60 * 60));
      // Tidspunktet står i norsk tid (UTC+1 i november), ikke serverens UTC.
      expect(body.error).toContain('11. november');
      expect(body.error).toContain('11:00');
      // Og ingenting er skrevet.
      expect(oppdateringer()).toHaveLength(0);
    });

    /**
     * Selve angrepet, spilt gjennom: privat → omtrentlig → privat →
     * omtrentlig. Mellom hvert steg står raden slik databasen ville etterlatt
     * den, med updated_at satt av triggeren.
     */
    it('slipper gjennom ÉN åpning når eieren veksler fram og tilbake', async () => {
      let rad = funn();
      const sett = async (visibility: string) => {
        lest = { data: rad, error: null };
        skrevet = { data: etterSkriving({ visibility, display_latitude: null, display_longitude: null }), error: null };
        const res = await PATCH(req('PATCH', { visibility }), params());
        if (res.status === 200) rad = { ...rad, visibility, updated_at: new Date().toISOString() };
        // Brukeren trenger noen sekunder på neste trykk.
        vi.setSystemTime(new Date(Date.now() + 5_000));
        return res.status;
      };

      const statuser = [];
      for (const visibility of ['approximate', 'private', 'approximate', 'private', 'approximate']) {
        statuser.push(await sett(visibility));
      }

      // Første åpning går (funnet var aldri endret). Innstrammingene går
      // alltid. Hver ny åpning samme døgn stopper.
      expect(statuser).toEqual([200, 200, 429, 200, 429]);
      const aapninger = oppdateringer().filter((o) => o.values.visibility === 'approximate');
      expect(aapninger).toHaveLength(1);
    });

    it('nekter veien om sone tilbake til omtrentlig samme døgn', async () => {
      lest = {
        data: funn({ visibility: 'approximate', is_zone_finding: true, zone_label: 'Nordmarka', updated_at: forTimer(1) }),
        error: null
      };
      const res = await PATCH(req('PATCH', { visibility: 'approximate', isZoneFinding: false }), params());
      expect(res.status).toBe(429);
      expect(oppdateringer()).toHaveLength(0);
    });

    /**
     * Rutenettet er regnet ut, ikke trukket: samme funn og samme størrelse gir
     * samme rute hver gang. Gjentakelse forteller ingenting nytt — derfor er
     * sone ikke karantenebelagt når omgjøringen er åpen.
     */
    it('lar et nylig endret funn bli sone-funn i sin egen rutestørrelse når omgjøringen er åpen', async () => {
      tilstand.soneAapen = true;
      lest = { data: funn({ updated_at: forTimer(1) }), error: null };
      const tilSone = await PATCH(
        req('PATCH', { visibility: 'approximate', isZoneFinding: true, zoneLabel: 'Nordmarka', zonePrecisionKm: 5 }),
        params()
      );
      expect(tilSone.status).toBe(200);
      expect(oppdateringer()[0].values).toEqual({
        visibility: 'approximate',
        is_zone_finding: true,
        zone_label: 'Nordmarka'
      });
    });

    /** Fra eksakt punkt til omtrentlig er en innstramming: det eksakte har alt vært synlig. */
    it('lar et offentlig funn bli omtrentlig selv om det nettopp er endret', async () => {
      lest = {
        data: funn({ visibility: 'public', display_latitude: 59.94, display_longitude: 10.72, updated_at: forTimer(0.5) }),
        error: null
      };
      const res = await PATCH(req('PATCH', { visibility: 'approximate' }), params());
      expect(res.status).toBe(200);
    });

    /**
     * Uten denne ville privat → offentlig → omtrentlig vært en vei rundt
     * karantenen: det siste steget er en innstramming og går alltid.
     */
    it.each([
      ['privat', funn({ updated_at: forTimer(3) })],
      ['omtrentlig', omtrentlig({ updated_at: forTimer(3) })]
    ])('nekter å legge ut det eksakte punktet til et nylig endret %s funn', async (_navn, rad) => {
      lest = { data: rad, error: null };
      const res = await PATCH(req('PATCH', { visibility: 'public' }), params());
      expect(res.status).toBe(429);
      expect(oppdateringer()).toHaveLength(0);
    });

    it('nekter hele endringen når den ene delen må vente — notatet lagres ikke alene', async () => {
      lest = { data: funn({ updated_at: forTimer(2) }), error: null };
      const res = await PATCH(req('PATCH', { visibility: 'approximate', notes: 'Nytt' }), params());
      expect(res.status).toBe(429);
      expect(oppdateringer()).toHaveLength(0);
    });

    it('lar notatet endres uansett karantene', async () => {
      lest = { data: funn({ updated_at: forTimer(2) }), error: null };
      const res = await PATCH(req('PATCH', { notes: 'Nytt' }), params());
      expect(res.status).toBe(200);
    });

    it('skriver karantenebeskjeden på svensk, i svensk tid', async () => {
      tilstand.sprak = 'sv';
      lest = { data: funn({ updated_at: forTimer(2) }), error: null };
      const body = await (await PATCH(req('PATCH', { visibility: 'approximate' }), params())).json();
      expect(body.error).toContain('Fyndet har ändrats det senaste dygnet');
      expect(body.error).toContain('11 november');
      expect(body.error).toContain('11:00');
    });

    /**
     * «Alltid» skal bety alltid: den som har rettet tretti notater på rad og
     * brukt opp endringsbudsjettet sitt, skal fortsatt kunne skjule et sted.
     */
    it('lar et funn bli privat selv når endringsbudsjettet er brukt opp', async () => {
      lest = { data: funn(), error: null };
      let sisteStatus = 0;
      for (let i = 0; i <= 30; i += 1) {
        sisteStatus = (await PATCH(req('PATCH', { notes: `utkast ${i}` }), params())).status;
      }
      expect(sisteStatus).toBe(429);

      lest = { data: omtrentlig(), error: null };
      const res = await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(res.status).toBe(200);
    });
  });

  /**
   * Et rettet notat skal ikke flytte prikken. Det er migrasjon 042 som sørger
   * for det, og en manglende 042 gir ingen feilkode — bare et punkt som stille
   * har flyttet seg. Ruta ser det på display_* før og etter (jittervakt.ts).
   */
  describe('snubletråden for vakten i migrasjon 042', () => {
    const flyttet = etterSkriving(FLYTTET);
    const iRo = etterSkriving();

    it('er stille når punktet står i ro', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: iRo, error: null };
      await PATCH(req('PATCH', { notes: 'a' }), params());
      expect(logger.error).not.toHaveBeenCalled();

      ops = [];
      const res = await PATCH(req('PATCH', { notes: 'b' }), params());
      expect(res.status).toBe(200);
    });

    it('melder fra og stopper de neste notatendringene når punktet flyttet seg', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: flyttet, error: null };
      const forste = await PATCH(req('PATCH', { notes: 'a' }), params());
      // Denne ene er allerede skrevet — notatet ER lagret.
      expect(forste.status).toBe(200);
      expect(logger.error).toHaveBeenCalledWith(
        'findings.jitter_guard_missing',
        expect.objectContaining({ flate: 'patch' })
      );

      ops = [];
      const neste = await PATCH(req('PATCH', { notes: 'b' }), params());
      expect(neste.status).toBe(503);
      expect((await neste.json()).code).toBe('guard_missing');
      expect(oppdateringer()).toHaveLength(0);
    });

    it('lar funnet bli privat også etter at snubletråden er utløst', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: flyttet, error: null };
      await PATCH(req('PATCH', { notes: 'a' }), params());

      const res = await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(res.status).toBe(200);
    });

    it('stopper ikke notatendringer på funn uten tilfeldig punkt', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: flyttet, error: null };
      await PATCH(req('PATCH', { notes: 'a' }), params());

      // Privat: ingen punkt. Sone: regnet ut, ikke trukket.
      lest = { data: funn(), error: null };
      skrevet = { data: etterSkriving(UTEN_PUNKT), error: null };
      expect((await PATCH(req('PATCH', { notes: 'b' }), params())).status).toBe(200);
    });

    /**
     * To faner, eller et dobbelt trykk: en annen forespørsel gjorde funnet
     * privat mellom lesingen og skrivingen her. Da SKAL punktet være borte —
     * og ett slikt sammenfall skal ikke slå på nødbremsen for alle.
     */
    it('regner ikke et punkt som ble stemplet på nytt av en samtidig delingsendring som en feil', async () => {
      lest = { data: omtrentlig(), error: null };
      skrevet = { data: etterSkriving(UTEN_PUNKT), error: null };
      expect((await PATCH(req('PATCH', { notes: 'a' }), params())).status).toBe(200);
      expect(logger.error).not.toHaveBeenCalled();

      // Og de neste notatendringene går som før.
      skrevet = { data: iRo, error: null };
      expect((await PATCH(req('PATCH', { notes: 'b' }), params())).status).toBe(200);
    });

    it('regner ikke en ønsket ny stempling som en feil', async () => {
      // Privat → omtrentlig SKAL gi et nytt punkt.
      lest = { data: funn(), error: null };
      skrevet = { data: flyttet, error: null };
      await PATCH(req('PATCH', { visibility: 'approximate' }), params());
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('når databasen ikke er klar', () => {
    it('sier at funnet IKKE er endret når deleted_at-kolonnen mangler', async () => {
      lest = { data: null, error: { code: '42703', message: 'column findings.deleted_at does not exist' } };
      const res = await PATCH(req('PATCH', { visibility: 'private' }), params());
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.details).toContain('IKKE endret');
      expect(oppdateringer()).toHaveLength(0);
    });

    it('svarer 500 uten å skrive når lesingen feiler', async () => {
      lest = { data: null, error: { code: '57014', message: 'statement timeout' } };
      const res = await PATCH(req('PATCH', { notes: 'x' }), params());
      expect(res.status).toBe(500);
      expect(oppdateringer()).toHaveLength(0);
    });

    it('svarer 500 når skrivingen feiler', async () => {
      lest = { data: funn(), error: null };
      skrevet = { data: null, error: { code: '57014', message: 'statement timeout' } };
      const res = await PATCH(req('PATCH', { notes: 'x' }), params());
      expect(res.status).toBe(500);
      expect((await res.json()).code).toBe('update_failed');
    });
  });
});
