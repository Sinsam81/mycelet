import { describe, expect, it } from 'vitest';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

type Catalog = Record<string, unknown>;

/** Flatten to dotted leaf paths so a missing nested key is caught, not just a missing namespace. */
function leafKeys(value: Catalog, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child !== null && typeof child === 'object' && !Array.isArray(child)
      ? leafKeys(child as Catalog, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

/**
 * Vakten mot den feilklassen som har kostet mest i dette prosjektet: en
 * meldingsnøkkel som finnes på norsk og mangler på svensk. next-intl feiler
 * ikke høylytt på det — brukeren ser nøkkelnavnet, eller ingenting.
 *
 * leafKeys flater ut til punktseparerte stier, så en manglende nøkkel dypt inne
 * i et navnerom fanges — ikke bare et helt manglende navnerom.
 */
describe('message catalogs', () => {
  it('nb and sv define exactly the same keys', () => {
    const nbKeys = new Set(leafKeys(nb as Catalog));
    const svKeys = new Set(leafKeys(sv as Catalog));

    expect([...nbKeys].filter((k) => !svKeys.has(k)).sort()).toEqual([]);
    expect([...svKeys].filter((k) => !nbKeys.has(k)).sort()).toEqual([]);
  });

  it('har ingen tomme verdier — en tom streng rendrer som en blank etikett', () => {
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const blanks = leafKeys(catalog as Catalog).filter((path) => {
        const value = path.split('.').reduce<unknown>((acc, k) => (acc as Catalog)?.[k], catalog);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(blanks, `tomme nøkler i ${locale}`).toEqual([]);
    }
  });

  it('begge katalogene har faktisk innhold — så testen over ikke består på tomme filer', () => {
    // Uten denne ville to tomme kataloger «hatt like nøkler» og bestått.
    expect(leafKeys(nb as Catalog).length).toBeGreaterThan(500);
    expect(leafKeys(sv as Catalog).length).toBeGreaterThan(500);
  });
});
