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

/** Alle strengverdier i en katalog, som [sti, verdi]. */
function leafStrings(catalog: Catalog): Array<[string, string]> {
  return leafKeys(catalog)
    .map((path) => [path, path.split('.').reduce<unknown>((acc, k) => (acc as Catalog)?.[k], catalog)] as const)
    .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string')
    .map(([path, value]) => [path, value]);
}

/**
 * Rot-layouten (src/app/layout.tsx) setter tittelmalen '%s — Mycelet'. En
 * metaTitle som bærer merkenavnet selv blir da «Personvern — Mycelet —
 * Mycelet» — i fanetittelen, i Google-treff og i delingsforhåndsvisninger.
 * Det skjedde på fem sider samtidig, nettopp de sidene en Apple-reviewer
 * åpner først.
 */
describe('metaTitle', () => {
  it('lar layout-malen legge på merkenavnet i stedet for å gjenta det', () => {
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const withBrand = leafStrings(catalog as Catalog)
        .filter(([path, value]) => path.endsWith('.metaTitle') && value.includes('Mycelet'))
        .map(([path]) => path);
      expect(withBrand, `metaTitle med merkenavn i ${locale}`).toEqual([]);
    }
  });
});

/**
 * AI-kvoten håndheves av FREE_DAILY_AI_LIMIT i src/lib/billing/plans.ts.
 * Skriver en tekst tallet i klartekst, driver den fra håndhevingen uten at
 * noe feiler: prissiden viste både «5 AI-identifikasjoner per døgn» (fast
 * tekst) og «AI-kvote: {limit} per døgn» (fra koden) på samme skjerm.
 */
describe('AI-kvoten i markedsføringsteksten', () => {
  const QUOTA_KEYS = ['Pricing.freeFeature1', 'Pricing.faq3A', 'Landing.planFreeF1', 'Landing.faqFreeA'];

  it('tar tallet som parameter, ikke som fast tekst', () => {
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      for (const key of QUOTA_KEYS) {
        const value = key.split('.').reduce<unknown>((acc, k) => (acc as Catalog)?.[k], catalog);
        expect(typeof value, `${key} i ${locale}`).toBe('string');
        expect(value as string, `${key} i ${locale}`).toContain('{limit}');
        expect(value as string, `${key} i ${locale}`).not.toMatch(/\b\d+ AI-identif/);
      }
    }
  });
});

/**
 * Aldersgrensen skal stå ett sted: 13 år for konto, 18 for kjøp, samtykke
 * fra foresatt mellom 13 og 18. Avkryssingsboksen ved registrering sa 18 år
 * mens vilkårenes aldersavsnitt sa 13 — to dokumenter i samme app om samme
 * spørsmål.
 */
describe('aldersgrensen', () => {
  it('registreringsboksen oppgir 13-årsgrensen, ikke 18', () => {
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const accept = (catalog as Catalog).AuthRegister as Catalog;
      expect(accept.acceptPrefix as string, `acceptPrefix i ${locale}`).toMatch(/\b13\b/);
      expect(accept.acceptPrefix as string, `acceptPrefix i ${locale}`).toMatch(/\b18\b/);
      // Vilkårenes aldersavsnitt må fortsatt nevne begge grensene.
      const age = ((catalog as Catalog).Vilkar as Catalog).ageBody as string;
      expect(age, `ageBody i ${locale}`).toMatch(/\b13\b/);
      expect(age, `ageBody i ${locale}`).toMatch(/\b18\b/);
    }
  });
});
