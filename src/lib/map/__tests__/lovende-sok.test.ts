import { describe, expect, it } from 'vitest';
import { CONDITION_THRESHOLDS } from '@/lib/utils/prediction';
import {
  LOVENDE_RADIER_KM,
  MIN_SKOGDEKNING,
  NAER_GRENSEN_POENG,
  harSkogdekning,
  nesteRadiusIndex,
  nesteSteg,
  type LovendeSteg,
  type LovendeSvar
} from '../lovende-sok';

const SISTE = LOVENDE_RADIER_KM.length - 1;
const GRENSE = CONDITION_THRESHOLDS.moderate;

/** Et svar uten lovende ruter, med skog i hele rutenettet. */
const tomtMedSkog = (bestScore: number | null, radiusIndex = 0): LovendeSvar => ({
  serverCellsEmpty: true,
  coverage: 1,
  bestScore,
  radiusIndex
});

/**
 * Kjører hele søket slik kartet gjør: ett svar per radius, til det stopper.
 * `svarFor(radiusIndex)` er det serveren ville svart for den radiusen.
 */
function kjorSok(svarFor: (radiusIndex: number) => Omit<LovendeSvar, 'radiusIndex' | 'skogSettFor'>): {
  kall: number[];
  slutt: LovendeSteg;
} {
  const kall: number[] = [];
  let i = 0;
  let skogSett = false;
  for (;;) {
    kall.push(LOVENDE_RADIER_KM[i]);
    const svar = svarFor(i);
    const steg = nesteSteg({ ...svar, radiusIndex: i, skogSettFor: skogSett });
    skogSett = skogSett || harSkogdekning(svar.coverage);
    const neste = nesteRadiusIndex(steg, i);
    if (neste === null) return { kall, slutt: steg };
    i = neste;
  }
}

describe('nesteSteg — utenfor sesong: skogen er her, forholdene er det ikke', () => {
  it('granskog i januar (28 av 100): stopper etter FØRSTE kall og sier at det er forholdene', () => {
    expect(nesteSteg(tomtMedSkog(28))).toBe('stopp_forhold');
    // Hele søket: ett kall, ikke fire.
    expect(kjorSok(() => ({ serverCellsEmpty: true, coverage: 1, bestScore: 28 }))).toEqual({
      kall: [5],
      slutt: 'stopp_forhold'
    });
  });

  it('gjelder også mars (34) og en tørr juni (21) — tallene fra rutenett-ruta', () => {
    expect(nesteSteg(tomtMedSkog(34))).toBe('stopp_forhold');
    expect(nesteSteg(tomtMedSkog(21))).toBe('stopp_forhold');
  });

  it('en art utenfor sesong kollapser scoren — samme svar', () => {
    expect(nesteSteg(tomtMedSkog(3))).toBe('stopp_forhold');
    expect(nesteSteg(tomtMedSkog(0))).toBe('stopp_forhold');
  });

  it('gratisbrukerens 5×5-nett: dekningen er en andel, så grensen er den samme', () => {
    // 7 av 25 ruter med skog = 0,28.
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 7 / 25, bestScore: 28, radiusIndex: 0 })).toBe('stopp_forhold');
    // 6 av 25 = 0,24: for lite til å si «det er skog her».
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 6 / 25, bestScore: 28, radiusIndex: 0 })).toBe('utvid');
  });
});

describe('nesteSteg — skuldersesong: nær grensen kan 35 km gjøre forskjellen', () => {
  it('beste rute like under grensen: rett til den største radiusen', () => {
    expect(nesteSteg(tomtMedSkog(GRENSE - 1))).toBe('hopp_til_siste');
    expect(nesteSteg(tomtMedSkog(GRENSE - NAER_GRENSEN_POENG))).toBe('hopp_til_siste');
    // Ett poeng lenger unna er «langt under».
    expect(nesteSteg(tomtMedSkog(GRENSE - NAER_GRENSEN_POENG - 1))).toBe('stopp_forhold');
  });

  it('høyst to kall: 5 km, så 35 km — og forholdene får skylden hvis det fortsatt er tomt', () => {
    expect(kjorSok(() => ({ serverCellsEmpty: true, coverage: 0.9, bestScore: 46 }))).toEqual({
      kall: [5, 35],
      slutt: 'stopp_forhold'
    });
  });

  it('etter hoppet: lav dekning i den store boksen (halve er fjord) endrer ikke at skogen ble sett', () => {
    const utfall = kjorSok((i) =>
      i === 0
        ? { serverCellsEmpty: true, coverage: 0.8, bestScore: 47 }
        : { serverCellsEmpty: true, coverage: 0.1, bestScore: 44 }
    );
    expect(utfall).toEqual({ kall: [5, 35], slutt: 'stopp_forhold' });
  });
});

describe('nesteSteg — lite skog: utvid, som før', () => {
  it('jorde, by eller sjø: prøv neste radius', () => {
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 0, bestScore: null, radiusIndex: 0 })).toBe('utvid');
    expect(nesteSteg({ serverCellsEmpty: true, coverage: MIN_SKOGDEKNING - 0.01, bestScore: 20, radiusIndex: 1 })).toBe(
      'utvid'
    );
  });

  it('aldri skog innen rekkevidde: alle fire radiene, og meldingen om skog', () => {
    expect(kjorSok(() => ({ serverCellsEmpty: true, coverage: 0.05, bestScore: 30 }))).toEqual({
      kall: [5, 10, 20, 35],
      slutt: 'stopp_ingen_skog'
    });
  });

  it('skogen dukker opp på 10 km, langt under grensen: stopper der', () => {
    const utfall = kjorSok((i) =>
      i === 0 ? { serverCellsEmpty: true, coverage: 0, bestScore: null } : { serverCellsEmpty: true, coverage: 0.6, bestScore: 25 }
    );
    expect(utfall).toEqual({ kall: [5, 10], slutt: 'stopp_forhold' });
  });

  it('grensen for dekning er inklusiv', () => {
    expect(harSkogdekning(MIN_SKOGDEKNING)).toBe(true);
    expect(harSkogdekning(MIN_SKOGDEKNING - 0.001)).toBe(false);
  });
});

describe('nesteSteg — serveren HAR lovende ruter, bare utenfor radiusen', () => {
  it('hjørnerutene ligger utenfor sirkelen: utvid, uansett dekning og score', () => {
    // Avgjørelsen tas på serverens rå liste. Å stoppe her på dekning alene
    // ville fjernet ekte treff som neste radius tar med.
    expect(nesteSteg({ serverCellsEmpty: false, coverage: 1, bestScore: 64, radiusIndex: 0 })).toBe('utvid');
    expect(nesteSteg({ serverCellsEmpty: false, coverage: 0.1, bestScore: 55, radiusIndex: 2 })).toBe('utvid');
  });

  it('går radius for radius, ikke rett til den største', () => {
    const utfall = kjorSok((i) => ({ serverCellsEmpty: false, coverage: 1, bestScore: 60 + i }));
    expect(utfall.kall).toEqual([5, 10, 20, 35]);
  });
});

describe('nesteSteg — siste radius avslutter alltid', () => {
  it('skog i svaret: forholdene', () => {
    expect(nesteSteg(tomtMedSkog(48, SISTE))).toBe('stopp_forhold');
    expect(nesteSteg({ serverCellsEmpty: false, coverage: 0.5, bestScore: 60, radiusIndex: SISTE })).toBe('stopp_forhold');
  });

  it('ingen skog, og heller ikke sett tidligere: skogen', () => {
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 0.1, bestScore: null, radiusIndex: SISTE })).toBe(
      'stopp_ingen_skog'
    );
  });

  it('en indeks utenfor lista behandles som siste — søket kan ikke gå i ring', () => {
    expect(nesteSteg(tomtMedSkog(49, SISTE + 3))).toBe('stopp_forhold');
    expect(nesteRadiusIndex('utvid', SISTE)).toBeNull();
  });
});

describe('nesteSteg — når tallene mangler faller alt tilbake til å utvide', () => {
  it('eldre svar uten bestScore: som før', () => {
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 1, bestScore: undefined, radiusIndex: 0 })).toBe('utvid');
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 1, bestScore: null, radiusIndex: 0 })).toBe('utvid');
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 1, bestScore: Number.NaN, radiusIndex: 0 })).toBe('utvid');
  });

  it('svar uten coverage: som før, og meldingen om skog til slutt', () => {
    expect(kjorSok(() => ({ serverCellsEmpty: true, coverage: undefined, bestScore: 20 }))).toEqual({
      kall: [5, 10, 20, 35],
      slutt: 'stopp_ingen_skog'
    });
  });

  it('skogoppslag som ble avbrutt gir kunstig lav dekning: utvid — den trygge retningen', () => {
    expect(nesteSteg({ serverCellsEmpty: true, coverage: 0.12, bestScore: 31, radiusIndex: 0 })).toBe('utvid');
  });
});

describe('nesteRadiusIndex', () => {
  it('utvid går ett steg, hoppet går til den siste, stopp gir null', () => {
    expect(nesteRadiusIndex('utvid', 0)).toBe(1);
    expect(nesteRadiusIndex('utvid', SISTE - 1)).toBe(SISTE);
    expect(nesteRadiusIndex('hopp_til_siste', 0)).toBe(SISTE);
    expect(nesteRadiusIndex('hopp_til_siste', 2)).toBe(SISTE);
    expect(nesteRadiusIndex('stopp_forhold', 0)).toBeNull();
    expect(nesteRadiusIndex('stopp_ingen_skog', 1)).toBeNull();
  });
});

describe('radiene', () => {
  it('er de fire kartet alltid har brukt, og den største holder seg innenfor rutenett-rutas tak', () => {
    expect([...LOVENDE_RADIER_KM]).toEqual([5, 10, 20, 35]);
    const storst = LOVENDE_RADIER_KM[SISTE];
    // Ruta avviser bokser over 1,5° i bredde eller 3° i lengde.
    expect((2 * storst) / 111).toBeLessThan(1.5);
    expect((2 * storst) / (111 * Math.cos((71 * Math.PI) / 180))).toBeLessThan(3);
  });
});
