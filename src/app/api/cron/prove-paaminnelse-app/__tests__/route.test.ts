import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Cronens kontrakt, uten Resend og uten database: en e-post per prøve i
 * vinduet, sendt-raden RESERVERT før sendingen og frigitt når sendingen
 * feiler, ingenting når sendt-tabellen ikke svarer. Loggen får tall, aldri
 * adresser.
 */

const BRUKER = '11111111-2222-4333-8444-555555555555';
const ANNEN = '22222222-2222-4333-8444-555555555555';

const db = {
  rader: [] as Array<Record<string, unknown>>,
  radFeil: null as { message: string } | null,
  sendte: [] as Array<{ user_id: string; prove_slutt: string }>,
  sendtFeil: null as { message: string } | null,
  innsatt: [] as Array<Record<string, unknown>>,
  innsattFeil: null as { message: string; code?: string } | null,
  slettet: [] as Array<Record<string, unknown>>,
  slettFeil: null as { message: string } | null,
  /** Rekkefølgen på det som skjer: «reserver», «send», «frigi». */
  hendelser: [] as string[],
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
        db.hendelser.push('reserver');
        db.innsatt.push(rad);
        return { error: db.innsattFeil };
      },
      delete: () => {
        const filter: Record<string, unknown> = {};
        const kjede = {
          eq: (k: string, v: unknown) => {
            filter[k] = v;
            return kjede;
          },
          then: (resolve: (v: { error: { message: string } | null }) => unknown) => {
            db.hendelser.push('frigi');
            db.slettet.push({ ...filter });
            return Promise.resolve({ error: db.slettFeil }).then(resolve);
          }
        };
        return kjede;
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
const logger = vi.hoisted(() => {
  const l = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => l };
  return l;
});
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logger }));

const epost = {
  mangler: [] as string[],
  send: vi.fn()
};
vi.mock('@/lib/email/send', () => ({
  manglendeEpostKonfig: () => epost.mangler,
  sendEpost: (...a: unknown[]) => {
    db.hendelser.push('send');
    return epost.send(...a);
  }
}));

const { GET } = await import('../route');
const { lagProveSvarToken } = await import('@/lib/billing/prove-svar-token');

/** 24. september 2026, 06:30 UTC — cronens klokkeslett. */
const NAA = '2026-09-24T06:30:00.000Z';
const SENDT_SEK = Math.floor(Date.parse(NAA) / 1000);

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
    // Gratisuke: kjøpt 20. september, slutter 27. september 05:12 UTC (07:12 Oslo).
    current_period_start: '2026-09-20T05:12:00.000Z',
    current_period_end: '2026-09-27T05:12:00.000Z',
    cancel_at_period_end: false,
    metadata: { provider: 'revenuecat', rc_environment: 'PRODUCTION', prove_start: '2026-09-20T05:12:00.000Z' },
    ...over
  };
}

type SendtArgs = { til: string; emne: string; html: string; tekst: string; idempotensNokkel: string };
const sendtArgs = (i = 0) => epost.send.mock.calls[i][0] as SendtArgs;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NAA));
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-tjenestenokkel';
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
  db.rader = [];
  db.radFeil = null;
  db.sendte = [];
  db.sendtFeil = null;
  db.innsatt = [];
  db.innsattFeil = null;
  db.slettet = [];
  db.slettFeil = null;
  db.hendelser = [];
  db.brukere = { [BRUKER]: { email: 'kunde@example.com', user_metadata: { sprak: 'nb' } } };
  epost.mangler = [];
  epost.send = vi.fn(async () => ({ ok: true, detalj: 'id' }));
  logger.error.mockClear();
  logger.warn.mockClear();
  logger.info.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cron/prove-paaminnelse-app', () => {
  it('401 uten riktig hemmelighet', async () => {
    expect((await kall('Bearer feil')).status).toBe(401);
    expect(epost.send).not.toHaveBeenCalled();
  });

  it('3 dager igjen: reserverer sendt-raden, sender én e-post med idempotensnøkkel, og lar raden stå', async () => {
    db.rader = [prove()];
    const res = await kall();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, iDag: '2026-09-24', sendt: 1, feilet: 0 });

    expect(epost.send).toHaveBeenCalledTimes(1);
    const args = sendtArgs();
    expect(args.til).toBe('kunde@example.com');
    expect(args.idempotensNokkel).toBe(`rc/prove-slutt/${BRUKER}/2026-09-27`);
    expect(args.emne).toBe('Gratisuka di i Mycelet slutter om 3 dager');
    // Fristen er ett døgn før prøveslutt, med klokkeslett; datoen og Apple-kontoen etterpå.
    expect(args.tekst).toContain('avslutter du senest 26. september kl. 07 under Innstillinger → navnet ditt øverst → Abonnementer på iPhonen');
    expect(args.tekst).toContain('Prøveperioden slutter 27. september, og Apple-kontoen din belastes da med prisen som sto i appen da du startet.');
    expect(args.tekst).not.toMatch(/\d+ kr/);
    expect(args.tekst).not.toContain('Apple-ID');
    // Svarlenkene bærer et gyldig token for denne brukeren, prøveslutt og utsendingstiden.
    const token = lagProveSvarToken(BRUKER, '2026-09-27', SENDT_SEK, 'test-tjenestenokkel');
    expect(args.tekst).toContain(`https://www.mycelet.com/api/prove/svar?t=${token}&valg=omrader&sprak=nb`);
    expect(args.html).toContain(`&valg=ai&sprak=nb`);

    expect(db.innsatt).toEqual([{ user_id: BRUKER, kanal: 'revenuecat', prove_slutt: '2026-09-27' }]);
    expect(db.slettet).toEqual([]);
    // Reservasjonen skrives FØR sendingen.
    expect(db.hendelser).toEqual(['reserver', 'send']);
  });

  it('2 dager igjen (innhenting) sendes også, med «i morgen» som frist; 4 og 1 dager igjen ikke', async () => {
    db.rader = [
      prove({ user_id: BRUKER, current_period_start: '2026-09-19T05:00:00.000Z', current_period_end: '2026-09-26T05:00:00.000Z' }),
      prove({ user_id: ANNEN, current_period_end: '2026-09-28T05:00:00.000Z' }),
      prove({ user_id: '33333333-2222-4333-8444-555555555555', current_period_end: '2026-09-25T05:00:00.000Z' })
    ];
    const body = await (await kall()).json();
    expect(body.sendt).toBe(1);
    expect(body.hoppetOver['utenfor-vinduet']).toBe(2);
    expect(epost.send).toHaveBeenCalledTimes(1);
    expect(sendtArgs().emne).toContain('om 2 dager');
    expect(sendtArgs().tekst).toContain('senest i morgen kl. 07');
    expect(db.innsatt).toEqual([{ user_id: BRUKER, kanal: 'revenuecat', prove_slutt: '2026-09-26' }]);
  });

  it('en måneds tilbudskode, eller ukjent startdato, heter «prøveperioden» — aldri «gratisuka»', async () => {
    db.rader = [prove({ current_period_start: '2026-08-28T05:12:00.000Z' })];
    await kall();
    expect(sendtArgs().emne).toBe('Prøveperioden din i Mycelet slutter om 3 dager');
    expect(`${sendtArgs().emne} ${sendtArgs().tekst}`).not.toMatch(/gratisuka|i uka/i);

    db.rader = [prove({ current_period_start: null })];
    db.innsatt = [];
    epost.send.mockClear();
    await kall();
    expect(sendtArgs().emne).toBe('Prøveperioden din i Mycelet slutter om 3 dager');
  });

  it('svensk konto får svensk e-post og svensk «takk»-lenke', async () => {
    db.brukere[BRUKER] = { email: 'kund@example.com', user_metadata: { sprak: 'sv' } };
    db.rader = [prove()];
    await kall();
    expect(sendtArgs().emne).toBe('Din gratisvecka i Mycelet slutar om 3 dagar');
    expect(sendtArgs().tekst).toContain('&sprak=sv');
    expect(sendtArgs().tekst).toContain('senast den 26 september kl. 07 under Inställningar → ditt namn överst → Prenumerationer');
  });

  it('feilet sending: reservasjonen frigis, så neste morgen prøver igjen', async () => {
    db.rader = [prove()];
    epost.send = vi.fn(async () => ({ ok: false, detalj: 'Resend 500' }));
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.innsatt).toHaveLength(1);
    expect(db.slettet).toEqual([{ user_id: BRUKER, kanal: 'revenuecat', prove_slutt: '2026-09-27' }]);
    expect(db.hendelser).toEqual(['reserver', 'send', 'frigi']);
  });

  it('sending som kaster: samme — reservasjonen frigis', async () => {
    db.rader = [prove()];
    epost.send = vi.fn(async () => {
      throw new Error('nettverk');
    });
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.slettet).toHaveLength(1);
  });

  it('feilet sending der reservasjonen ikke lar seg frigi: logges som feil — kunden får heller ingen enn to', async () => {
    db.rader = [prove()];
    epost.send = vi.fn(async () => ({ ok: false, detalj: 'Resend 500' }));
    db.slettFeil = { message: 'nede' };
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(logger.error).toHaveBeenCalledWith('prove_paaminnelse_app.reservasjon_ikke_frigitt', expect.objectContaining({ userId: BRUKER }));
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

  it('reservasjonen finnes alt (en annen kjøring tok den): hoppes over uten å sende', async () => {
    db.rader = [prove()];
    db.innsattFeil = { message: 'duplicate key value violates unique constraint', code: '23505' };
    const body = await (await kall()).json();
    expect(body.sendt).toBe(0);
    expect(body.feilet).toBe(0);
    expect(body.hoppetOver['allerede-sendt']).toBe(1);
    expect(epost.send).not.toHaveBeenCalled();
    expect(db.slettet).toEqual([]);
  });

  it('reservasjonen kunne ikke skrives av annen grunn: ingenting sendes — uten merke kan «én gang» ikke loves', async () => {
    db.rader = [prove()];
    db.innsattFeil = { message: 'connection reset' };
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(epost.send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('prove_paaminnelse_app.reservasjon_feilet', expect.objectContaining({ userId: BRUKER }));
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
    expect(db.innsatt).toEqual([]);
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
    expect(db.innsatt).toEqual([]);
  });

  it('e-post ikke konfigurert: ingenting sendes, ingenting reserveres', async () => {
    db.rader = [prove()];
    epost.mangler = ['RESEND_API_KEY'];
    const body = await (await kall()).json();
    expect(body.ok).toBe(false);
    expect(epost.send).not.toHaveBeenCalled();
    expect(db.innsatt).toEqual([]);
  });

  it('bruker uten adresse (slettet konto): feilet, ingen reservasjon', async () => {
    db.rader = [prove({ user_id: ANNEN })];
    const body = await (await kall()).json();
    expect(body).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.innsatt).toEqual([]);
  });

  it('billing_subscriptions svarer ikke: 500, ingenting sendt', async () => {
    db.radFeil = { message: 'nede' };
    expect((await kall()).status).toBe(500);
    expect(epost.send).not.toHaveBeenCalled();
  });

  it('loggen får aldri adressen', async () => {
    db.rader = [prove()];
    await kall();
    const alt = [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls].map((c) => JSON.stringify(c)).join(' ');
    expect(alt).not.toContain('kunde@example.com');
  });
});
