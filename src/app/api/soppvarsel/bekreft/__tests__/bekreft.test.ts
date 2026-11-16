import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Bekreftelseslenka skal bare gjøre ÉN ting: bekrefte en rad som venter.
 * Før satte den active=true på enhver rad med tokenet — også en avmeldt —
 * så en gammel lenke i innboksen (eller en e-postskanner) gjenopptok
 * abonnementer folk hadde sagt opp. Funnet i den eksterne gjennomgangen
 * 2026-09-05.
 *
 * Og den skal bare gjøre det for et MENNESKE: en henting uten nettleserens
 * navigeringsheadere (skanner, forhåndshenter, HEAD) fullførte før dobbel
 * opt-in på vegne av en adresse eieren aldri bekreftet. Den får nå en side
 * med én knapp, og ingenting leses eller skrives før knappen (POST) trykkes.
 */

let rad: Record<string, unknown> | null = null;
let lesinger = 0;
let oppdateringer: Array<{ payload: Record<string, unknown>; filtre: Array<[string, string, unknown]> }> = [];

vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            lesinger += 1;
            return { data: rad, error: null };
          }
        })
      }),
      update: (payload: Record<string, unknown>) => {
        const filtre: Array<[string, string, unknown]> = [];
        oppdateringer.push({ payload, filtre });
        const b = {
          eq: (k: string, v: unknown) => (filtre.push(['eq', k, v]), b),
          is: (k: string, v: unknown) => (filtre.push(['is', k, v]), b),
          then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r)
        };
        return b;
      }
    })
  })
}));

import { GET, HEAD, POST } from '../route';

const TOKEN = '11111111-2222-4333-8444-555555555555';
const URL_ = `http://localhost/api/soppvarsel/bekreft?t=${TOKEN}`;
/** Slik en ekte nettleser navigerer fra en lenke i e-posten. */
const NAVIGERING = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none', 'sec-fetch-user': '?1' };

const status = (res: Response) => new URL(res.headers.get('location') ?? '').searchParams.get('status');

async function klikk() {
  return status(await GET(new NextRequest(URL_, { headers: NAVIGERING })));
}

beforeEach(() => {
  rad = null;
  lesinger = 0;
  oppdateringer = [];
});

describe('bekreft — et menneske som navigerer', () => {
  it('bekrefter en rad som venter — og setter hopp-markøren så webmail-verten ikke blir kilde', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    const res = await GET(new NextRequest(URL_, { headers: NAVIGERING }));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toContain('mycelet_hopp=1');
    // Kvitteringen er områdesiden, ikke et tomt takk-skjema.
    expect(res.headers.get('location')).toContain('/soppforhold/oslo?status=bekreftet');
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    oppdateringer = [];
    expect(await klikk()).toBe('bekreftet');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0].payload).toMatchObject({ active: true });
    expect(oppdateringer[0].filtre).toContainEqual(['is', 'confirmed_at', null]);
  });

  it('gjenopptar ALDRI en avmeldt rad — gammel lenke er død', async () => {
    rad = { id: 'r1', region: 'Oslo', active: false, confirmed_at: '2026-08-01T00:00:00Z', user_id: null };
    expect(await klikk()).toBe('ugyldig-lenke');
    expect(oppdateringer).toHaveLength(0);
  });

  it('er idempotent for en allerede bekreftet, aktiv rad — uten å re-stemple samtykketidspunktet', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: '2026-08-01T00:00:00Z', user_id: null };
    expect(await klikk()).toBe('bekreftet');
    expect(oppdateringer).toHaveLength(0);
  });

  it('avviser kontorader og ukjente tokens', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: 'bruker' };
    expect(await klikk()).toBe('ugyldig-lenke');
    rad = null;
    expect(await klikk()).toBe('ugyldig-lenke');
    expect(oppdateringer).toHaveLength(0);
  });

  it('ingen tidsgrense: folk bekrefter sekunder etter påmeldingen', async () => {
    // Avmeldingen venter ti minutter fra utsendingen før en GET får skrive;
    // her ville det sendt hvert eneste menneske innom knappesiden. Et &s= som
    // ligger i framtiden (år 2100) ville alltid vært «innenfor vinduet».
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    const res = await GET(new NextRequest(`${URL_}&s=4102444800`, { headers: NAVIGERING }));
    expect(status(res)).toBe('bekreftet');
    expect(oppdateringer).toHaveLength(1);
  });
});

describe('bekreft — skannere og forhåndshentere bekrefter ikke for noen', () => {
  it('uten Sec-Fetch-headere: side med én knapp — raden verken leses eller skrives', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    const res = await GET(new NextRequest(URL_));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<html lang="nb">');
    expect(html).toContain('Ett trykk igjen');
    expect(html).toContain(`<form method="post" action="/api/soppvarsel/bekreft?t=${TOKEN}"`);
    expect(html).toContain('Bekreft soppvarselet');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(lesinger).toBe(0);
    expect(oppdateringer).toHaveLength(0);
  });

  it('forhåndshenting og fetch (Sec-Fetch-Dest: empty, Sec-Purpose: prefetch): ingenting skrives', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    await GET(new NextRequest(URL_, { headers: { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' } }));
    await GET(new NextRequest(URL_, { headers: { ...NAVIGERING, 'sec-purpose': 'prefetch' } }));
    expect(lesinger).toBe(0);
    expect(oppdateringer).toHaveLength(0);
  });

  it('siden følger språket i lenka (&sprak=), ellers nettleserens', async () => {
    let html = await (await GET(new NextRequest(`${URL_}&sprak=sv`))).text();
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('Ett tryck kvar');
    expect(html).toContain('Bekräfta svampvarningen');
    expect(html).not.toMatch(/[æø]/);
    html = await (await GET(new NextRequest(URL_, { headers: { 'accept-language': 'sv-SE,sv;q=0.9' } }))).text();
    expect(html).toContain('<html lang="sv">');
  });

  it('HEAD (lenkesjekk) svarer 200 uten å lese eller skrive', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(lesinger).toBe(0);
    expect(oppdateringer).toHaveLength(0);
  });

  it('ugyldig token sendes rett til «ugyldig lenke», uten side og uten oppslag', async () => {
    const res = await GET(new NextRequest('http://localhost/api/soppvarsel/bekreft?t=tull'));
    expect(status(res)).toBe('ugyldig-lenke');
    expect(lesinger).toBe(0);
  });
});

describe('bekreft — knappen på siden (POST)', () => {
  const trykk = () => POST(new NextRequest(URL_, { method: 'POST' }));

  it('bekrefter raden som venter og sender videre til områdesiden', async () => {
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: null };
    const res = await trykk();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/soppforhold/oslo?status=bekreftet');
    expect(res.headers.get('set-cookie')).toContain('mycelet_hopp=1');
    expect(oppdateringer).toHaveLength(1);
    expect(oppdateringer[0].payload).toMatchObject({ active: true });
    expect(oppdateringer[0].filtre).toContainEqual(['is', 'confirmed_at', null]);
  });

  it('samme avvisninger som lenka: avmeldt rad, kontorad, ukjent og ugyldig token', async () => {
    rad = { id: 'r1', region: 'Oslo', active: false, confirmed_at: '2026-08-01T00:00:00Z', user_id: null };
    expect(status(await trykk())).toBe('ugyldig-lenke');
    rad = { id: 'r1', region: 'Oslo', active: true, confirmed_at: null, user_id: 'bruker' };
    expect(status(await trykk())).toBe('ugyldig-lenke');
    rad = null;
    expect(status(await trykk())).toBe('ugyldig-lenke');
    const ugyldig = await POST(new NextRequest('http://localhost/api/soppvarsel/bekreft?t=tull', { method: 'POST' }));
    expect(status(ugyldig)).toBe('ugyldig-lenke');
    expect(oppdateringer).toHaveLength(0);
  });
});
