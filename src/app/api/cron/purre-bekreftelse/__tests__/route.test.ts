import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { PURRE_KALL_FRIST_MS, PURRE_KJORETID_FRIST_MS, PURRE_MARKOR } from '@/lib/onboarding/purre';

/**
 * Purre-cronens kontrakt, uten Supabase og uten Resend: fetch og sendEpost er
 * erstattet, så verken kontoer eller innbokser røres herfra.
 *
 * Tre ting låses:
 *
 *   · e-posten går på språket kontoen ble opprettet på (user_metadata.sprak) —
 *     den var norsk for alle
 *   · hvert kall ut har en frist, og et kall som ikke svarer i tide gir de
 *     samme forsiktige utfallene som et kall som feiler: aldri en e-post uten
 *     merke, aldri to purringer
 *   · MERK FØR SENDING står fortsatt
 */

interface Bruker {
  id: string;
  email: string;
  created_at: string;
  email_confirmed_at: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown> | null;
}

const BASE = 'https://prosjekt.example.com';
const NAA = '2026-09-25T07:00:00.000Z';
const forToDognSiden = new Date(Date.parse(NAA) - 48 * 3600_000).toISOString();

let brukere: Bruker[] = [];
/** Hva hvert slags kall skal gjøre: 'ok', en HTTP-status, eller 'henger' (fristen utløses). */
let oppforsel: { liste: 'ok' | 'henger' | number; lenke: Record<string, 'henger' | number>; merke: Record<string, 'henger' | number> };
/** Rekkefølgen på det som skjer, f.eks. «lenke:u1», «merke:u1», «send:u1». */
let hendelser: string[] = [];
/** Kroppen i hvert merkekall — sjekkes i testene, ikke inne i fetch-erstatningen. */
let merkekropper: unknown[] = [];
let signaler: Array<{ hva: string; signal: unknown }> = [];
let sendte: Array<{ til: string; emne: string; html: string; tekst: string }> = [];
let sendingOk = true;
/** Kjøres idet en e-post «sendes» — brukes til å la klokka gå. */
let vedSending: () => void = () => undefined;

const tidsavbrudd = () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: (h: string | null) => h === 'Bearer hemmelig' }));
const logger = vi.hoisted(() => {
  const l = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => l };
  return l;
});
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logger }));
vi.mock('@/lib/email/send', () => ({
  sendEpost: async (args: { til: string; emne: string; html: string; tekst: string }) => {
    const bruker = brukere.find((b) => b.email === args.til);
    hendelser.push(`send:${bruker?.id}`);
    sendte.push(args);
    vedSending();
    return sendingOk ? { ok: true, detalj: 'sendt' } : { ok: false, detalj: 'Resend 500' };
  }
}));

const { GET } = await import('../route');

function kall(auth = 'Bearer hemmelig') {
  return GET({
    headers: new Headers({ authorization: auth, 'x-request-id': 't' }),
    url: 'http://x/api/cron/purre-bekreftelse',
    nextUrl: new URL('http://x/api/cron/purre-bekreftelse')
  } as unknown as NextRequest);
}

/** Kjører cronen til ende — pausen mellom utsendingene er en ekte setTimeout. */
async function kjor(auth?: string) {
  const svar = kall(auth);
  await vi.runAllTimersAsync();
  const res = await svar;
  return { status: res.status, kropp: (await res.json()) as Record<string, unknown> };
}

function bruker(id: string, over: Partial<Bruker> = {}): Bruker {
  return {
    id,
    email: `${id}@example.com`,
    created_at: forToDognSiden,
    email_confirmed_at: null,
    app_metadata: {},
    user_metadata: {},
    ...over
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(NAA));
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', BASE);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'ikke-en-ekte-verdi');
  brukere = [bruker('u1')];
  oppforsel = { liste: 'ok', lenke: {}, merke: {} };
  hendelser = [];
  merkekropper = [];
  signaler = [];
  sendte = [];
  sendingOk = true;
  vedSending = () => undefined;
  logger.info.mockClear();
  logger.warn.mockClear();
  logger.error.mockClear();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const sti = url.slice(BASE.length);
      if (sti.startsWith('/auth/v1/admin/users?')) {
        signaler.push({ hva: 'liste', signal: init.signal });
        if (oppforsel.liste === 'henger') return tidsavbrudd();
        if (oppforsel.liste !== 'ok') return json({}, oppforsel.liste);
        return json({ users: brukere });
      }
      if (sti === '/auth/v1/admin/generate_link') {
        const epost = (JSON.parse(String(init.body)) as { email: string }).email;
        const id = brukere.find((b) => b.email === epost)?.id ?? '?';
        hendelser.push(`lenke:${id}`);
        signaler.push({ hva: 'lenke', signal: init.signal });
        const o = oppforsel.lenke[id];
        if (o === 'henger') return tidsavbrudd();
        if (typeof o === 'number') return json({}, o);
        return json({ hashed_token: `token-${id}` });
      }
      const merke = /^\/auth\/v1\/admin\/users\/([^/?]+)$/.exec(sti);
      if (merke && init.method === 'PUT') {
        const id = merke[1];
        hendelser.push(`merke:${id}`);
        signaler.push({ hva: 'merke', signal: init.signal });
        const o = oppforsel.merke[id];
        if (o === 'henger') return tidsavbrudd();
        if (typeof o === 'number') return json({}, o);
        merkekropper.push(JSON.parse(String(init.body)));
        return json({});
      }
      throw new Error(`uventet kall: ${init.method ?? 'GET'} ${sti}`);
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('purre-cronen — hvem som slipper inn', () => {
  it('uten cron-hemmeligheten: 401, og ingenting hentes', async () => {
    const { status } = await kjor('Bearer feil');
    expect(status).toBe(401);
    expect(signaler).toEqual([]);
    expect(sendte).toEqual([]);
  });

  it('uten Supabase-miljø: 503, ingenting sendes', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { status, kropp } = await kjor();
    expect(status).toBe(503);
    expect(kropp.ok).toBe(false);
    expect(sendte).toEqual([]);
  });
});

describe('purre-cronen — merk før sending', () => {
  it('én kandidat: lenke, så merke, så e-post — med vår egen bekreftelseslenke', async () => {
    const { status, kropp } = await kjor();
    expect(status).toBe(200);
    expect(kropp).toEqual({ ok: true, sendt: 1, hoppetOver: 0, utsatt: 0, kandidater: 1 });
    expect(hendelser).toEqual(['lenke:u1', 'merke:u1', 'send:u1']);
    // Merket ligger i app_metadata — feltet brukeren ikke kan endre selv.
    expect(merkekropper).toEqual([{ app_metadata: { [PURRE_MARKOR]: NAA } }]);
    expect(sendte[0].til).toBe('u1@example.com');
    expect(sendte[0].html).toContain('https://www.mycelet.com/auth/confirm?token_hash=token-u1');
    expect(sendte[0].tekst).toContain('https://www.mycelet.com/auth/confirm?token_hash=token-u1');
  });

  it('feiler merkingen, sendes ingenting — ellers kunne samme konto fått en purring hver dag', async () => {
    oppforsel.merke.u1 = 500;
    const { kropp } = await kjor();
    expect(kropp).toMatchObject({ sendt: 0, hoppetOver: 1 });
    expect(sendte).toEqual([]);
  });

  it('feiler utsendingen etter merkingen, står merket: én tapt purring, aldri to', async () => {
    sendingOk = false;
    const { kropp } = await kjor();
    expect(kropp).toMatchObject({ sendt: 0, hoppetOver: 1 });
    expect(hendelser).toEqual(['lenke:u1', 'merke:u1', 'send:u1']);
  });

  it('bekreftede, alt purrede og interne kontoer røres ikke', async () => {
    brukere = [
      bruker('bekreftet', { email_confirmed_at: forToDognSiden }),
      bruker('purret', { app_metadata: { [PURRE_MARKOR]: '2026-09-24T07:00:00Z' } }),
      bruker('intern', { email: 'applereview@mycelet.com' })
    ];
    const { kropp } = await kjor();
    expect(kropp).toMatchObject({ sendt: 0, kandidater: 0 });
    expect(hendelser).toEqual([]);
  });
});

describe('purre-cronen — språket kontoen ble opprettet på', () => {
  it('svensk konto får svensk e-post, norsk konto norsk', async () => {
    brukere = [bruker('svensk', { user_metadata: { sprak: 'sv' } }), bruker('norsk', { user_metadata: { sprak: 'nb' } })];
    await kjor();
    const svensk = sendte.find((e) => e.til === 'svensk@example.com');
    const norsk = sendte.find((e) => e.til === 'norsk@example.com');
    expect(svensk?.emne).toBe('Slutför din registrering hos Mycelet');
    expect(svensk?.html).toContain('<html lang="sv">');
    expect(svensk?.html).not.toMatch(/[æøÆØ]/);
    expect(svensk?.tekst).not.toMatch(/[æøÆØ]/);
    expect(norsk?.emne).toBe('Fullfør registreringen din hos Mycelet');
    expect(norsk?.html).toContain('<html lang="nb">');
  });

  it('uten lagret språk (kontoer fra før 14.09.2026), uten metadata eller med en ukjent verdi: norsk', async () => {
    brukere = [
      bruker('uten', { user_metadata: {} }),
      bruker('null', { user_metadata: null }),
      bruker('mangler', { user_metadata: undefined }),
      bruker('engelsk', { user_metadata: { sprak: 'en' } }),
      bruker('tall', { user_metadata: { sprak: 7 } })
    ];
    await kjor();
    expect(sendte).toHaveLength(5);
    for (const e of sendte) expect(e.emne, e.til).toBe('Fullfør registreringen din hos Mycelet');
  });

  it('språket gjettes aldri fra tidssonen: norskspråklig konto i Stockholm får norsk', async () => {
    brukere = [
      bruker('norsk-i-sverige', { user_metadata: { sprak: 'nb', tidssone: 'Europe/Stockholm' } }),
      bruker('bare-tidssone', { user_metadata: { tidssone: 'Europe/Stockholm' } })
    ];
    await kjor();
    for (const e of sendte) expect(e.emne, e.til).toBe('Fullfør registreringen din hos Mycelet');
  });
});

describe('purre-cronen — hvert kall ut har en frist', () => {
  it('alle tre slags kall mot Supabase bærer et avbruddssignal', async () => {
    const frist = vi.spyOn(AbortSignal, 'timeout');
    await kjor();
    expect(signaler.map((s) => s.hva)).toEqual(['liste', 'lenke', 'merke']);
    for (const s of signaler) expect(s.signal, s.hva).toBeInstanceOf(AbortSignal);
    expect(frist).toHaveBeenCalledTimes(3);
    for (const [ms] of frist.mock.calls) expect(ms).toBe(PURRE_KALL_FRIST_MS);
    frist.mockRestore();
  });

  it('brukerlista svarer ikke: kjøringen avbrytes (500) — ingen er merket, ingen har fått e-post', async () => {
    oppforsel.liste = 'henger';
    const { status, kropp } = await kjor();
    expect(status).toBe(500);
    expect(kropp).toEqual({ ok: false });
    expect(hendelser).toEqual([]);
    expect(sendte).toEqual([]);
    // Feilen selv er andre argument (Logger.error), konteksten tredje.
    expect(logger.error).toHaveBeenCalledWith('purre.feilet', expect.any(Error), { tidsavbrudd: true });
  });

  it('lenka svarer ikke: kandidaten hoppes over UMERKET (nytt forsøk i morgen), og neste går som normalt', async () => {
    brukere = [bruker('treg'), bruker('rask')];
    oppforsel.lenke.treg = 'henger';
    const { status, kropp } = await kjor();
    expect(status).toBe(200);
    expect(kropp).toMatchObject({ sendt: 1, hoppetOver: 1, kandidater: 2 });
    expect(hendelser).toEqual(['lenke:treg', 'lenke:rask', 'merke:rask', 'send:rask']);
    expect(hendelser).not.toContain('merke:treg');
    // Loggen sier at det var fristen som slo til — ikke bare «lenke feilet».
    expect(logger.warn).toHaveBeenCalledWith('purre.kall-feilet', { kall: 'generate_link', tidsavbrudd: true });
  });

  it('merkingen svarer ikke: vi vet ikke om merket ble satt, så ingen e-post — og neste går som normalt', async () => {
    brukere = [bruker('treg'), bruker('rask')];
    oppforsel.merke.treg = 'henger';
    const { kropp } = await kjor();
    expect(kropp).toMatchObject({ sendt: 1, hoppetOver: 1 });
    expect(hendelser).toEqual(['lenke:treg', 'merke:treg', 'lenke:rask', 'merke:rask', 'send:rask']);
    expect(sendte.map((e) => e.til)).toEqual(['rask@example.com']);
    expect(logger.warn).toHaveBeenCalledWith('purre.kall-feilet', { kall: 'merk', brukerId: 'treg', tidsavbrudd: true });
  });

  it('en treg dag: etter kjøretidsfristen startes ingen ny kandidat — de som står igjen er umerket', async () => {
    brukere = [bruker('forste'), bruker('andre'), bruker('tredje')];
    // Den første tar lengre tid enn hele fristen.
    vedSending = () => {
      vedSending = () => undefined;
      vi.setSystemTime(new Date(Date.now() + PURRE_KJORETID_FRIST_MS + 1000));
    };
    const { status, kropp } = await kjor();
    expect(status).toBe(200);
    expect(kropp).toEqual({ ok: true, sendt: 1, hoppetOver: 0, utsatt: 2, kandidater: 3 });
    expect(hendelser).toEqual(['lenke:forste', 'merke:forste', 'send:forste']);
    expect(logger.warn).toHaveBeenCalledWith('purre.avkortet', { utsatt: 2 });
  });

  it('adressene står aldri i loggen', async () => {
    brukere = [bruker('treg'), bruker('rask')];
    oppforsel.lenke.treg = 'henger';
    sendingOk = false;
    await kjor();
    const alt = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(alt).not.toContain('@example.com');
  });
});
