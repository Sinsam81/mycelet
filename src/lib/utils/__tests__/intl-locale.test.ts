import { describe, it, expect } from 'vitest';
import { intlLocale } from '../intl-locale';

/**
 * Appen bruker språkkodene `nb` og `sv`. Intl trenger `nb-NO` og `sv-SE`.
 * Den oversettelsen var skrevet ut for hånd fire steder og glemt sytten andre,
 * så svenske brukere leste «Medlem siden desember 2025» på profilen og
 * «15. august» i slettingsvarselet.
 */

describe('intlLocale', () => {
  it('sv gir sv-SE', () => expect(intlLocale('sv')).toBe('sv-SE'));
  it('nb gir nb-NO', () => expect(intlLocale('nb')).toBe('nb-NO'));

  it.each(['', 'en', 'da', 'nb-NO', undefined as unknown as string])(
    'ukjent verdi (%s) faller til norsk',
    (input) => {
      // Norsk er standardspråket; en ukjent kode skal gi lesbar tekst, ikke kast.
      expect(intlLocale(input)).toBe('nb-NO');
    }
  );
});

describe('at det faktisk gir forskjellig tekst', () => {
  // Uten denne kunne hjelperen returnert riktig streng og likevel vært koblet
  // feil — poenget er at leseren ser en forskjell.
  const dato = new Date('2026-08-15T12:00:00Z');

  it('månedsnavnet er ulikt', () => {
    const nb = dato.toLocaleDateString(intlLocale('nb'), { month: 'long', timeZone: 'UTC' });
    const sv = dato.toLocaleDateString(intlLocale('sv'), { month: 'long', timeZone: 'UTC' });
    expect(nb).toBe('august');
    expect(sv).toBe('augusti');
    expect(nb).not.toBe(sv);
  });

  it('datoformatet er ulikt', () => {
    const nb = dato.toLocaleDateString(intlLocale('nb'), { timeZone: 'UTC' });
    const sv = dato.toLocaleDateString(intlLocale('sv'), { timeZone: 'UTC' });
    // Norsk: 15.8.2026 · svensk: 2026-08-15
    expect(nb).not.toBe(sv);
    expect(sv.startsWith('2026')).toBe(true);
  });

  it('tallformatet er ulikt', () => {
    expect((1234.5).toLocaleString(intlLocale('nb'))).not.toBe('');
    expect((1234.5).toLocaleString(intlLocale('sv'))).not.toBe('');
  });
});
