import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type LenkeSvar = {
  data: { properties?: { hashed_token?: string }; user?: { user_metadata?: Record<string, unknown> } } | null;
  error: { status?: number; code?: string; message?: string } | null;
};

type Sendt = { til: string; emne: string; html: string; tekst: string; idempotensNokkel?: string };

let lenkeSvar: LenkeSvar;
let lenkeKall: Array<Record<string, unknown>> = [];
let lenkeKaster = false;
let sendte: Sendt[] = [];
/** Så mange av de første sendeforsøkene feiler (Infinity = alle). */
let feilendeForsok = 0;
let sendKaster = false;
/** Pausene ruten ba om, i millisekunder — ingen av dem ventes i testen. */
let pauser: number[] = [];
let manglerEpost: string[] = [];
let sprak: 'nb' | 'sv' = 'nb';
const logglinjer: unknown[] = [];

vi.mock('@/lib/log/request', () => {
  const skriv = (...a: unknown[]) => {
    logglinjer.push(a);
  };
  const logger = { info: skriv, warn: skriv, error: skriv, debug: skriv, trace: skriv, child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        generateLink: async (arg: Record<string, unknown>) => {
          lenkeKall.push(arg);
          if (lenkeKaster) throw new Error('fetch failed');
          return lenkeSvar;
        }
      }
    }
  })
}));
vi.mock('@/lib/email/send', () => ({
  manglendeEpostKonfig: () => manglerEpost,
  sendEpost: async (arg: Sendt) => {
    sendte.push(arg);
    if (sendKaster) throw new Error('uventet');
    const ok = sendte.length > feilendeForsok;
    return { ok, detalj: ok ? 'sendt' : 'Resend 500' };
  }
}));
vi.mock('@/lib/utils/vent', () => ({
  vent: async (ms: number) => {
    pauser.push(ms);
  }
}));
vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => sprak }));

import { POST } from '../route';

let ipTeller = 0;
function post(body: unknown, ip?: string) {
  ipTeller += 1;
  return POST(
    new NextRequest('http://localhost/api/auth/glemt-passord', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'x-forwarded-for': ip ?? `10.0.${Math.floor(ipTeller / 250)}.${ipTeller % 250}`,
        origin: 'https://ond.example'
      }
    })
  );
}

beforeEach(() => {
  lenkeSvar = { data: { properties: { hashed_token: 'hemmelig+token/1' }, user: { user_metadata: {} } }, error: null };
  lenkeKall = [];
  lenkeKaster = false;
  sendte = [];
  feilendeForsok = 0;
  sendKaster = false;
  pauser = [];
  manglerEpost = [];
  sprak = 'nb';
  logglinjer.length = 0;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-nokkel';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
});

describe('POST /api/auth/glemt-passord', () => {
  it('sender vår egen e-post med token_hash-lenke til fast opphav', async () => {
    const res = await post({ email: '  Kari@Example.com ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(lenkeKall).toEqual([{ type: 'recovery', email: 'kari@example.com' }]);
    expect(sendte).toHaveLength(1);
    expect(sendte[0].til).toBe('kari@example.com');
    const lenke = 'https://www.mycelet.com/auth/reset?token_hash=hemmelig%2Btoken%2F1';
    expect(sendte[0].tekst).toContain(lenke);
    expect(sendte[0].html).toContain(lenke);
    // Aldri forespørselens Origin.
    expect(sendte[0].html).not.toContain('ond.example');
    expect(sendte[0].emne).toMatch(/passord/);
  });

  it('svensk leser får svensk e-post', async () => {
    sprak = 'sv';
    await post({ email: 'anna@example.se' });
    expect(sendte[0].emne).toMatch(/lösenord/);
    expect(sendte[0].html).toContain('lang="sv"');
  });

  it('ukjent adresse: samme svar, ingen e-post, ingen reserve', async () => {
    lenkeSvar = { data: null, error: { status: 404, code: 'user_not_found', message: 'User with this email not found' } };
    const res = await post({ email: 'ingen@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendte).toHaveLength(0);
  });

  it('ugyldig kropp eller adresse: 200 uten oppslag', async () => {
    for (const body of [null, 'tekst', {}, { email: 42 }, { email: 'ikke-en-adresse' }, '{']) {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(lenkeKall).toHaveLength(0);
    expect(sendte).toHaveLength(0);
  });

  it('reserve når nøkkel eller e-postoppsett mangler — uten å røre Supabase', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await (await post({ email: 'a@example.com' })).json()).toEqual({ ok: true, fallback: true });
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-nokkel';
    manglerEpost = ['RESEND_API_KEY'];
    expect(await (await post({ email: 'b@example.com' })).json()).toEqual({ ok: true, fallback: true });
    expect(lenkeKall).toHaveLength(0);
    expect(sendte).toHaveLength(0);
  });

  it('reserve når lenka ikke lar seg lage', async () => {
    // Supabase svarte med feil: ingenting er stemplet, og reserven kan sendes nå.
    lenkeSvar = { data: null, error: { status: 500, message: 'boom' } };
    expect(await (await post({ email: 'd@example.com' })).json()).toEqual({ ok: true, fallback: true });
    // Kallet kastet: uvisst om Supabase rakk å stemple. Skjemaet tar høyde for
    // det — svarer reserven 429, hopper det over ruten neste gang.
    lenkeKaster = true;
    expect(await (await post({ email: 'd2@example.com' })).json()).toEqual({ ok: true, fallback: true });
    expect(sendte).toHaveLength(0);
    expect(pauser).toEqual([]);
  });

  it('ett nytt sendeforsøk etter en kort pause, med samme idempotensnøkkel', async () => {
    feilendeForsok = 1;
    const res = await post({ email: 'c@example.com' });
    expect(await res.json()).toEqual({ ok: true });
    expect(lenkeKall).toHaveLength(1);
    expect(sendte).toHaveLength(2);
    expect(pauser).toEqual([1000]);
    // Samme e-post, samme nøkkel: Resend sender den aldri to ganger.
    expect(sendte[1]).toEqual(sendte[0]);
    expect(sendte[0].idempotensNokkel).toMatch(/^glemt-passord\/[0-9a-f-]{36}$/);
    // Nøkkelen bærer verken adresse eller token.
    expect(sendte[0].idempotensNokkel).not.toContain('c@example.com');
    expect(sendte[0].idempotensNokkel).not.toContain('hemmelig');
  });

  it('hver forespørsel får sin egen idempotensnøkkel', async () => {
    await post({ email: 'f@example.com' });
    await post({ email: 'f@example.com' });
    expect(sendte).toHaveLength(2);
    expect(pauser).toEqual([]);
    expect(sendte[0].idempotensNokkel).not.toBe(sendte[1].idempotensNokkel);
  });

  // generateLink stempler recovery_sent_at, og Supabases egen /recover svarer
  // 429 i 60 s etterpå. `fallback` her ville sendt skjemaet rett i den veggen.
  it('feiler utsendingen to ganger: sendFailed — aldri fallback', async () => {
    feilendeForsok = Infinity;
    const res = await post({ email: 'c@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sendFailed: true });
    // Nøyaktig ett nytt forsøk, og bare én lenke (ett stempel).
    expect(sendte).toHaveLength(2);
    expect(pauser).toEqual([1000]);
    expect(lenkeKall).toHaveLength(1);
  });

  it('alt som går galt etter at lenka er laget gir sendFailed', async () => {
    lenkeSvar = { data: { properties: {} }, error: null };
    expect(await (await post({ email: 'e@example.com' })).json()).toEqual({ ok: true, sendFailed: true });
    expect(sendte).toHaveLength(0);

    lenkeSvar = { data: { properties: { hashed_token: 'hemmelig+token/2' }, user: { user_metadata: {} } }, error: null };
    sendKaster = true;
    expect(await (await post({ email: 'e2@example.com' })).json()).toEqual({ ok: true, sendFailed: true });
  });

  it('grense per adresse: tre e-poster, deretter stille 200', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await post({ email: 'Bombet@example.com' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(sendte).toHaveLength(3);
  });

  it('grense per klient: fem forsøk, deretter stille 200', async () => {
    for (let i = 0; i < 8; i += 1) {
      const res = await post({ email: `ulik${i}@example.com` }, '203.0.113.9');
      expect(res.status).toBe(200);
    }
    expect(sendte).toHaveLength(5);
  });

  it('logger verken token eller adresse', async () => {
    await post({ email: 'privat.person@example.com' });
    feilendeForsok = Infinity;
    await post({ email: 'privat.person2@example.com' });
    const alt = JSON.stringify(logglinjer);
    expect(alt).not.toContain('hemmelig');
    expect(alt).not.toContain('privat.person');
    // Idempotensnøkkelen hører heller ikke hjemme i loggen.
    expect(alt).not.toContain('glemt-passord/');
  });
});
