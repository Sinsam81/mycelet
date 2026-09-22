import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Ett trykk fra e-posten, uten innlogging: gyldig token og valg fra en ekte
 * navigering, minst ti minutter etter utsendingen → raden skrives og «Takk»
 * vises på lenkas språk. En e-postskanner (ingen Sec-Fetch-headere, eller
 * en henting sekunder etter utsendingen) får samme side med ÉN knapp, og
 * ingenting skrives før knappen (POST) trykkes. Tuklet token, ukjent valg
 * eller en lenke lenge etter prøveslutt → ingenting skrives.
 */

const BRUKER = '11111111-2222-4333-8444-555555555555';
const HEMMELIG = 'test-tjenestenokkel';
/** E-posten gikk 24. september 06:30 UTC; «nå» i testene er dagen etter. */
const SENDT_SEK = Math.floor(Date.parse('2026-09-24T06:30:00.000Z') / 1000);
const NAA = '2026-09-25T10:00:00.000Z';

const db = {
  upserts: [] as Array<{ rad: Record<string, unknown>; valg: Record<string, unknown> }>,
  feil: null as { message: string } | null
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (rad: Record<string, unknown>, valg: Record<string, unknown>) => {
        db.upserts.push({ rad, valg });
        return { error: db.feil };
      }
    })
  })
}));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock('@/lib/rate-limit/route', () => ({ getClientKey: () => 'test', rateLimitResponse: () => new Response(null, { status: 429 }) }));

const { GET, HEAD, POST, SVAR_FRIST_DAGER } = await import('../route');
const { lagProveSvarToken } = await import('@/lib/billing/prove-svar-token');

/** Slik en ekte nettleser navigerer fra en lenke i e-posten. */
const NAVIGERING = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none', 'sec-fetch-user': '?1' };

function hent(query: string, headers: Record<string, string> = NAVIGERING) {
  return GET(new NextRequest(`https://www.mycelet.com/api/prove/svar?${query}`, { headers }));
}

function send(felter: Record<string, string>) {
  return POST(
    new NextRequest('https://www.mycelet.com/api/prove/svar', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(felter).toString()
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NAA));
  process.env.SUPABASE_SERVICE_ROLE_KEY = HEMMELIG;
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
  db.upserts = [];
  db.feil = null;
});

afterEach(() => {
  vi.useRealTimers();
});

const token = (sendtSek = SENDT_SEK) => lagProveSvarToken(BRUKER, '2026-09-27', sendtSek, HEMMELIG);

describe('GET /api/prove/svar — et menneske som navigerer', () => {
  it('gyldig token og valg: skriver svaret og viser «Takk» på norsk, uten skjema', async () => {
    const res = await hent(`t=${token()}&valg=offline&sprak=nb`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<html lang="nb">');
    expect(html).toContain('Takk!');
    expect(html).not.toContain('<form');
    expect(html).toContain('href="https://www.mycelet.com"');
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].rad).toMatchObject({ user_id: BRUKER, prove_slutt: '2026-09-27', valg: 'offline', svart_at: NAA });
    expect(db.upserts[0].valg).toEqual({ onConflict: 'user_id,prove_slutt' });
  });

  it('svensk lenke gir svensk side', async () => {
    const res = await hent(`t=${token()}&valg=ai&sprak=sv`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Tack!');
    expect(html).not.toContain('Takk!');
  });

  it('ukjent språk faller tilbake på norsk', async () => {
    const html = await (await hent(`t=${token()}&valg=omrader&sprak=en`)).text();
    expect(html).toContain('<html lang="nb">');
  });
});

describe('GET /api/prove/svar — skannere og forhåndshentere skriver ingenting', () => {
  it('uten Sec-Fetch-headere (skanner, gateway, eldre klient): bekreftelsesside med skjema, ingenting skrives', async () => {
    const res = await hent(`t=${token()}&valg=offline&sprak=nb`, {});
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Ett trykk til');
    expect(html).toContain('Du valgte «offline-kartet»');
    expect(html).toContain('<form method="post" action="/api/prove/svar"');
    expect(html).toContain(`<input type="hidden" name="t" value="${token()}">`);
    expect(html).toContain('<input type="hidden" name="valg" value="offline">');
    expect(html).toContain('<input type="hidden" name="sprak" value="nb">');
    expect(html).toContain('Lagre svaret');
    expect(html).not.toContain('Takk!');
    expect(db.upserts).toEqual([]);
  });

  it('Sec-Fetch-Dest: empty (forhåndshenting, fetch): ingenting skrives', async () => {
    const res = await hent(`t=${token()}&valg=ai&sprak=sv`, { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Ett tryck till');
    expect(html).toContain('Du valde «AI-identifieringen»');
    expect(html).toContain('Spara svaret');
    expect(db.upserts).toEqual([]);
  });

  it('en skanner som følger alle tre lenkene rett etter levering, lar tabellen stå urørt', async () => {
    for (const valg of ['omrader', 'offline', 'ai']) await hent(`t=${token()}&valg=${valg}&sprak=nb`, {});
    expect(db.upserts).toEqual([]);
  });

  it('en henting sekunder etter utsendingen er en skanner, selv med navigeringsheadere; et kvarter etter er et menneske', async () => {
    const naaSek = Math.floor(Date.parse(NAA) / 1000);
    const nettoppSendt = token(naaSek - 5);
    let html = await (await hent(`t=${nettoppSendt}&valg=offline&sprak=nb`)).text();
    expect(html).toContain('Ett trykk til');
    expect(db.upserts).toEqual([]);

    const kvarterSiden = token(naaSek - 15 * 60);
    html = await (await hent(`t=${kvarterSiden}&valg=offline&sprak=nb`)).text();
    expect(html).toContain('Takk!');
    expect(db.upserts).toHaveLength(1);
  });

  it('HEAD (lenkesjekk) svarer 200 uten å skrive', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(db.upserts).toEqual([]);
  });
});

describe('POST /api/prove/svar — knappen på bekreftelsessiden', () => {
  it('gyldig skjema: skriver svaret og viser «Takk» på skjemaets språk', async () => {
    const res = await send({ t: token(), valg: 'omrader', sprak: 'sv' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Tack!');
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].rad).toMatchObject({ user_id: BRUKER, prove_slutt: '2026-09-27', valg: 'omrader' });
  });

  it('skjemaet gjelder også rett etter utsendingen — skannere sender ikke skjemaer', async () => {
    const naaSek = Math.floor(Date.parse(NAA) / 1000);
    const res = await send({ t: token(naaSek - 5), valg: 'ai', sprak: 'nb' });
    expect(res.status).toBe(200);
    expect(db.upserts).toHaveLength(1);
  });

  it('tuklet token, ukjent valg eller tomt skjema: 400, ingenting skrives', async () => {
    const [id, dato, sendt, sig] = token().split('.');
    expect((await send({ t: `22222222-2222-4333-8444-555555555555.${dato}.${sendt}.${sig}`, valg: 'offline', sprak: 'nb' })).status).toBe(400);
    expect((await send({ t: `${id}.${dato}.${sendt}.${sig}`, valg: 'annet', sprak: 'nb' })).status).toBe(400);
    expect((await send({})).status).toBe(400);
    expect((await POST(new NextRequest('https://www.mycelet.com/api/prove/svar', { method: 'POST' }))).status).toBe(400);
    expect(db.upserts).toEqual([]);
  });
});

describe('avvisninger, GET og POST likt', () => {
  it('tuklet token: 400, ingenting skrives', async () => {
    const [id, dato, sendt, sig] = token().split('.');
    const annen = `22222222-2222-4333-8444-555555555555.${dato}.${sendt}.${sig}`;
    expect((await hent(`t=${annen}&valg=offline`)).status).toBe(400);
    const vippet = `${id}.${dato}.${sendt}.${(sig[0] === '0' ? '1' : '0') + sig.slice(1)}`;
    expect((await hent(`t=${vippet}&valg=offline`)).status).toBe(400);
    // Flyttet utsendingstid (for å se ut som et menneske) bryter signaturen.
    expect((await hent(`t=${id}.${dato}.${Number(sendt) - 3600}.${sig}&valg=offline`)).status).toBe(400);
    expect((await hent('t=tull&valg=offline')).status).toBe(400);
    expect((await hent('valg=offline')).status).toBe(400);
    expect(db.upserts).toEqual([]);
    const html = await (await hent(`t=${annen}&valg=offline`)).text();
    expect(html).toContain('Lenken virker ikke');
    expect(html).not.toContain('<form');
  });

  it('ukjent valg: 400, ingenting skrives', async () => {
    expect((await hent(`t=${token()}&valg=annet`)).status).toBe(400);
    expect((await hent(`t=${token()}`)).status).toBe(400);
    expect(db.upserts).toEqual([]);
  });

  it(`lenke mer enn ${SVAR_FRIST_DAGER} dager etter prøveslutt: 410, ingenting skrives`, async () => {
    const gammel = lagProveSvarToken(BRUKER, '2026-08-01', SENDT_SEK, HEMMELIG);
    expect((await hent(`t=${gammel}&valg=offline`)).status).toBe(410);
    expect((await send({ t: gammel, valg: 'offline', sprak: 'nb' })).status).toBe(410);
    expect(db.upserts).toEqual([]);
    // Nøyaktig på fristen går fortsatt.
    vi.setSystemTime(new Date('2026-10-27T10:00:00.000Z'));
    expect((await hent(`t=${token()}&valg=offline`)).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-28T10:00:00.000Z'));
    expect((await hent(`t=${token()}&valg=offline`)).status).toBe(410);
  });

  it('lagringen feiler: siden sier det, ikke «takk»', async () => {
    db.feil = { message: 'nede' };
    const res = await hent(`t=${token()}&valg=offline`);
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain('Vi fikk ikke lagret svaret');
    expect(html).not.toContain('Takk!');
    expect((await send({ t: token(), valg: 'offline', sprak: 'nb' })).status).toBe(500);
  });

  it('uten tjenestenøkkel kan ingen lenke leses: 500, ingenting skrives', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await hent(`t=${token()}&valg=offline`)).status).toBe(500);
    expect((await send({ t: token(), valg: 'offline', sprak: 'nb' })).status).toBe(500);
    expect(db.upserts).toEqual([]);
  });
});
