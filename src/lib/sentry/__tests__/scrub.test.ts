import { describe, expect, it } from 'vitest';
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';
import { isTileUrl, scrubBreadcrumb, scrubEvent, stripQuery } from '../scrub';

/**
 * Disse testene er skrevet ETTER en ekte lekkasje, med de faktiske strengene.
 *
 * Sentry ble lagt inn med rensing i tre håndskrevne kopier — én per runtime.
 * Klienten hadde `beforeBreadcrumb`; serveren hadde ingen. En gransking
 * reproduserte hva som da faktisk forlot prosessen ved en hvilken som helst
 * serverfeil:
 *
 *   "http.query": "?select=id&user_id=eq.3f2b8c1e-1111-2222-3333-444455556666"
 *   "http.query": "?koordsys=4258&nord=59.91342&ost=10.74609"
 *
 * Altså brukerens Supabase-ID og posisjonen på meteren — i data vi hadde
 * erklært til Apple som «Diagnostics — Not Linked to You», og som
 * personvernerklæringen lover at ikke sendes.
 *
 * Strengene under er kopiert fra den reproduksjonen med vilje. En test som
 * bruker `?foo=bar` ville bestått uten å bevise noe.
 */

/** Adressene appen faktisk kaller, hentet fra kilden. */
const SUPABASE = 'https://xyz.supabase.co/rest/v1/forum_posts?select=id&user_id=eq.3f2b8c1e-1111';
const GEONORGE = 'https://ws.geonorge.no/hoydedata/v1/punkt?koordsys=4258&nord=59.91342&ost=10.74609';
const KARTFLIS = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/16/35012/17891.png';

describe('stripQuery', () => {
  it('fjerner query-strengen', () => {
    expect(stripQuery(GEONORGE)).toBe('https://ws.geonorge.no/hoydedata/v1/punkt');
  });

  it('fjerner også fragmentet', () => {
    expect(stripQuery('https://mycelet.com/map#lat=59.9')).toBe('https://mycelet.com/map');
  });

  it('lar en ren adresse være i fred', () => {
    expect(stripQuery('https://mycelet.com/species/42')).toBe('https://mycelet.com/species/42');
  });
});

describe('isTileUrl', () => {
  it('kjenner igjen alle fire flis-kildene fra offlineMap.ts', () => {
    expect(isTileUrl(KARTFLIS)).toBe(true);
    expect(isTileUrl('https://a.tile.openstreetmap.org/16/35012/17891.png')).toBe(true);
    expect(isTileUrl('https://opencache.statkart.no/gatekeeper/gk/gk.open?x=1')).toBe(true);
    expect(
      isTileUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/16/1/2')
    ).toBe(true);
  });

  it('tar ikke appens egne API-kall for kartfliser', () => {
    expect(isTileUrl('https://mycelet.com/api/prediction')).toBe(false);
    expect(isTileUrl('https://mycelet.com/api/identify')).toBe(false);
  });
});

describe('scrubBreadcrumb', () => {
  it('fjerner http.query — feltet som faktisk lakk', () => {
    const b = scrubBreadcrumb({
      category: 'http',
      data: { url: 'https://xyz.supabase.co/rest/v1/forum_posts', 'http.query': '?user_id=eq.3f2b8c1e' }
    });
    expect(JSON.stringify(b)).not.toMatch(/user_id|3f2b8c1e/);
  });

  it('fjerner koordinatene fra et Geonorge-kall', () => {
    const b = scrubBreadcrumb({ category: 'http', data: { url: GEONORGE } });
    expect(b?.data?.url).toBe('https://ws.geonorge.no/hoydedata/v1/punkt');
    expect(JSON.stringify(b)).not.toMatch(/59\.91342|10\.74609/);
  });

  it('kaster kartfliser helt — posisjonen ligger i STIEN, ikke i query', () => {
    // Dette er hele poenget: å stryke query-strengen redder ingenting her.
    expect(stripQuery(KARTFLIS)).toMatch(/35012/); // ← posisjonen står fortsatt
    expect(scrubBreadcrumb({ category: 'http', data: { url: KARTFLIS } })).toBeNull();
  });

  it('beholder det som faktisk forklarer en krasj', () => {
    const b = scrubBreadcrumb({
      category: 'http',
      data: { url: SUPABASE, 'http.method': 'GET', status_code: 500 }
    });
    expect(b?.data).toEqual({
      url: 'https://xyz.supabase.co/rest/v1/forum_posts',
      'http.method': 'GET',
      status_code: 500
    });
  });

  it('slipper IKKE gjennom et ukjent felt — lista er en tillatelsesliste', () => {
    // Regresjonsvakt. Lekkasjen oppsto fordi `http.query` var et felt ingen
    // visste om. Med en forbudsliste ville neste ukjente felt gjort samme skade.
    const b = scrubBreadcrumb({
      category: 'http',
      data: { url: 'https://mycelet.com/api/x', et_helt_nytt_felt: 'hemmelighet' }
    });
    expect(b?.data).toEqual({ url: 'https://mycelet.com/api/x' });
  });

  it('lar en brødsmule uten data være i fred', () => {
    const b: Breadcrumb = { category: 'navigation', message: 'til /species' };
    expect(scrubBreadcrumb(b)).toBe(b);
  });
});

describe('scrubEvent', () => {
  const hendelse = (): ErrorEvent =>
    ({
      user: { id: 'abc', email: 'ola@example.com', ip_address: '1.2.3.4' },
      request: {
        url: 'https://mycelet.com/map?lat=59.91342&lng=10.74609',
        query_string: 'lat=59.91342&lng=10.74609',
        cookies: { 'sb-access-token': 'ey…' },
        headers: { authorization: 'Bearer ey…' },
        data: { note: 'hemmelig' }
      },
      contexts: {
        nextjs: { request_path: '/auth/callback?code=abc123-engangskode' }
      }
    }) as unknown as ErrorEvent;

  it('fjerner bruker, cookies, headere, innhold og query', () => {
    const e = scrubEvent(hendelse());
    expect(e.user).toBeUndefined();
    expect(e.request?.cookies).toBeUndefined();
    expect(e.request?.headers).toBeUndefined();
    expect(e.request?.data).toBeUndefined();
    expect(e.request?.query_string).toBeUndefined();
    expect(e.request?.url).toBe('https://mycelet.com/map');
  });

  it('renser contexts.nextjs.request_path — den som slapp unna all annen rensing', () => {
    // captureRequestError skriver Next.js' RÅ sti hit, query inkludert.
    // dataCollection.urlQueryParams:false gjelder kun event.request.query_string
    // og rører ikke denne. En engangs-auth-kode ville altså gått rett til Sentry.
    const e = scrubEvent(hendelse());
    expect((e.contexts?.nextjs as { request_path?: string })?.request_path).toBe('/auth/callback');
  });

  it('etterlater ingen posisjon, e-post eller token noe sted i hendelsen', () => {
    const json = JSON.stringify(scrubEvent(hendelse()));
    for (const hemmelighet of ['59.91342', '10.74609', 'ola@example.com', '1.2.3.4', 'ey…', 'abc123']) {
      expect(json, `«${hemmelighet}» står fortsatt i hendelsen`).not.toMatch(hemmelighet);
    }
  });

  it('takler en hendelse uten request og uten contexts', () => {
    expect(() => scrubEvent({} as ErrorEvent)).not.toThrow();
  });
});
