import { describe, expect, it } from 'vitest';
import {
  SUBSTRAT_SV,
  VERTSTRE_NB,
  VERTSTRE_SV,
  substratVisning,
  vertstreListe,
  vertstreNavn
} from '../vertstraer';
import { buildExplanation } from '@/lib/utils/prediction-explanation';
import { buildWhatToLookFor } from '@/lib/prediction/what-to-look-for';

/**
 * De ti distinkte verdiene i mushroom_species.mycorrhizal_partners og de ni i
 * .substrate, lest fra produksjon 10. november 2026 med antall arter bak hver.
 * 22 arter har ingen vertstrær (vedboere og engsopper).
 */
const VERTSTRAER_I_BASEN: Record<string, number> = {
  gran: 32,
  furu: 25,
  bjørk: 22,
  eik: 16,
  bøk: 10,
  osp: 5,
  ask: 1,
  alm: 1,
  lerk: 1,
  lind: 1
};

const SUBSTRAT_I_BASEN: Record<string, number> = {
  jord: 66,
  'død ved': 6,
  'jord eller mose': 2,
  'død ved eller jord': 1,
  'død ved (stubber)': 1,
  'ved rot/stubbe': 1,
  'jord/strø': 1,
  'jord og mosebunn — mykorrhiza med gran og furu, helst på næringsfattig, sur mark': 1,
  'morken barved — stubber, røtter og liggende stammer og greiner av gran og furu': 1
};

/** Bokstaver som finnes i norsk, men ikke i svensk rettskriving. */
const NORSKE_BOKSTAVER = /[æø]/i;

describe('vertstrærne på leserens språk', () => {
  it('har et svensk navn for hvert tre som står i basen', () => {
    for (const tre of Object.keys(VERTSTRAER_I_BASEN)) {
      expect(vertstreNavn(tre, 'sv'), tre).toBeTruthy();
    }
  });

  it('skriver ingen norske bokstaver i de svenske navnene', () => {
    for (const [nb, sv] of Object.entries(VERTSTRE_SV)) {
      expect(sv, nb).not.toMatch(NORSKE_BOKSTAVER);
      expect(sv.trim(), nb).not.toBe('');
    }
  });

  it('oversetter kantarellens vertstrær i basens rekkefølge', () => {
    const kantarell = ['gran', 'furu', 'bjørk', 'eik'];
    expect(vertstreListe(kantarell, 'sv')).toEqual(['gran', 'tall', 'björk', 'ek']);
    expect(vertstreListe(kantarell, 'nb')).toEqual(kantarell);
  });

  it('retter skrivemåter uten æøå på norsk', () => {
    expect(vertstreListe(['bjork', 'bok'], 'nb')).toEqual(['bjørk', 'bøk']);
  });

  it('gjentar ikke samme tre når basen har to skrivemåter', () => {
    expect(vertstreListe(['bjørk', 'bjork'], 'sv')).toEqual(['björk']);
    expect(vertstreListe(['bjørk', 'bjork'], 'nb')).toEqual(['bjørk']);
  });

  it('viser ikke et ukjent tre på svensk, men beholder resten av lista', () => {
    // I faktalista ville et norsk ord under en svensk etikett sett ut som en feil.
    expect(vertstreListe(['gran', 'kristtorn'], 'sv')).toEqual(['gran']);
    expect(vertstreListe(['kristtorn'], 'sv')).toEqual([]);
    // På norsk ER ordet allerede på leserens språk.
    expect(vertstreListe(['gran', 'kristtorn'], 'nb')).toEqual(['gran', 'kristtorn']);
  });

  it('tåler en kolonne som er null, ikke en liste, eller har tomme elementer', () => {
    expect(vertstreListe(null, 'nb')).toEqual([]);
    expect(vertstreListe(undefined, 'sv')).toEqual([]);
    expect(vertstreListe('gran', 'nb')).toEqual([]);
    expect(vertstreListe(['  Gran  ', '', '   ', null, 7], 'sv')).toEqual(['gran']);
  });
});

describe('substratet på leserens språk', () => {
  it('viser teksten fra basen ordrett på norsk', () => {
    for (const substrat of Object.keys(SUBSTRAT_I_BASEN)) {
      expect(substratVisning(substrat, 'nb')).toBe(substrat);
    }
  });

  it('har en svensk form for de sju korte verdiene', () => {
    expect(substratVisning('jord', 'sv')).toBe('jord');
    expect(substratVisning('død ved', 'sv')).toBe('död ved');
    expect(substratVisning('jord eller mose', 'sv')).toBe('jord eller mossa');
    expect(substratVisning('ved rot/stubbe', 'sv')).toBe('rötter och stubbar');
    expect(substratVisning('jord/strø', 'sv')).toBe('jord och förna');
    const korte = Object.keys(SUBSTRAT_I_BASEN).filter((s) => s.length < 30);
    expect(korte).toHaveLength(7);
    for (const substrat of korte) {
      expect(substratVisning(substrat, 'sv'), substrat).toBeTruthy();
    }
  });

  it('viser ikke en hel norsk setning under en svensk etikett', () => {
    // Brunkjøttbukkesopp og krittøsterssopp har prosa i kolonnen.
    const lange = Object.keys(SUBSTRAT_I_BASEN).filter((s) => s.length >= 30);
    expect(lange).toHaveLength(2);
    for (const substrat of lange) {
      expect(substratVisning(substrat, 'sv')).toBeNull();
    }
  });

  it('skriver ingen norske bokstaver i de svenske formene', () => {
    for (const [nb, sv] of Object.entries(SUBSTRAT_SV)) {
      expect(sv, nb).not.toMatch(NORSKE_BOKSTAVER);
    }
  });

  it('gir ingen rad for tom eller manglende verdi', () => {
    expect(substratVisning(null, 'nb')).toBeNull();
    expect(substratVisning('   ', 'nb')).toBeNull();
    expect(substratVisning(undefined, 'sv')).toBeNull();
    expect(substratVisning(42, 'nb')).toBeNull();
  });
});

describe('én tretabell', () => {
  const VAER = { temperatureC: 14, humidityPct: 82, rain3dMm: 8 };

  /** Treet slik prediksjonsforklaringen skriver det til en svensk leser. */
  function forklaringensNavn(tre: string): string {
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
        habitat: null,
        mycorrhizalPartners: [tre]
      },
      month: 9,
      locale: 'sv'
    });
    const linje = linjer.find((l) => l.category === 'mycorrhizal')?.text ?? '';
    return linje.split(' ').pop() ?? '';
  }

  it('sier aldri et annet svensk navn enn prediksjonsforklaringen', () => {
    // prediction-explanation.ts har sin egen kopi av tabellen. Den kan mangle
    // et tre (da slipper det norske ordet gjennom), men den skal aldri kalle
    // samme tre noe annet enn vi gjør her.
    for (const [nb, sv] of Object.entries(VERTSTRE_SV)) {
      expect([sv, nb], `${nb} → ${forklaringensNavn(nb)}`).toContain(forklaringensNavn(nb));
    }
  });

  it('er den samme tabellen «se etter»-linja bruker', () => {
    for (const [nb, sv] of Object.entries(VERTSTRE_SV)) {
      const linje = buildWhatToLookFor({ norwegian_name: 'Testsopp', mycorrhizal_partners: [nb] }, 'sv');
      expect(linje, nb).toBe(`Testsopp lever i symbios med ${sv}.`);
    }
    for (const [skrevet, rettet] of Object.entries(VERTSTRE_NB)) {
      const linje = buildWhatToLookFor({ norwegian_name: 'Testsopp', mycorrhizal_partners: [skrevet] }, 'nb');
      expect(linje, skrevet).toBe(`Testsopp står i symbiose med ${rettet}.`);
    }
  });
});
