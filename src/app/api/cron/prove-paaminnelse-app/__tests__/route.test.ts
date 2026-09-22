import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Cronens kontrakt, uten Resend og uten database: en e-post per prøve i
 * vinduet, sendt-rad BARE etter vellykket sending, ingenting når
 * sendt-tabellen ikke svarer. Loggen får tall, aldri adresser.
 */

const BRUKER = '11111111-2222-4333-8444-555555555555';
const ANNEN = '22222222-2222-4333-8444-555555555555';

const db = {
  rader: [] as Array<Record<string, unknown>>,
  radFeil: null as { message: string } | null,
  sendte: [] as Array<{ user_id: string; prove_slutt: string }>,
  sendtFeil: null as { message: string } | null,
  innsatt: [] as Array<Record<string, unknown>>,
  innsattFeil: null as { message: string } | null,
  brukere: {} as Record<string, { email?: string; user_metadata?: Record<string, unknown> } | null>
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabell: string) => ({
      select: () => ({
        eq: async () =>
          tabell === 'billing_subscriptions' ? { data: db.rader, error: db.radFeil } : { data: db.sendte, error: db.sendtFeil }
      }),
      insert: async (rad: Record<string, unknown>) => {
        db.innsatt.push(rad);
        return { error: db.innsattFeil };
      }
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = db.brukere[id];
          return u ? { data: { user: { id, ...u } }, error: null } : { data: { user: null }, error: { message: 'finnes ikke' } };
        }
      }
    }
  })
}));
vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: (h: string | null) => h === 'Bearer hemmelig' }));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

const epost = {
  mangler: [] as string[],
  send: vi.fn()
};
vi.mock('@/lib/email/send', () => ({
  manglendeEpostKonfig: () => epost.mangler,
  sendEpost: (...a: unknown[]) => epost.send(...a)
}));

const { GET } = await import('../route');
const { lagProveSvarToken } = await import('@/lib/billing/prove-svar-token');

function kall(auth = 'Bearer hemmelig') {
  return GET({
    headers: new Headers({ authorization: auth, 'x-request-id': 't' }),
    url: 'http://x/api/cron/prove-paaminnelse-app',
    nextUrl: new URL('http://x/api/cron/prove-paaminnelse-app')
  } as unknown as NextRequest);
}

function prove(over: Record<string, unknown> = {}) {
  return {
    user_id: BRUKER,
    tier: 'premium',
    status: 'trialing',
    current_period_end: '2026-09-27T05:12:00.000Z',
    cancel_at_period_end: false,
    metadata: { provider: 'revenuecat', rc_environment: 'PRODUCTION', prove_start: '2026-09-20T05:12:00.000Z' },
    ...over
  };
}

beforeEach(() => {
  // 24. september 2026, 06:30 UTC — cronens klokkeslett.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T06:30:00.000Z'));
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-tjenestenokkel';
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
  db.rader = [];
  db.radFeil = null;
  db.sendte = [];
  db.sendtFeil = null;
  db.innsatt = [];
  db.innsattFeil = null;
  db.brukere = { [BRUKER]: { email: 'kunde@example.com', user_metadata: { sprak: 'nb' } } };
  epost.mangler = [];
  epost.send = vi.fn(async () => ({ ok: true, detalj: 'id' }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cron/prove-paaminnelse-app', () => {
  it('401 uten riktig hemmelighet', async () => {
    expect((await kall('Bearer feil')).status).toBe(401);
    expect(epost.send).not.toHaveBeenCalled();
  });

  it('3 dager igjen: sender én e-post med idempotensnøkkel og skriver sendt-raden etterpå', async () => {
    db.rader = [prove()];
    const res = await kall();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, iDag: '2026-09-24', sendt: 1, feilet: 0 });

    expect(epost.send).toHaveBeenCalledTimes(1);
    const args = epost.send.mock.calls[0][0] as { til: string; emne: string; html: string; tekst: string; idempotensNokkel: string };
    expect(args.til).toBe('kunde@example.com');
    expect(args.idempotensNokkel).toBe(`rc/prove-slutt/${BRUKER}/2026-09-27`);
    expect(args.emne).toBe('Gratisuka di i Mycelet slutter om 3 dager');
    expect(args.tekst).toContain('27. september belastes Apple-ID-en din med prisen som sto i appen da du startet.');
    expect(args.tekst).not.toMatch(/\d+ kr/);
    // Svarlenkene bærer et gyldig token for denne brukeren og prøveslutt.
    const token = lagProveSvarToken(BRUKER, '2026-09-27', 'test-tjenestenokkel');
    expect(args.tekst).toContain(`https://www.mycelet.com/api/prove/svar?t=${token}&valg=omrader&sprak=nb`);
    expect(args.html).toContain(`&valg=ai&sprak=nb`);

    expect(db.innsatt).toEqual([{ user_id: BRUKER, kanal: 'revenuecat', prove_slutt: '2026-09-27' }]);
  });

  it('2 dager igjen (innhenting) sendes også; 4 og 1 dager igjen ikke', async () => {
    db.rader = [
      prove({ user_id: BRUKER, current_period_end: '2026-09-26T05:00:00.000Z' }),
      prove({ user_id: ANNEN, current_period_end: '2026-09-28T05:00:00.000Z' }),
      prove({ user_id: '33333333-2222-4333-8444-555555555555', current_period_end: '2026-09-25T05:00:00.000Z' })
    ];
    const body = await (await kall()).json();
    expect(body.sendt).toBe(1);
    expect(body.hoppetOver['utenfor-vinduet']).toBe(2);
    expect(epost.send).toHaveBeenCalledTimes(1);
    expect((epost.send.mock.calls[0][0] as { emne: string }).emne).toContain('om 2 dager');
    expect(db.innsatt).toEqual([{ user_id: BRUKER, kanal: 'revenuecat', prove_slutt: '2026-09-26' }]);
  });

  it('svensk konto får svensk e-post og svensk «takk»-lenke', async () => {
    db.brukere[BRUKER] = { email: 'kund@example.com', user_metadata: { sprak: 'sv' } };
    db.rader = [prove()];
    await kall();
    const args = epost.send.mock.calls[0][0] as { emne: string; tekst: string };
    expect(args.emne).toBe('Din gratisvecka i Mycelet slutar om 3 dagar');
    expect(args.tekst).toContain('&sprak=sv');
  });

  it('feilet sending: ingen sendt-rad, så neste morgen prøver igjen', async () => {
    db.rader = [prove()];
    epost.send = vi.fn(async () => ({ ok: false, detalj: 'Resend 500' }));
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.innsatt).toEqual([]);
  });

  it('sending som kaster: samme — ingen sendt-rad', async () => {
    db.rader = [prove()];
    epost.send = vi.fn(async () => {
      throw new Error('nettverk');
    });
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.innsatt).toEqual([]);
  });

  it('allerede sendt for denne prøveslutt: hoppes over uten å sende', async () => {
    db.rader = [prove()];
    db.sendte = [{ user_id: BRUKER, prove_slutt: '2026-09-27' }];
    const body = await (await kall()).json();
    expect(body.sendt).toBe(0);
    expect(body.hoppetOver['allerede-sendt']).toBe(1);
    expect(epost.send).not.toHaveBeenCalled();
    expect(db.innsatt).toEqual([]);
  });

  it('sendt-tabellen svarer ikke (migrasjonen ikke kjørt): advar og send ingenting', async () => {
    db.rader = [prove()];
    db.sendtFeil = { message: 'relation "prove_paaminnelser" does not exist' };
    const res = await kall();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.grunn).toMatch(/prove_paaminnelser/);
    expect(epost.send).not.toHaveBeenCalled();
  });

  it('sandkasse, oppsagt og Stripe-prøver hoppes over med grunn', async () => {
    db.rader = [
      prove({ metadata: { provider: 'revenuecat', rc_environment: 'SANDBOX' } }),
      prove({ user_id: ANNEN, cancel_at_period_end: true }),
      prove({ user_id: '33333333-2222-4333-8444-555555555555', metadata: { provider: 'stripe' } })
    ];
    const body = await (await kall()).json();
    expect(body.sendt).toBe(0);
    expect(body.hoppetOver).toMatchObject({ sandkasse: 1, 'allerede-sagt-opp': 1, 'ikke-revenuecat': 1 });
    expect(epost.send).not.toHaveBeenCalled();
  });

  it('e-post ikke konfigurert: ingenting sendes, ingenting merkes', async () => {
    db.rader = [prove()];
    epost.mangler = ['RESEND_API_KEY'];
    const body = await (await kall()).json();
    expect(body.ok).toBe(false);
    expect(epost.send).not.toHaveBeenCalled();
    expect(db.innsatt).toEqual([]);
  });

  it('bruker uten adresse (slettet konto): feilet, ingen sendt-rad', async () => {
    db.rader = [prove({ user_id: ANNEN })];
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.innsatt).toEqual([]);
  });

  it('sendt, men sendt-raden kunne ikke skrives: telles som sendt (Resend-nøkkelen stopper dobbeltsending)', async () => {
    db.rader = [prove()];
    db.innsattFeil = { message: 'duplicate key' };
    const body = await (await kall()).json();
    expect(body.sendt).toBe(1);
    expect(epost.send).toHaveBeenCalledTimes(1);
  });

  it('billing_subscriptions svarer ikke: 500, ingenting sendt', async () => {
    db.radFeil = { message: 'nede' };
    expect((await kall()).status).toBe(500);
    expect(epost.send).not.toHaveBeenCalled();
  });
});
