import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { TOKEN_MONSTER, avmeldingslenker, hvorforIkkeNavigering, lenkeside, lenkesideSprak, lesSprak } from '../lenkeside';

/**
 * Vernet avmeldings- og bekreftelseslenkene deler. Feilen det stopper er
 * stille i begge retninger: en skanner som melder folk av, eller som fullfører
 * dobbel opt-in for dem. Reglene testes derfor her, ett sted, og rutene tester
 * bare at de bruker dem.
 */

const URL_ = 'https://www.mycelet.com/api/soppvarsel/av?t=x';
const foresporsel = (headers: Record<string, string> = {}, method = 'GET') => new NextRequest(URL_, { headers, method });

describe('hvorforIkkeNavigering', () => {
  it('en ekte navigering fra en lenke slipper gjennom', () => {
    expect(hvorforIkkeNavigering(foresporsel({ 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' }))).toBeNull();
    // Via en omskrevet lenke (Safe Links) er nettstedet «cross-site» — fortsatt en navigering.
    expect(
      hvorforIkkeNavigering(
        foresporsel({ 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'cross-site' })
      )
    ).toBeNull();
  });

  it('uten Sec-Fetch-headere vet vi ikke hvem som henter — da skrives ingenting', () => {
    expect(hvorforIkkeNavigering(foresporsel())).toBe('ukjent-klient');
  });

  it('fetch, bilde- og iframe-hentinger er ikke navigeringer', () => {
    expect(hvorforIkkeNavigering(foresporsel({ 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' }))).toBe('ikke-navigasjon');
    expect(hvorforIkkeNavigering(foresporsel({ 'sec-fetch-dest': 'image', 'sec-fetch-mode': 'no-cors' }))).toBe('ikke-navigasjon');
    expect(hvorforIkkeNavigering(foresporsel({ 'sec-fetch-dest': 'iframe', 'sec-fetch-mode': 'navigate' }))).toBe('ikke-navigasjon');
    expect(hvorforIkkeNavigering(foresporsel({ 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'no-cors' }))).toBe('ikke-navigasjon');
  });

  it('forhåndshenting og forhåndstegning ser ut som navigeringer, men er det ikke', () => {
    const nav = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };
    expect(hvorforIkkeNavigering(foresporsel({ ...nav, 'sec-purpose': 'prefetch' }))).toBe('forhandshenting');
    expect(hvorforIkkeNavigering(foresporsel({ ...nav, 'sec-purpose': 'prefetch;prerender' }))).toBe('forhandshenting');
    expect(hvorforIkkeNavigering(foresporsel({ ...nav, purpose: 'prefetch' }))).toBe('forhandshenting');
    expect(hvorforIkkeNavigering(foresporsel({ ...nav, 'x-moz': 'prefetch' }))).toBe('forhandshenting');
    expect(hvorforIkkeNavigering(foresporsel({ ...nav, 'x-purpose': 'preview' }))).toBe('forhandshenting');
  });

  it('bare GET kan være et trykk på en lenke', () => {
    const nav = { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };
    expect(hvorforIkkeNavigering(foresporsel(nav, 'HEAD'))).toBe('ikke-get');
    expect(hvorforIkkeNavigering(foresporsel(nav, 'POST'))).toBe('ikke-get');
  });
});

describe('lenkesideSprak', () => {
  it('lenka vinner, så cookien, så Accept-Language, til slutt norsk', () => {
    expect(lenkesideSprak(foresporsel({ cookie: 'MYCELET_LOCALE=nb', 'accept-language': 'nb' }), 'sv')).toBe('sv');
    expect(lenkesideSprak(foresporsel({ cookie: 'MYCELET_LOCALE=sv', 'accept-language': 'nb' }), null)).toBe('sv');
    expect(lenkesideSprak(foresporsel({ 'accept-language': 'en-US,sv;q=0.8' }))).toBe('sv');
    expect(lenkesideSprak(foresporsel({ 'accept-language': 'en-US,en;q=0.9' }))).toBe('nb');
    expect(lenkesideSprak(foresporsel())).toBe('nb');
  });

  it('ukjente språkkoder ignoreres i stedet for å bli skrevet inn i siden', () => {
    expect(lenkesideSprak(foresporsel(), 'en')).toBe('nb');
    expect(lenkesideSprak(foresporsel(), '"><script>')).toBe('nb');
    expect(lesSprak('sv')).toBe('sv');
    expect(lesSprak('nb')).toBe('nb');
    expect(lesSprak('')).toBeNull();
    expect(lesSprak(null)).toBeNull();
    expect(lesSprak(undefined)).toBeNull();
    expect(lesSprak(42)).toBeNull();
  });
});

describe('TOKEN_MONSTER', () => {
  it('slipper bare gjennom en uuid — det eneste som settes inn i siden fra lenka', () => {
    expect(TOKEN_MONSTER.test('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(TOKEN_MONSTER.test('11111111-2222-4333-8444-55555555555')).toBe(false);
    expect(TOKEN_MONSTER.test('11111111-2222-4333-8444-555555555555"><script>')).toBe(false);
    expect(TOKEN_MONSTER.test('')).toBe(false);
  });
});

describe('avmeldingslenker', () => {
  const lenker = avmeldingslenker({
    appUrl: 'https://www.mycelet.com',
    token: '11111111-2222-4333-8444-555555555555',
    sendtSek: 1790000000,
    locale: 'sv'
  });

  it('hodet (List-Unsubscribe) er den rene adressen — ingenting leverandørens POST kan snuble i', () => {
    expect(lenker.hode).toBe('https://www.mycelet.com/api/soppvarsel/av?t=11111111-2222-4333-8444-555555555555');
  });

  it('brødtekstlenka bærer utsendingstid og språk i tillegg', () => {
    const url = new URL(lenker.brodtekst);
    expect(url.pathname).toBe('/api/soppvarsel/av');
    expect(url.searchParams.get('t')).toBe('11111111-2222-4333-8444-555555555555');
    expect(url.searchParams.get('s')).toBe('1790000000');
    expect(url.searchParams.get('sprak')).toBe('sv');
  });

  it('peker på API-ruta, aldri på den passive kvitteringssiden', () => {
    expect(lenker.hode).toContain('/api/soppvarsel/av?');
    expect(lenker.brodtekst).toContain('/api/soppvarsel/av?');
  });
});

describe('lenkeside', () => {
  it('én knapp i et POST-skjema, på riktig språk, og aldri cachet', async () => {
    const res = lenkeside({
      locale: 'sv',
      tittel: 'Ett tryck till',
      tekst: 'Tryck på knappen.',
      knapp: 'Stäng av',
      skjemaMal: '/api/soppvarsel/av?t=abc',
      felt: { skjema: '1', sprak: 'sv' },
      appUrl: 'https://www.mycelet.com'
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('<title>Ett tryck till — Mycelet</title>');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<form method="post" action="/api/soppvarsel/av?t=abc"');
    expect(html).toContain('<input type="hidden" name="skjema" value="1">');
    expect(html).toContain('<input type="hidden" name="sprak" value="sv">');
    expect(html.match(/<button type="submit"/g)).toHaveLength(1);
    expect(html).toContain('href="https://www.mycelet.com"');
    expect(html).toContain('Till Mycelet');
  });
});
