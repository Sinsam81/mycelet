import { describe, expect, it } from 'vitest';
import { readSafeNext } from '@/lib/auth/safe-redirect';
import { HJEM, HJEM_UTLOGGET_I_APPEN, erAktiv, hjemHref, innloggingHref } from '../hjem';

/**
 * I iOS-skallet var et trykk på «Hjem» som utlogget en full sidelasting som
 * endte der brukeren alt sto, uten at noen fane lyste — og toppen hadde ingen
 * synlig vei til innlogging. Løkka kan ikke prøves lokalt (mellomvaren kjører
 * ikke i Turbopack-dev), så reglene står her.
 */
describe('hjemHref', () => {
  it('utlogget i appen: rett til /soppforhold, ikke via «/» og landingssiden', () => {
    expect(hjemHref({ native: true, innlogget: false })).toBe('/soppforhold');
    expect(HJEM_UTLOGGET_I_APPEN).toBe('/soppforhold');
  });

  it('innlogget i appen: «/», som før', () => {
    expect(hjemHref({ native: true, innlogget: true })).toBe('/');
  });

  it('på nett er hjem alltid «/» — utloggede skal fortsatt nå landingssiden', () => {
    expect(hjemHref({ native: false, innlogget: false })).toBe('/');
    expect(hjemHref({ native: false, innlogget: true })).toBe('/');
    expect(HJEM).toBe('/');
  });
});

describe('erAktiv', () => {
  it('«/» treffer bare seg selv — ellers ville Hjem lyst på alle sider', () => {
    expect(erAktiv('/', '/')).toBe(true);
    expect(erAktiv('/species', '/')).toBe(false);
    expect(erAktiv('/soppforhold', '/')).toBe(false);
  });

  it('en fane lyser på siden sin og alt under den', () => {
    expect(erAktiv('/species', '/species')).toBe(true);
    expect(erAktiv('/species/12', '/species')).toBe(true);
    expect(erAktiv('/map', '/species')).toBe(false);
  });

  it('bare hele stiledd teller — /speciesfoo er ikke under /species', () => {
    expect(erAktiv('/speciesfoo', '/species')).toBe(false);
    expect(erAktiv('/soppforholdene', '/soppforhold')).toBe(false);
  });

  it('når hjem er /soppforhold, lyser den også på områdesidene', () => {
    const hjem = hjemHref({ native: true, innlogget: false });
    expect(erAktiv('/soppforhold', hjem)).toBe(true);
    expect(erAktiv('/soppforhold/oslo', hjem)).toBe(true);
    expect(erAktiv('/calendar', hjem)).toBe(false);
  });

  it('uten sti lyser ingenting', () => {
    expect(erAktiv(null, '/species')).toBe(false);
    expect(erAktiv(undefined, '/')).toBe(false);
    expect(erAktiv('', '/')).toBe(false);
  });
});

describe('innloggingHref', () => {
  const tilbake = (href: string) => readSafeNext(new URL(href, 'https://www.mycelet.com').searchParams);

  it('tar med veien tilbake til siden brukeren står på', () => {
    expect(innloggingHref({ pathname: '/species/12', native: false })).toBe('/auth/login?next=%2Fspecies%2F12');
    expect(innloggingHref({ pathname: '/soppforhold/oslo', native: true })).toBe('/auth/login?next=%2Fsoppforhold%2Foslo');
  });

  it('innloggingssiden godtar veien tilbake slik den står (readSafeNext)', () => {
    for (const pathname of ['/species/12', '/soppforhold/göteborg', '/calendar', '/soppforhold']) {
      expect(tilbake(innloggingHref({ pathname, native: false }))).toBe(encodeURI(pathname));
    }
  });

  it('fra «/» trengs ingen vei tilbake — innloggingen lander der uansett', () => {
    expect(innloggingHref({ pathname: '/', native: false })).toBe('/auth/login');
    expect(innloggingHref({ pathname: null, native: false })).toBe('/auth/login');
    expect(innloggingHref({ pathname: undefined, native: true })).toBe('/auth/login');
  });

  it('aldri tilbake til en auth-side — det er en løkke', () => {
    expect(innloggingHref({ pathname: '/auth/login', native: false })).toBe('/auth/login');
    expect(innloggingHref({ pathname: '/auth/bekreftet-app', native: true })).toBe('/auth/login');
    // …men en side som bare BEGYNNER likt er en vanlig side.
    expect(innloggingHref({ pathname: '/authors', native: false })).toBe('/auth/login?next=%2Fauthors');
  });

  it('fra appens utloggede hjem går innloggingen til det innloggede hjemmet', () => {
    expect(innloggingHref({ pathname: '/soppforhold', native: true })).toBe('/auth/login');
    // På nett er /soppforhold en vanlig, delbar side: tilbake dit.
    expect(innloggingHref({ pathname: '/soppforhold', native: false })).toBe('/auth/login?next=%2Fsoppforhold');
  });

  it('en sti som ikke er en intern sti tas ikke med', () => {
    expect(innloggingHref({ pathname: 'https://evil.example', native: false })).toBe('/auth/login');
  });
});
