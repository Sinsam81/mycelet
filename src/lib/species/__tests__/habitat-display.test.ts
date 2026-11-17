import { describe, expect, it } from 'vitest';
import { HABITAT_TERMS, habitatDisplay } from '@/lib/species/habitat-filter';
import { buildExplanation } from '@/lib/utils/prediction-explanation';

/**
 * De 37 distinkte verdiene i mushroom_species.habitat, lest fra produksjon
 * 10. november 2026. Fire av dem (gammelskog, edelløvskog, hogstflate,
 * plantet skog) kom inn med migrasjon 049 og sto ikke i oversettelsestabellen.
 */
const HABITAT_I_BASEN = [
  'barskog',
  'løvskog',
  'blandingsskog',
  'granskog',
  'furuskog',
  'eng',
  'mose',
  'beite',
  'fuktig skog',
  'kantsoner',
  'gress',
  'myr',
  'lauvskog',
  'fuktig',
  'gressplen',
  'elvebredder',
  'eikeskog',
  'plen',
  'skog',
  'gammelskog',
  'eldre bestand',
  'moserik',
  'kalkrik',
  'sandig mark',
  'myr-kant',
  'brannfelt',
  'park',
  'lysninger',
  'fjellbjørkeskog',
  'sandgrunn',
  'sur jord',
  'lerkeskog',
  'hage',
  'sti',
  'edelløvskog',
  'hogstflate',
  'plantet skog'
];

/** Bokstaver som finnes i norsk, men ikke i svensk rettskriving. */
const NORSKE_BOKSTAVER = /[æø]/i;

describe('habitatDisplay', () => {
  it('viser kantarellens habitat på svensk for svenske lesere', () => {
    // Selve feilen: «barskog, blandingsskog, mose» under en svensk etikett.
    expect(habitatDisplay(['barskog', 'blandingsskog', 'mose'], 'sv')).toEqual(['barrskog', 'blandskog', 'mossa']);
  });

  it('lar norsk stå nøyaktig som i basen', () => {
    const steinsopp = ['barskog', 'lauvskog', 'eldre bestand', 'kantsoner'];
    expect(habitatDisplay(steinsopp, 'nb')).toEqual(steinsopp);
  });

  it('oversetter taggene de åtte forvekslingsartene kom med', () => {
    // Pantermusserong og krittøsterssopp, rader fra migrasjon 049.
    expect(habitatDisplay(['løvskog', 'edelløvskog'], 'sv')).toEqual(['lövskog', 'ädellövskog']);
    expect(habitatDisplay(['barskog', 'granskog', 'furuskog', 'gammelskog', 'hogstflate', 'plantet skog'], 'sv')).toEqual([
      'barrskog',
      'granskog',
      'tallskog',
      'gammelskog',
      'hygge',
      'planterad skog'
    ]);
  });

  it('slår sammen verdier som blir samme ord på svensk', () => {
    expect(habitatDisplay(['løvskog', 'lauvskog'], 'sv')).toEqual(['lövskog']);
    expect(habitatDisplay(['eng', 'plen', 'beite', 'gressplen'], 'sv')).toEqual(['äng', 'gräsmatta', 'betesmark']);
    // På norsk er de to skrivemåtene to ulike ord i basen, og vises som de står.
    expect(habitatDisplay(['løvskog', 'lauvskog'], 'nb')).toEqual(['løvskog', 'lauvskog']);
  });

  it('slipper en ukjent verdi gjennom i stedet for å lage et hull i lista', () => {
    expect(habitatDisplay(['barskog', 'kystlynghei'], 'sv')).toEqual(['barrskog', 'kystlynghei']);
  });

  it('tåler store bokstaver og mellomrom fra basen', () => {
    expect(habitatDisplay(['  Barskog ', 'MOSE'], 'sv')).toEqual(['barrskog', 'mossa']);
  });

  it('tåler manglende liste og tomme elementer', () => {
    expect(habitatDisplay(null, 'sv')).toEqual([]);
    expect(habitatDisplay(undefined, 'nb')).toEqual([]);
    expect(habitatDisplay(['', '   ', 'eng'], 'nb')).toEqual(['eng']);
  });
});

describe('oversettelsestabellen', () => {
  it('kjenner hver habitatverdi som står i basen', () => {
    const kjente = new Set(HABITAT_TERMS.map((term) => term.nb));
    expect(HABITAT_I_BASEN.filter((verdi) => !kjente.has(verdi))).toEqual([]);
  });

  it('har en svensk form uten norske bokstaver for hver verdi', () => {
    for (const term of HABITAT_TERMS) {
      expect(term.sv.trim(), term.nb).not.toBe('');
      expect(term.sv, term.nb).not.toMatch(NORSKE_BOKSTAVER);
    }
  });

  it('viser aldri et norsk ord for en verdi som står i basen', () => {
    for (const verdi of HABITAT_I_BASEN) {
      const [vist] = habitatDisplay([verdi], 'sv');
      expect(vist, verdi).not.toMatch(NORSKE_BOKSTAVER);
    }
  });
});

describe('ett habitatvokabular', () => {
  const VAER = { temperatureC: 14, humidityPct: 82, rain3dMm: 8 };

  /** Habitatordet slik prediksjonsforklaringen skriver det til en svensk leser. */
  function forklaringensOrd(habitat: string): string {
    const linjer = buildExplanation({
      weather: VAER,
      species: {
        norwegianName: 'Testsopp',
        latinName: 'Testus testus',
        genus: null,
        seasonStart: 8,
        seasonEnd: 10,
        peakSeasonStart: null,
        peakSeasonEnd: null,
        habitat: [habitat],
        mycorrhizalPartners: null
      },
      month: 9,
      locale: 'sv'
    });
    const linje = linjer.find((l) => l.category === 'habitat')?.text ?? '';
    return linje.slice(linje.indexOf(': ') + 2);
  }

  it('sier aldri et annet svensk ord enn prediksjonsforklaringen', () => {
    // prediction-explanation.ts har sin egen kopi av tabellen, og de to hadde
    // drevet fra hverandre: «sandgrunn» var «sandmark» der og «sandgrund» her.
    // Kopien kan mangle en verdi (da slipper det norske ordet gjennom), men
    // samme habitat skal aldri hete to ting på svensk i samme app.
    for (const term of HABITAT_TERMS) {
      expect([term.sv, term.nb], `${term.nb} → ${forklaringensOrd(term.nb)}`).toContain(forklaringensOrd(term.nb));
    }
  });
});
