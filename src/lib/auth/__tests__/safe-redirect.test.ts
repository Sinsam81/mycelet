import { describe, it, expect } from 'vitest';
import { getSafeNext, readSafeNext } from '../safe-redirect';

/**
 * Den gamle sjekken i callback-ruten, tatt vare på her som referanse.
 * Testen «stopper det den gamle slapp gjennom» under dokumenterer nøyaktig
 * hvilke inputs som endret oppførsel, slik at ingen kommer til å «forenkle»
 * validatoren tilbake til dette senere.
 */
function legacyGetSafeNext(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/')) return '/';
  if (rawNext.startsWith('//')) return '/';
  return rawNext;
}

/** Hvor havner brukeren faktisk hvis vi løser stien mot vårt eget domene? */
function resolve(path: string): string {
  return new URL(path, 'https://mycelet.com').href;
}

const isExternal = (path: string) => !resolve(path).startsWith('https://mycelet.com/');

describe('getSafeNext', () => {
  describe('slipper gjennom lovlige interne stier', () => {
    const allowed = [
      '/',
      '/map',
      '/forum/new',
      '/mine-steder',
      '/species/12',
      '/forum/new?kategori=funn',
      '/species/12#forveksling',
      '/forum?side=2&sort=ny'
    ];

    it.each(allowed)('%s beholdes uendret', (path) => {
      expect(getSafeNext(path)).toBe(path);
    });
  });

  describe('avviser eksterne mål', () => {
    const attacks = [
      ['protokoll-relativ', '//evil.com'],
      ['protokoll-relativ med sti', '//evil.com/logg-inn'],
      ['backslash', '/\\evil.com'],
      ['dobbel backslash', '/\\\\evil.com'],
      ['blandet skråstrek', '/\\/evil.com'],
      ['newline skjuler //', '/\n/evil.com'],
      ['carriage return skjuler //', '/\r//evil.com'],
      ['tab skjuler //', '/\t//evil.com'],
      ['absolutt https', 'https://evil.com'],
      ['absolutt http', 'http://evil.com'],
      ['javascript-skjema', 'javascript:alert(1)'],
      ['data-skjema', 'data:text/html,<script>alert(1)</script>'],
      ['skjemarelativ uten skråstrek', 'evil.com'],
      ['bruker-info-triks', '/\\@evil.com']
    ] as const;

    it.each(attacks)('%s (%s) sendes til fallback', (_navn, input) => {
      expect(getSafeNext(input)).toBe('/');
    });

    it.each(attacks)('%s (%s) havner aldri utenfor domenet', (_navn, input) => {
      expect(isExternal(getSafeNext(input))).toBe(false);
    });
  });

  describe('stopper det den gamle validatoren slapp gjennom', () => {
    // Disse fem er ekte omgåelser av sjekken som lå i callback-ruten.
    const bypasses = ['/\\evil.com', '/\\\\evil.com', '/\n/evil.com', '/\r//evil.com', '/\t//evil.com'];

    it.each(bypasses)('%s lakk ut av domenet før', (input) => {
      expect(isExternal(legacyGetSafeNext(input))).toBe(true);
    });

    it.each(bypasses)('%s gjør det ikke lenger', (input) => {
      expect(isExternal(getSafeNext(input))).toBe(false);
    });
  });

  describe('tomme verdier', () => {
    it('null gir fallback', () => expect(getSafeNext(null)).toBe('/'));
    it('undefined gir fallback', () => expect(getSafeNext(undefined)).toBe('/'));
    it('tom streng gir fallback', () => expect(getSafeNext('')).toBe('/'));
    it('egendefinert fallback respekteres', () => expect(getSafeNext('//evil.com', '/profile')).toBe('/profile'));
  });

  it('normaliserer stien i stedet for å ekko råstrengen', () => {
    // Resultatet skal komme fra URL-parseren, ikke fra inputen.
    expect(getSafeNext('/forum/../map')).toBe('/map');
  });

  describe('stien som kommer UT må også være trygg', () => {
    // Origin-sjekken ser på den PARSEDE URL-en, men vi returnerer pathname.
    // «/..//evil.com» normaliseres til pathname «//evil.com» med origin fortsatt
    // internal.invalid — sjekken passerer, og det vi gir fra oss er en
    // protokoll-relativ URL. router.push('//evil.com') går ut av domenet.
    const dotDotAttacks = [
      '/..//evil.com',
      '/../..//evil.com',
      '/a/..//evil.com',
      '/./..//evil.com',
      '/..///evil.com',
      '/..//evil.com/logg-inn'
    ];

    it.each(dotDotAttacks)('%s gir ikke en protokoll-relativ sti', (input) => {
      expect(getSafeNext(input).startsWith('//')).toBe(false);
    });

    it.each(dotDotAttacks)('%s havner ikke utenfor domenet', (input) => {
      expect(isExternal(getSafeNext(input))).toBe(false);
    });
  });
});

describe('readSafeNext', () => {
  it('leser next', () => {
    expect(readSafeNext(new URLSearchParams('next=/map'))).toBe('/map');
  });

  it('faller tilbake til redirect når next mangler', () => {
    expect(readSafeNext(new URLSearchParams('redirect=/profile'))).toBe('/profile');
  });

  it('lar next vinne over redirect', () => {
    expect(readSafeNext(new URLSearchParams('next=/map&redirect=/profile'))).toBe('/map');
  });

  it('validerer verdien den leser', () => {
    expect(readSafeNext(new URLSearchParams('next=//evil.com'))).toBe('/');
  });

  it('validerer også redirect-aliaset', () => {
    expect(readSafeNext(new URLSearchParams('redirect=/\\evil.com'))).toBe('/');
  });

  it('tåler manglende params', () => {
    expect(readSafeNext(null)).toBe('/');
  });
});
