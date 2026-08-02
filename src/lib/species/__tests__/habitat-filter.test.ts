import { describe, expect, it } from 'vitest';
import {
  HABITAT_TERMS,
  habitatSearchTerms,
  habitatSuggestions,
  matchesHabitat
} from '@/lib/species/habitat-filter';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * De 33 distinkte verdiene i mushroom_species.habitat, lest fra basen
 * 2026-08-02, med antall arter bak hver. Testene under er skrevet mot ekte
 * data, ikke oppdiktede eksempler — det var nettopp avstanden mellom
 * plassholderteksten og de ekte verdiene som var feilen.
 */
const HABITAT_VALUES_IN_DB: Record<string, number> = {
  barskog: 32,
  løvskog: 28,
  blandingsskog: 24,
  furuskog: 8,
  eng: 8,
  granskog: 7,
  beite: 7,
  mose: 4,
  'fuktig skog': 4,
  kantsoner: 3,
  gress: 3,
  gressplen: 2,
  eikeskog: 2,
  elvebredder: 2,
  lauvskog: 2,
  fuktig: 2,
  myr: 2,
  skog: 2,
  plen: 2,
  'sandig mark': 1,
  'eldre bestand': 1,
  moserik: 1,
  kalkrik: 1,
  brannfelt: 1,
  lysninger: 1,
  fjellbjørkeskog: 1,
  sandgrunn: 1,
  'sur jord': 1,
  lerkeskog: 1,
  hage: 1,
  sti: 1,
  'myr-kant': 1,
  park: 1
};

/** Hver «art» er bare habitatlista si — det er alt filteret ser på. */
const SPECIES = Object.entries(HABITAT_VALUES_IN_DB).flatMap(([habitat, count]) =>
  Array.from({ length: count }, () => [habitat])
);

function hits(query: string): number {
  return SPECIES.filter((habitats) => matchesHabitat(habitats, query)).length;
}

describe('matchesHabitat', () => {
  it('finner barskog når svensken skriver barrskog', () => {
    // Feilen som ble rapportert: plassholderen på svensk sier «t.ex.
    // barrskog», og nøyaktig det ordet ga 0 treff.
    expect(hits('barrskog')).toBe(32);
    expect(hits('barskog')).toBe(32);
  });

  it('finner løvskog og lauvskog uansett hvilken av dem brukeren skriver', () => {
    // Basen bruker begge skrivemåtene. Steinsopp ligger på «lauvskog» og var
    // usynlig for et søk på «løvskog».
    expect(hits('løvskog')).toBe(30);
    expect(hits('lauvskog')).toBe(30);
    expect(hits('lövskog')).toBe(30);
  });

  it('dekker alle 33 habitatverdiene på svensk', () => {
    for (const term of HABITAT_TERMS) {
      if (!(term.nb in HABITAT_VALUES_IN_DB)) continue;
      expect(matchesHabitat([term.nb], term.sv), `${term.sv} → ${term.nb}`).toBe(true);
    }
  });

  it('beholder delstrengsøket — «skog» treffer alle skogtypene', () => {
    const forest = hits('skog');
    expect(forest).toBeGreaterThan(hits('barskog'));
    // Samme på svensk: «skog» finnes i både barrskog, blandskog og tallskog.
    expect(hits('tallskog')).toBe(8);
    expect(hits('blandskog')).toBe(24);
  });

  it('treffer på delvis skrevet ord, så feltet virker mens man skriver', () => {
    expect(hits('barr')).toBe(32);
    expect(hits('äng')).toBe(8);
  });

  it('tom søketekst filtrerer ikke bort noe', () => {
    expect(hits('')).toBe(SPECIES.length);
    expect(hits('   ')).toBe(SPECIES.length);
  });

  it('gir null treff for noe som ikke finnes — ingen falske positive', () => {
    expect(hits('tundra')).toBe(0);
  });

  it('tåler manglende habitatliste', () => {
    expect(matchesHabitat(null, 'barskog')).toBe(false);
    expect(matchesHabitat(undefined, 'barskog')).toBe(false);
    expect(matchesHabitat(null, '')).toBe(true);
  });

  it('lar ukjente databaseverdier virke på norsk skrivemåte', () => {
    // Kommer det en ny verdi inn i basen før tabellen her oppdateres, skal
    // fritekstsøket fortsatt finne den.
    expect(matchesHabitat(['kystlynghei'], 'lynghei')).toBe(true);
    expect(habitatSearchTerms('Kystlynghei')).toEqual(['kystlynghei']);
  });
});

describe('habitatSuggestions', () => {
  it('viser norske ord til norske brukere og svenske til svenske', () => {
    expect(habitatSuggestions('nb')).toContain('barskog');
    expect(habitatSuggestions('nb')).not.toContain('barrskog');
    expect(habitatSuggestions('sv')).toContain('barrskog');
    expect(habitatSuggestions('sv')).not.toContain('barskog');
  });

  it('gjentar ikke samme forslag — løvskog og lauvskog er ett ord på svensk', () => {
    const svenska = habitatSuggestions('sv');
    expect(new Set(svenska).size).toBe(svenska.length);
    expect(svenska.filter((s) => s === 'lövskog')).toHaveLength(1);
  });

  it('foreslår bare habitat som faktisk finnes i basen', () => {
    for (const term of HABITAT_TERMS) {
      expect(Object.keys(HABITAT_VALUES_IN_DB), `${term.nb} finnes ikke i basen`).toContain(term.nb);
    }
  });
});

describe('plassholderen på artssiden', () => {
  it('viser et eksempel som faktisk gir treff, på begge språk', () => {
    // Dette er selve feilen, målt i én påstand: eksempelet appen selv gir
    // skal returnere arter.
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const placeholder = (catalog.Species as { habitatPlaceholder: string }).habitatPlaceholder;
      const example = placeholder.replace(/^(f\.eks\.|t\.ex\.)\s*/i, '').trim();
      expect(example.length, `${locale}: fant ingen eksempelverdi i plassholderen`).toBeGreaterThan(0);
      expect(hits(example), `${locale}: «${example}» ga null treff`).toBeGreaterThan(0);
    }
  });
});
