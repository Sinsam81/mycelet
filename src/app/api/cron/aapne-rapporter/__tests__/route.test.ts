import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Kveldsvarselet om meldt innhold som venter.
 *
 * Dagsrapporten kl. 06:00 UTC var det eneste som sa fra om en ny melding i
 * forumet, så ventetiden til første varsel kunne bli like lang som fristen
 * på 24 timer. Denne jobben går tolv timer etter. Låst her:
 *
 *  - den er stille når ingenting venter — ingen e-post, ikke en «alt vel»;
 *  - den sender dagsrapportens egne ord når noe venter, til samme postkasse;
 *  - en lesing som feiler ser ikke ut som stillhet;
 *  - den leser bare (én spørring, konsollens regel for «åpen»), og skriver aldri.
 */

// Kl. 20:00 norsk tid, 15. september.
const NAA = new Date('2026-09-15T18:00:00Z');
const LENKE = 'https://www.mycelet.com/forum/moderation';

interface Kall {
  tabell: string;
  metode: string;
  args: unknown[];
}

type Svar = { data: unknown; count?: number | null; error: { code?: string; message?: string } | null };

let rapporterSvar: Svar = { data: [], count: 0, error: null };
let kall: Kall[] = [];
let adminKaster = false;

/** Verdien cronen er satt opp med i testen. Den ekte sjekken kjøres — ingen mock. */
const HEMMELIGHET = 'kveldsvarsel-testverdi';

/**
 * Bare lesemetoder. Kaller ruta noe annet (insert, update, delete, upsert),
 * finnes ikke metoden, og testen feiler — varselet skal aldri skrive.
 */
function makeAdminClient() {
  return {
    from(tabell: string) {
      const bygger: Record<string, unknown> = {};
      for (const metode of ['select', 'order', 'limit', 'in']) {
        bygger[metode] = (...args: unknown[]) => {
          kall.push({ tabell, metode, args });
          return bygger;
        };
      }
      bygger.then = (resolve: (v: Svar) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rapporterSvar).then(resolve, reject);
      return bygger;
    }
  };
}

interface Sendt {
  til: string;
  emne: string;
  html: string;
  tekst: string;
  idempotensNokkel?: string;
}
const epost = vi.hoisted(() => ({
  sendEpost: vi.fn(async (_args: unknown): Promise<{ ok: boolean; detalj: string }> => ({ ok: true, detalj: 'sendt' }))
}));
const logg = vi.hoisted(() => {
  const l = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => l };
  return l;
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (adminKaster) throw new Error('Supabase admin client mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY');
    return makeAdminClient();
  }
}));
vi.mock('@/lib/email/send', () => epost);
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logg }));

const { GET, maxDuration } = await import('../route');

function kjor(authorization: string | null = `Bearer ${HEMMELIGHET}`) {
  return GET(
    new NextRequest('https://www.mycelet.com/api/cron/aapne-rapporter', authorization === null ? undefined : { headers: { authorization } })
  );
}

function sendt(): Sendt {
  expect(epost.sendEpost).toHaveBeenCalledTimes(1);
  return epost.sendEpost.mock.calls[0][0] as Sendt;
}

const timerSiden = (t: number) => new Date(NAA.getTime() - t * 3_600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NAA);
  kall = [];
  rapporterSvar = { data: [], count: 0, error: null };
  adminKaster = false;
  vi.stubEnv('CRON_SECRET', HEMMELIGHET);
  epost.sendEpost.mockClear();
  epost.sendEpost.mockImplementation(async () => ({ ok: true, detalj: 'sendt' }));
  logg.info.mockClear();
  logg.warn.mockClear();
  logg.error.mockClear();
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('kveldsvarselet er stille når ingenting venter', () => {
  it('ingen åpne rapporter: ingen e-post', async () => {
    const res = await kjor();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sendt: boolean; moderering: { maalt: boolean; antall: number } };
    expect(body).toMatchObject({ ok: true, sendt: false, moderering: { maalt: true, antall: 0 } });
    expect(epost.sendEpost).not.toHaveBeenCalled();
    expect(logg.warn).not.toHaveBeenCalled();
    expect(logg.error).not.toHaveBeenCalled();
  });

  it('uten riktig hemmelighet: 401, ingen lesing og ingen e-post', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(30) }], count: 2, error: null };
    for (const forsok of [null, 'Bearer feil-verdi', HEMMELIGHET, `bearer ${HEMMELIGHET}`]) {
      const res = await kjor(forsok);
      expect(res.status, String(forsok)).toBe(401);
      expect(await res.json()).toEqual({ error: 'Ikke autorisert' });
    }
    expect(kall).toEqual([]);
    expect(epost.sendEpost).not.toHaveBeenCalled();
  });

  it('uten CRON_SECRET i miljøet slipper ingen inn — heller ikke med tom verdi', async () => {
    vi.stubEnv('CRON_SECRET', '');
    for (const forsok of [null, 'Bearer ', `Bearer ${HEMMELIGHET}`]) {
      expect((await kjor(forsok)).status, String(forsok)).toBe(401);
    }
    expect(kall).toEqual([]);
  });
});

describe('kveldsvarselet når noe venter', () => {
  it('én åpen, meldt for to timer siden: e-post med klokkeslettet fristen går ut og lenke til konsollen', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(2) }], count: 1, error: null };

    const res = await kjor();
    expect(res.status).toBe(200);

    const e = sendt();
    expect(e.til).toBe('post@mycelet.com');
    expect(e.emne).toBe('Mycelet: ⚠️ 1 åpen rapport — frist i morgen kl. 18:00');
    for (const variant of [e.html, e.tekst]) {
      expect(variant).toContain('⚠️ 1 åpen rapport i forumet — den har ventet 2 t, fristen på 24 t går ut i morgen kl. 18:00.');
      expect(variant).toContain('Behandle den før det: ');
      expect(variant).toContain(LENKE);
    }
    expect((await res.json()) as unknown).toMatchObject({ ok: true, sendt: true, moderering: { antall: 1, eldsteTimer: 2, overFrist: false, haster: false } });
    expect(logg.warn).not.toHaveBeenCalled();
  });

  it('meldingen som kom rett etter dagsrapporten: første varsel nå, med «nå» — ikke i morgen tidlig med ti minutter igjen', async () => {
    // Meldt 06:10 UTC. Før sto den første gang i rapporten 06:00 neste dag.
    rapporterSvar = { data: [{ created_at: '2026-09-15T06:10:00Z' }], count: 1, error: null };
    await kjor();
    const e = sendt();
    expect(e.emne).toBe('Mycelet: ⚠️ 1 åpen rapport — frist i morgen kl. 08:10');
    expect(e.tekst).toContain('den har ventet 11 t, fristen på 24 t går ut i morgen kl. 08:10.');
    expect(e.tekst).toContain(`Behandle den nå: ${LENKE}`);
    // Ikke over ennå: gult.
    expect(e.html).toContain('background:#fffbeb');
  });

  it('over døgnfristen: rødt, «over døgnfristen» i emnet, og et spor i loggen', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(30) }], count: 3, error: null };
    await kjor();
    const e = sendt();
    expect(e.emne).toBe('Mycelet: ⚠️ 3 åpne rapporter over døgnfristen');
    expect(e.tekst).toContain('3 åpne rapporter i forumet — den eldste har ventet 30 t, fristen på 24 t gikk ut i dag kl. 14:00.');
    expect(e.tekst).toContain(`Behandle dem nå: ${LENKE}`);
    expect(e.html).toContain('background:#fef2f2');
    expect(logg.warn).toHaveBeenCalledWith('aapne_rapporter.over_frist', { antall: 3, eldsteTimer: 30, overFrist: true, haster: true });
  });

  it('samme time, samme e-post: nøkkelen følger timen, ikke datoen', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(2) }], count: 1, error: null };
    await kjor();
    expect(sendt().idempotensNokkel).toBe('aapne-rapporter/2026-09-15T18');

    // En kjøring for hånd tidligere på dagen har en annen nøkkel, og kan
    // derfor ikke stilne kveldens varsel.
    epost.sendEpost.mockClear();
    vi.setSystemTime(new Date('2026-09-15T10:30:00Z'));
    await kjor();
    expect(sendt().idempotensNokkel).toBe('aapne-rapporter/2026-09-15T10');
  });

  it('noe venter, og e-posten gikk ikke ut: kjøringen står som feilet', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(2) }], count: 1, error: null };
    epost.sendEpost.mockImplementation(async () => ({ ok: false, detalj: 'Resend 500' }));

    const res = await kjor();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'Varselet ble ikke sendt', sendt: false, detalj: 'Resend 500' });
    expect(logg.error).toHaveBeenCalledWith('aapne_rapporter.ikke_sendt', expect.objectContaining({ antall: 1, detalj: 'Resend 500' }));
  });
});

describe('kveldsvarselet leser bare', () => {
  it('én spørring mot reports, med konsollens regel for «åpen», og bare tidsstempelet', async () => {
    rapporterSvar = { data: [{ created_at: timerSiden(2) }], count: 1, error: null };
    await kjor();
    expect([...new Set(kall.map((k) => k.tabell))]).toEqual(['reports']);
    expect(kall.find((k) => k.metode === 'select')?.args).toEqual(['created_at', { count: 'exact' }]);
    expect(kall.find((k) => k.metode === 'in')?.args).toEqual(['status', ['pending', 'reviewed']]);
    expect(kall.find((k) => k.metode === 'order')?.args).toEqual(['created_at', { ascending: true }]);
    expect(kall.find((k) => k.metode === 'limit')?.args).toEqual([1]);
  });

  it('e-posten sier ingenting om hva som er meldt eller av hvem — selv om raden skulle ha det med', async () => {
    rapporterSvar = {
      data: [{ created_at: timerSiden(2), reporter_id: 'reporter-uuid', description: 'hemmelig beskrivelse', reason: 'dangerous_advice' }],
      count: 1,
      error: null
    };
    const res = await kjor();
    const alt = JSON.stringify([sendt(), await res.json()]);
    for (const lekkasje of ['reporter-uuid', 'hemmelig beskrivelse', 'dangerous_advice']) {
      expect(alt).not.toContain(lekkasje);
    }
  });
});

describe('en lesing som feiler ser ikke ut som stillhet', () => {
  it('tabellen svarer med feil: «ikke målt» på e-post, 500 og feil i loggen — aldri ingenting', async () => {
    rapporterSvar = { data: null, count: null, error: { message: 'connection reset' } };

    const res = await kjor();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Kunne ikke lese åpne rapporter', sendt: true });

    const e = sendt();
    expect(e.til).toBe('post@mycelet.com');
    expect(e.emne).toBe('Mycelet: ⚠️ åpne rapporter ikke målt i kveld');
    expect(e.tekst).toContain('Kveldssjekken fikk ikke lest åpne rapporter i forumet, så det er ikke kjent om noe venter.');
    expect(e.tekst).toContain(`Se etter selv: ${LENKE}`);
    // Egen nøkkel: et vellykket forsøk i samme time skal fortsatt kunne varsle.
    expect(e.idempotensNokkel).toBe('aapne-rapporter/2026-09-15T18/ikke-maalt');
    expect(logg.error).toHaveBeenCalledWith('aapne_rapporter.lesing_feilet', { message: 'connection reset', mangler: false });
  });

  it('svaret mangler telling: også «ikke målt» — «0 åpne» er aldri en gjetning', async () => {
    rapporterSvar = { data: [], count: null, error: null };
    const res = await kjor();
    expect(res.status).toBe(500);
    expect(sendt().emne).toBe('Mycelet: ⚠️ åpne rapporter ikke målt i kveld');
  });

  it('uten tjenestenøkkel: samme vei som en lesefeil, ikke et ubehandlet unntak', async () => {
    adminKaster = true;
    const res = await kjor();
    expect(res.status).toBe(500);
    expect(sendt().emne).toBe('Mycelet: ⚠️ åpne rapporter ikke målt i kveld');
    expect(logg.error).toHaveBeenCalledWith('aapne_rapporter.lesing_feilet', expect.objectContaining({ mangler: false }));
  });
});

describe('rammene', () => {
  it('ruta har et tak', () => {
    expect(maxDuration).toBe(30);
  });
});
