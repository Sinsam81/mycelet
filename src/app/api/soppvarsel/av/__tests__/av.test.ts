import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Avmeldingen skal virke for mennesker og for Gmail/Outlook sin innebygde
 * knapp — og for ingen andre. Før meldte ruta av på ENHVER GET, så en
 * e-postskanner som fulgte lenkene i varselet idet det ble levert, meldte
 * mottakeren stille av. Testene låser tre ting:
 *
 *   · en henting som ikke er et menneske som navigerer (ingen Sec-Fetch,
 *     forhåndshenting, HEAD, eller sekunder etter utsendingen) endrer ALDRI
 *     raden — den får en side med én knapp
 *   · RFC 8058 one-click (POST uten vårt skjemafelt) melder av og svarer 200
 *     uten å omdirigere, akkurat som før
 *   · knappen på siden (POST med skjema=1) melder av og sender til kvitteringen
 */

let rader: Array<Record<string, unknown>> = [];
let oppdateringer: Array<{ payload: Record<string, unknown>; filtre: Array<[string, unknown]> }> = [];
let dbFeil: { message: string } | null = null;
let tillatt = true;

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: tillatt }) }));
vi.mock('@/lib/rate-limit/route', () => ({
  getClientKey: () => 'test',
  rateLimitResponse: async () => new Response(null, { status: 429 })
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        const filtre: Array<[string, unknown]> = [];
        oppdateringer.push({ payload, filtre });
        return {
          eq: (k: string, v: unknown) => {
            filtre.push([k, v]);
            return { select: async () => ({ data: dbFeil ? null : rader, error: dbFeil }) };
          }
        };
      }
    })
  })
}));

const { GET, HEAD, POST } = await import('../route');

const TOKEN = '11111111-2222-4333-8444-555555555555';
const NAA = '2026-09-25T10:00:00.000Z';
const NAA_SEK = Math.floor(Date.parse(NAA) / 1000);
/** Slik en ekte nettleser navigerer fra en lenke i e-posten. */
const NAVIGERING = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none', 'sec-fetch-user': '?1' };
const BASE = 'https://www.mycelet.com/api/soppvarsel/av';

function hent(query: string, headers: Record<string, string> = NAVIGERING) {
  return GET(new NextRequest(`${BASE}?${query}`, { headers }));
}

function send(query: string, kropp?: string, contentType = 'application/x-www-form-urlencoded') {
  return POST(
    new NextRequest(`${BASE}?${query}`, {
      method: 'POST',
      ...(kropp === undefined ? {} : { headers: { 'content-type': contentType }, body: kropp })
    })
  );
}

const sti = (res: Response) => {
  const url = new URL(res.headers.get('location') ?? '');
  return `${url.pathname}${url.search}`;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NAA));
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.mycelet.com';
  rader = [{ id: 'r1', locale: 'nb' }];
  oppdateringer = [];
  dbFeil = null;
  tillatt = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/soppvarsel/av — et menneske som navigerer', () => {
  it('melder av og sender til kvitteringen på abonnementets språk', async () => {
    const res = await hent(`t=${TOKEN}&s=${NAA_SEK - 3600}&sprak=nb`);
    expect(res.status).toBe(307);
    expect(sti(res)).toBe('/soppvarsel/av?ok=1&sprak=nb');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0].payload).toMatchObject({ active: false });
    // Bekreftelsestokenet roteres, så en gammel bekreftelseslenke er død.
    expect(oppdateringer[0].payload.confirm_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(oppdateringer[0].filtre).toEqual([['unsubscribe_token', TOKEN]]);
  });

  it('svensk abonnement gir svensk kvittering, også når lenka ikke bærer språk', async () => {
    rader = [{ id: 'r1', locale: 'sv' }];
    expect(sti(await hent(`t=${TOKEN}`))).toBe('/soppvarsel/av?ok=1&sprak=sv');
  });

  it('eldre e-post uten &s=: navigeringen alene er nok', async () => {
    const res = await hent(`t=${TOKEN}`);
    expect(sti(res)).toBe('/soppvarsel/av?ok=1&sprak=nb');
    expect(oppdateringer).toHaveLength(1);
  });

  it('ukjent token gir samme utfall som et gyldig — ruta er ikke et orakel', async () => {
    rader = [];
    const res = await hent(`t=${TOKEN}&sprak=sv`);
    expect(sti(res)).toBe('/soppvarsel/av?ok=1&sprak=sv');
  });

  it('avkortet eller manglende token: kvitteringen sier at lenka ikke virket, ingenting skrives', async () => {
    expect(sti(await hent('t=ikke-en-uuid'))).toBe('/soppvarsel/av?ok=0');
    expect(sti(await hent('sprak=sv'))).toBe('/soppvarsel/av?ok=0&sprak=sv');
    expect(oppdateringer).toEqual([]);
  });

  it('databasefeil: kvitteringen sier det, ikke «du er avmeldt»', async () => {
    dbFeil = { message: 'nede' };
    expect(sti(await hent(`t=${TOKEN}`))).toBe('/soppvarsel/av?ok=0');
  });
});

describe('GET /api/soppvarsel/av — skannere og forhåndshentere melder ingen av', () => {
  it('uten Sec-Fetch-headere (skanner, gateway, eldre klient): side med én knapp, raden står urørt', async () => {
    const res = await hent(`t=${TOKEN}&s=${NAA_SEK - 3600}&sprak=nb`, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<html lang="nb">');
    expect(html).toContain('Ett trykk til');
    expect(html).toContain(`<form method="post" action="/api/soppvarsel/av?t=${TOKEN}"`);
    expect(html).toContain('<input type="hidden" name="skjema" value="1">');
    expect(html).toContain('<input type="hidden" name="sprak" value="nb">');
    expect(html).toContain('Slå av soppvarselet');
    // Siden bærer tokenet i adressen — den skal ikke lekke som referanse.
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    // Ingen vei ut går gjennom innlogging.
    expect(html).not.toMatch(/logg inn|logga in|\/auth\//i);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(oppdateringer).toEqual([]);
  });

  it('Sec-Fetch-Dest: empty (fetch, forhåndsvisning): ingenting skrives', async () => {
    const res = await hent(`t=${TOKEN}`, { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' });
    expect(res.status).toBe(200);
    expect(oppdateringer).toEqual([]);
  });

  it('forhåndshenting som ser ut som en navigering (Sec-Purpose: prefetch): ingenting skrives', async () => {
    const res = await hent(`t=${TOKEN}`, { ...NAVIGERING, 'sec-purpose': 'prefetch;prerender' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Ett trykk til');
    expect(oppdateringer).toEqual([]);
  });

  it('en henting sekunder etter utsendingen er en skanner, selv med navigeringsheadere; et kvarter etter er et menneske', async () => {
    const tidlig = await hent(`t=${TOKEN}&s=${NAA_SEK - 5}`);
    expect(tidlig.status).toBe(200);
    expect(await tidlig.text()).toContain('Ett trykk til');
    expect(oppdateringer).toEqual([]);

    const senere = await hent(`t=${TOKEN}&s=${NAA_SEK - 15 * 60}`);
    expect(senere.status).toBe(307);
    expect(oppdateringer).toHaveLength(1);
  });

  it('siden er lik for et ukjent token — tokenet slås aldri opp før knappen trykkes', async () => {
    const ekte = await (await hent(`t=${TOKEN}&sprak=nb`, {})).text();
    rader = [];
    const ukjent = await (await hent(`t=${TOKEN}&sprak=nb`, {})).text();
    expect(ukjent).toBe(ekte);
    expect(oppdateringer).toEqual([]);
  });

  it('språket på siden: lenkas &sprak=, så cookien, så Accept-Language, til slutt norsk', async () => {
    let html = await (await hent(`t=${TOKEN}&sprak=sv`, {})).text();
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Ett tryck till');
    expect(html).toContain('Stäng av svampvarningen');
    expect(html).toContain('<input type="hidden" name="sprak" value="sv">');
    expect(html).not.toMatch(/[æø]/);

    html = await (await hent(`t=${TOKEN}`, { cookie: 'MYCELET_LOCALE=sv' })).text();
    expect(html).toContain('<html lang="sv">');

    html = await (await hent(`t=${TOKEN}`, { 'accept-language': 'sv-SE,sv;q=0.9,en;q=0.8' })).text();
    expect(html).toContain('<html lang="sv">');

    html = await (await hent(`t=${TOKEN}&sprak=en`, { 'accept-language': 'en-US' })).text();
    expect(html).toContain('<html lang="nb">');
  });

  it('HEAD (lenkesjekk) svarer 200 uten å skrive', async () => {
    const res = await HEAD(new NextRequest(`${BASE}?t=${TOKEN}`, { method: 'HEAD', headers: NAVIGERING }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(oppdateringer).toEqual([]);
  });
});

describe('POST /api/soppvarsel/av — RFC 8058 one-click', () => {
  it('«List-Unsubscribe=One-Click»: melder av, svarer 200 uten kropp og uten omdirigering', async () => {
    const res = await send(`t=${TOKEN}`, 'List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toBe('');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0].payload).toMatchObject({ active: false });
  });

  it('også rett etter utsendingen, og selv om adressen skulle bære &s= — tidsvinduet gjelder bare GET', async () => {
    const res = await send(`t=${TOKEN}&s=${NAA_SEK - 5}&sprak=sv`, 'List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(oppdateringer).toHaveLength(1);
  });

  it('en kropp vi ikke kan lese (tom, multipart, JSON) er fortsatt one-click — aldri en feil', async () => {
    expect((await send(`t=${TOKEN}`)).status).toBe(200);
    expect((await send(`t=${TOKEN}`, '{"x":1}', 'application/json')).status).toBe(200);
    const flerdelt = new FormData();
    flerdelt.set('List-Unsubscribe', 'One-Click');
    const res = await POST(new NextRequest(`${BASE}?t=${TOKEN}`, { method: 'POST', body: flerdelt }));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(oppdateringer).toHaveLength(3);
  });

  it('ugyldig token: 400, ingenting skrives; databasefeil: 500', async () => {
    expect((await send('t=tull', 'List-Unsubscribe=One-Click')).status).toBe(400);
    expect((await send('', 'List-Unsubscribe=One-Click')).status).toBe(400);
    expect(oppdateringer).toEqual([]);
    dbFeil = { message: 'nede' };
    expect((await send(`t=${TOKEN}`, 'List-Unsubscribe=One-Click')).status).toBe(500);
  });
});

describe('POST /api/soppvarsel/av — knappen på siden', () => {
  it('skjema=1: melder av og sender (303) til kvitteringen', async () => {
    const res = await send(`t=${TOKEN}`, 'skjema=1&sprak=nb');
    expect(res.status).toBe(303);
    expect(sti(res)).toBe('/soppvarsel/av?ok=1&sprak=nb');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0].payload).toMatchObject({ active: false });
  });

  it('gjelder også rett etter utsendingen — skannere sender ikke skjemaer', async () => {
    const res = await send(`t=${TOKEN}&s=${NAA_SEK - 5}`, 'skjema=1&sprak=sv');
    expect(res.status).toBe(303);
    expect(oppdateringer).toHaveLength(1);
  });

  it('ukjent token: samme kvittering, på skjemaets språk', async () => {
    rader = [];
    expect(sti(await send(`t=${TOKEN}`, 'skjema=1&sprak=sv'))).toBe('/soppvarsel/av?ok=1&sprak=sv');
  });

  it('ugyldig token eller databasefeil: kvitteringen sier at det ikke gikk', async () => {
    expect(sti(await send('t=tull', 'skjema=1&sprak=sv'))).toBe('/soppvarsel/av?ok=0&sprak=sv');
    expect(oppdateringer).toEqual([]);
    dbFeil = { message: 'nede' };
    const res = await send(`t=${TOKEN}`, 'skjema=1&sprak=nb');
    expect(res.status).toBe(303);
    expect(sti(res)).toBe('/soppvarsel/av?ok=0&sprak=nb');
  });
});

describe('lenkene cronen faktisk skriver inn i e-posten', () => {
  // Formatet bygges ett sted (avmeldingslenker) og leses her. Testen binder
  // de to sammen, så et omdøpt parameter ikke stille slår av skannervernet.
  it('brødtekstlenka: skanner ved levering → knappeside på abonnementets språk; mennesket senere → avmeldt', async () => {
    const { avmeldingslenker } = await import('@/lib/alerts/lenkeside');
    const { brodtekst } = avmeldingslenker({ appUrl: 'https://www.mycelet.com', token: TOKEN, sendtSek: NAA_SEK, locale: 'sv' });
    rader = [{ id: 'r1', locale: 'sv' }];

    // Sekunder etter utsendingen, med en ekte nettlesers headere (detonasjonssandkasse).
    vi.setSystemTime(new Date(Date.parse(NAA) + 20_000));
    const skanner = await GET(new NextRequest(brodtekst, { headers: NAVIGERING }));
    expect(skanner.status).toBe(200);
    expect(await skanner.text()).toContain('Stäng av svampvarningen');
    expect(oppdateringer).toEqual([]);

    // To timer senere trykker mottakeren selv.
    vi.setSystemTime(new Date(Date.parse(NAA) + 2 * 3600_000));
    const menneske = await GET(new NextRequest(brodtekst, { headers: NAVIGERING }));
    expect(sti(menneske)).toBe('/soppvarsel/av?ok=1&sprak=sv');
    expect(oppdateringer).toHaveLength(1);
  });

  it('List-Unsubscribe-adressen: one-click-POST virker i samme sekund som e-posten går', async () => {
    const { avmeldingslenker } = await import('@/lib/alerts/lenkeside');
    const { hode } = avmeldingslenker({ appUrl: 'https://www.mycelet.com', token: TOKEN, sendtSek: NAA_SEK, locale: 'nb' });
    const res = await POST(
      new NextRequest(hode, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click'
      })
    );
    expect(res.status).toBe(200);
    expect(oppdateringer).toHaveLength(1);
  });
});

describe('taket per klient gjelder alle tre metodene', () => {
  it('over taket: 429, ingenting skrives', async () => {
    tillatt = false;
    expect((await hent(`t=${TOKEN}`)).status).toBe(429);
    expect((await send(`t=${TOKEN}`, 'List-Unsubscribe=One-Click')).status).toBe(429);
    expect((await HEAD(new NextRequest(`${BASE}?t=${TOKEN}`, { method: 'HEAD' }))).status).toBe(429);
    expect(oppdateringer).toEqual([]);
  });
});
