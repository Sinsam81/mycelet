import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { ORGANISASJON } from '@/lib/seo/organisasjon';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { META_MAKS, byggArtJsonLd, jsonLdTilScript, metabeskrivelse, type ArtJsonLdRad } from '../artsmetadata';

/**
 * Radene er lest fra produksjon 16. november 2026 (bare lesing), med feltene
 * modulen bruker.
 */
const STEINSOPP: ArtJsonLdRad = {
  latin_name: 'Boletus edulis',
  norwegian_name: 'Steinsopp',
  swedish_name: 'Karljohan',
  english_name: 'Penny bun',
  synonyms: [],
  genus: 'Boletus',
  family: 'Boletaceae',
  primary_image_photographer: 'Fotograf Eksempel',
  primary_image_license: 'CC BY-SA 3.0',
  primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Boletus_edulis_IT.jpg'
};

const HVIT_TRAKTSOPP: ArtJsonLdRad = {
  latin_name: 'Clitocybe rivulosa',
  norwegian_name: 'Hvit traktsopp',
  swedish_name: 'Gifttrattskivling',
  english_name: "Fool's funnel",
  synonyms: ['Clitocybe dealbata', 'Clitocybe rivulosa var. dealbata'],
  genus: 'Clitocybe',
  family: 'Tricholomataceae'
};

const URL_STEINSOPP = 'https://www.mycelet.com/species/2';
const BILDE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Boletus_edulis_IT.jpg/1280px-Boletus_edulis_IT.jpg';

function jsonLd(overstyr: Partial<Parameters<typeof byggArtJsonLd>[0]> = {}) {
  return byggArtJsonLd({
    url: URL_STEINSOPP,
    visningsnavn: 'Steinsopp',
    rad: STEINSOPP,
    beskrivelse: 'Steinsopp (Boletus edulis): sesong juli – oktober. Voksested, kjennetegn og forvekslingsarter i Mycelets soppbibliotek.',
    bildeUrl: BILDE,
    utgiver: ORGANISASJON,
    ...overstyr
  });
}

describe('metabeskrivelse', () => {
  const STEINSOPP_LANG =
    'Steinsopp (Boletus edulis): sesong juli – oktober. Voksested, kjennetegn og forvekslingsarter i Mycelets soppbibliotek.';
  const STEINSOPP_KORT = 'Steinsopp (Boletus edulis): sesong juli – oktober.';
  const tillegg = 'På svensk: Karljohan.';

  it('setter navnet på det andre språket etter den nøytrale setningen', () => {
    expect(metabeskrivelse({ grunnsetning: STEINSOPP_LANG, kortGrunnsetning: STEINSOPP_KORT, tillegg })).toBe(
      `${STEINSOPP_LANG} ${tillegg}`
    );
    expect(metabeskrivelse({ grunnsetning: STEINSOPP_LANG, kortGrunnsetning: STEINSOPP_KORT })).toBe(STEINSOPP_LANG);
  });

  it('bytter til den korte setningen når navnet ellers ikke får plass', () => {
    // Uten den korte setningen falt «På svensk: …» bort for 36 av 77 arter på
    // norsk — og den norske siden er den søkemotorene får.
    const lang =
      'Grønn fluesopp (Amanita phalloides): sesong august – oktober. Voksested, kjennetegn og forvekslingsarter i Mycelets soppbibliotek.';
    const kort = 'Grønn fluesopp (Amanita phalloides): sesong august – oktober.';
    const navn = 'På svensk: Lömsk flugsvamp.';
    expect(lang.length + 1 + navn.length).toBeGreaterThan(META_MAKS);
    expect(metabeskrivelse({ grunnsetning: lang, kortGrunnsetning: kort, tillegg: navn })).toBe(`${kort} ${navn}`);
  });

  it('kutter aldri en setning — får ikke navnet plass bak noen av dem, står den lange alene', () => {
    const lang =
      'Orangebrun giftspindling (Cortinarius orellanus): säsong augusti – oktober. Växtplats, kännetecken och förväxlingsarter i Mycelets svampbibliotek.';
    expect(lang.length).toBeLessThanOrEqual(META_MAKS);
    expect(metabeskrivelse({ grunnsetning: lang, tillegg: 'På norska: Butt giftslørsopp.' })).toBe(lang);
    expect(metabeskrivelse({ grunnsetning: 'En to tre fire.', kortGrunnsetning: 'En to.', tillegg: 'Langt navn.', maks: 12 })).toBe(
      'En to tre fire.'
    );
  });

  it('klarer seg med den korte setningen, og med navnet alene', () => {
    expect(metabeskrivelse({ kortGrunnsetning: STEINSOPP_KORT, tillegg })).toBe(`${STEINSOPP_KORT} ${tillegg}`);
    expect(metabeskrivelse({ tillegg })).toBe(tillegg);
  });

  it('gir undefined når det ikke er noe å si', () => {
    expect(metabeskrivelse({})).toBeUndefined();
    expect(metabeskrivelse({ grunnsetning: ' ', kortGrunnsetning: '', tillegg: ' ' })).toBeUndefined();
  });

  it('tar ikke imot brødtekst fra basen', () => {
    // Den norske beskrivelsen var ingressen, og 23 av 80 ingresser sier noe om
    // matverdi. Parameteren er fjernet; typesjekken holder den ute.
    const beskrivelse = metabeskrivelse({
      grunnsetning: STEINSOPP_LANG,
      // @ts-expect-error — `ingress` finnes ikke lenger, med vilje.
      ingress: 'Trygg og god matsopp.'
    });
    expect(beskrivelse).toBe(STEINSOPP_LANG);
  });
});

describe('byggArtJsonLd', () => {
  it('sier hvilken art siden handler om, med alle navnene vi har', () => {
    const data = jsonLd();
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('Taxon');
    expect(data.name).toBe('Steinsopp');
    expect(data.taxonRank).toBe('species');
    expect(data.url).toBe(URL_STEINSOPP);
    // Latinsk navn først, så de andre språkene. Sidens eget navn gjentas ikke.
    expect(data.alternateName).toEqual(['Boletus edulis', 'Karljohan', 'Penny bun']);
    expect(data.publisher).toBe(ORGANISASJON);
  });

  it('bytter om på navnene når siden er svensk', () => {
    expect(jsonLd({ visningsnavn: 'Karljohan' }).alternateName).toEqual(['Boletus edulis', 'Steinsopp', 'Penny bun']);
  });

  it('tar med de eldre vitenskapelige navnene', () => {
    const data = jsonLd({ visningsnavn: 'Hvit traktsopp', rad: HVIT_TRAKTSOPP, bildeUrl: null });
    expect(data.alternateName).toEqual([
      'Clitocybe rivulosa',
      'Gifttrattskivling',
      "Fool's funnel",
      'Clitocybe dealbata',
      'Clitocybe rivulosa var. dealbata'
    ]);
  });

  it('gjentar ikke et navn som er likt på begge språk', () => {
    const kantarell = { ...STEINSOPP, norwegian_name: 'Kantarell', swedish_name: 'Kantarell', english_name: 'Chanterelle' };
    expect(jsonLd({ visningsnavn: 'Kantarell', rad: kantarell }).alternateName).toEqual(['Boletus edulis', 'Chanterelle']);
  });

  it('plasserer arten i slekt og familie', () => {
    expect(jsonLd().parentTaxon).toEqual({
      '@type': 'Taxon',
      name: 'Boletus',
      taxonRank: 'genus',
      parentTaxon: { '@type': 'Taxon', name: 'Boletaceae', taxonRank: 'family' }
    });
    expect(jsonLd({ rad: { ...STEINSOPP, family: null } }).parentTaxon).toEqual({
      '@type': 'Taxon',
      name: 'Boletus',
      taxonRank: 'genus'
    });
    expect(jsonLd({ rad: { ...STEINSOPP, genus: ' ' } }).parentTaxon).toEqual({
      '@type': 'Taxon',
      name: 'Boletaceae',
      taxonRank: 'family'
    });
    expect('parentTaxon' in jsonLd({ rad: { ...STEINSOPP, genus: null, family: null } })).toBe(false);
  });

  it('krediterer bildet med fotograf og lisens', () => {
    expect(jsonLd().image).toEqual({
      '@type': 'ImageObject',
      contentUrl: BILDE,
      creditText: 'Fotograf Eksempel (CC BY-SA 3.0)',
      acquireLicensePage: 'https://commons.wikimedia.org/wiki/File:Boletus_edulis_IT.jpg'
    });
  });

  it('skriver aldri en plassholder som lisens', () => {
    // Seedingen skrev license = 'Wikimedia Commons' — en kilde, ikke en lisens.
    const uferdig = { ...STEINSOPP, primary_image_photographer: null, primary_image_license: 'Wikimedia Commons' };
    expect(jsonLd({ rad: uferdig }).image).toBe(BILDE);
    const bareLisens = { ...STEINSOPP, primary_image_photographer: null };
    expect(jsonLd({ rad: bareLisens }).image).toMatchObject({ creditText: 'CC BY-SA 3.0' });
    const farligLenke = { ...STEINSOPP, primary_image_source_url: 'javascript:alert(1)' };
    expect('acquireLicensePage' in (jsonLd({ rad: farligLenke }).image as object)).toBe(false);
  });

  it('har ikke noe bildefelt for en art uten bilde', () => {
    expect('image' in jsonLd({ bildeUrl: null })).toBe(false);
    expect('image' in jsonLd({ bildeUrl: '  ' })).toBe(false);
  });

  it('utelater beskrivelsen når siden ikke har en nøytral setning å gi', () => {
    expect('description' in jsonLd({ beskrivelse: null })).toBe(false);
    expect(jsonLd().description).toContain('Steinsopp (Boletus edulis)');
  });

  it('sier aldri noe om spiselighet eller giftighet', () => {
    // Strukturerte data siteres uten siden rundt. Radene under har spiselighet,
    // notater og giftinformasjon — ingenting av det skal ut.
    const medAlt = {
      ...HVIT_TRAKTSOPP,
      edibility: 'toxic',
      edibility_notes: 'Giftig. Inneholder muskarin.',
      toxin_info: 'Muskarin',
      symptoms: 'Svette, spyttflod, synsforstyrrelser',
      description: 'Liten hvit traktsopp i gress. Trygg og god matsopp er den IKKE.',
      commonality: 'common'
    } as ArtJsonLdRad;
    for (const rad of [medAlt, { ...STEINSOPP, edibility: 'edible', description: 'Utmerket matsopp.' } as ArtJsonLdRad]) {
      const tekst = JSON.stringify(byggArtJsonLd({ url: URL_STEINSOPP, visningsnavn: 'Testsopp', rad, utgiver: ORGANISASJON }));
      expect(tekst).not.toMatch(/edib|toxic|deadly|spiselig|giftig|matsopp|muskarin|symptom|trygg|ätlig/i);
      expect(Object.keys(JSON.parse(tekst)).sort()).toEqual(
        ['@context', '@type', 'alternateName', 'name', 'parentTaxon', 'publisher', 'taxonRank', 'url'].sort()
      );
    }
  });

  it('tåler en rad der alt mangler eller har feil form', () => {
    const data = byggArtJsonLd({
      url: URL_STEINSOPP,
      visningsnavn: 'Ukjent art',
      rad: { latin_name: 42, synonyms: 'Agaricus', genus: [], family: {} } as ArtJsonLdRad,
      utgiver: ORGANISASJON
    });
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Taxon',
      name: 'Ukjent art',
      taxonRank: 'species',
      url: URL_STEINSOPP,
      publisher: ORGANISASJON
    });
  });
});

describe('jsonLdTilScript', () => {
  it('lar ikke et navn fra basen avslutte script-taggen', () => {
    const farlig = jsonLd({ visningsnavn: 'Sopp</script><script>alert(1)</script>' });
    const ut = jsonLdTilScript(farlig);
    expect(ut).not.toContain('<');
    expect(ut).toContain('\\u003c/script>');
    // Fortsatt samme data når den leses som JSON.
    expect(JSON.parse(ut)).toEqual(JSON.parse(JSON.stringify(farlig)));
  });
});

describe('tekstene i meldingskatalogen', () => {
  const KATALOGER = [
    ['nb', nb],
    ['sv', sv]
  ] as const;

  for (const [locale, katalog] of KATALOGER) {
    const messages = katalog as unknown as Record<string, unknown>;
    const t = createTranslator({ locale, messages, namespace: 'SpeciesDetail' }) as unknown as (
      key: string,
      values?: Record<string, string>
    ) => string;

    it(`${locale}: setningen i de strukturerte dataene nevner ikke spiselighet`, () => {
      // Samme setning for kantarell og grønn fluesopp, og ordet skal ikke stå
      // der i det hele tatt — heller ikke som tema.
      const setning = t('structuredDataDescription', {
        name: 'Grønn fluesopp',
        latin: 'Amanita phalloides',
        season: 'august – oktober'
      });
      expect(setning).toContain('Grønn fluesopp (Amanita phalloides)');
      expect(setning).toContain('august – oktober');
      expect(setning).not.toMatch(/spiselig|ätlig|edib|giftig|matsopp|matsvamp|trygg|säker/i);
    });

    it(`${locale}: den korte setningen er starten på den lange, og nevner heller ikke spiselighet`, () => {
      // Metabeskrivelsen bytter til den korte når den lange ikke gir plass til
      // navnet på det andre språket. De to skal si det samme, bare kortere.
      const verdier = { name: 'Grønn fluesopp', latin: 'Amanita phalloides', season: 'august – oktober' };
      const kort = t('metaDescriptionShort', verdier);
      expect(kort).toBe(`Grønn fluesopp (Amanita phalloides): ${locale === 'sv' ? 'säsong' : 'sesong'} august – oktober.`);
      expect(t('structuredDataDescription', verdier).startsWith(`${kort} `)).toBe(true);
      expect(kort).not.toMatch(/spiselig|ätlig|edib|giftig|matsopp|matsvamp|trygg|säker/i);
    });

    it(`${locale}: tillegget med det andre språkets navn er en hel setning`, () => {
      const tillegg = t('metaOtherLanguageName', { name: 'Karljohan' });
      expect(tillegg).toContain('Karljohan');
      expect(tillegg.endsWith('.')).toBe(true);
      expect(tillegg.length).toBeLessThan(40);
    });
  }
});
