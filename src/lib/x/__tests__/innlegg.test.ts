import { describe, expect, it } from 'vitest';
import { VARSEL_MIN_OKNING, VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { REGION_CONDITION_THRESHOLDS } from '@/lib/prediction/region-score';
import { byggOmslagsPost, byggUkesPost, finnOmslag, vektetLengde } from '../innlegg';

const OVER = VARSEL_MIN_SCORE + VARSEL_MIN_OKNING; // kvalifiserer alltid
const UNDER = VARSEL_MIN_SCORE - 10;

describe('finnOmslag', () => {
  it('finner flanken under→over med reell økning', () => {
    const omslag = finnOmslag({
      iDag: new Map([['Oslo', OVER]]),
      iGar: new Map([['Oslo', UNDER]]),
      lavesteUke: new Map([['Oslo', UNDER]])
    });
    expect(omslag).toEqual([{ region: 'Oslo', fra: UNDER, til: OVER }]);
  });

  it('tier uten gårsdag — samme regel som decision.ts', () => {
    const omslag = finnOmslag({
      iDag: new Map([['Oslo', OVER]]),
      iGar: new Map(),
      lavesteUke: new Map([['Oslo', UNDER]])
    });
    expect(omslag).toEqual([]);
  });

  it('tier når det var bra allerede i går', () => {
    const omslag = finnOmslag({
      iDag: new Map([['Oslo', OVER]]),
      iGar: new Map([['Oslo', VARSEL_MIN_SCORE]]),
      lavesteUke: new Map([['Oslo', UNDER]])
    });
    expect(omslag).toEqual([]);
  });

  it('tier når økningen mot ukas bunn er for liten', () => {
    const omslag = finnOmslag({
      iDag: new Map([['Oslo', VARSEL_MIN_SCORE]]),
      iGar: new Map([['Oslo', VARSEL_MIN_SCORE - 1]]),
      lavesteUke: new Map([['Oslo', VARSEL_MIN_SCORE - VARSEL_MIN_OKNING + 1]])
    });
    expect(omslag).toEqual([]);
  });

  it('sorterer beste region først', () => {
    const omslag = finnOmslag({
      iDag: new Map([
        ['Oslo', OVER],
        ['Bergen', OVER + 2]
      ]),
      iGar: new Map([
        ['Oslo', UNDER],
        ['Bergen', UNDER]
      ]),
      lavesteUke: new Map([
        ['Oslo', UNDER],
        ['Bergen', UNDER]
      ])
    });
    expect(omslag.map((o) => o.region)).toEqual(['Bergen', 'Oslo']);
  });
});

describe('byggOmslagsPost', () => {
  it('null uten omslag', () => {
    expect(byggOmslagsPost([])).toBeNull();
  });

  it('én region: full setning med fra/til og forbehold', () => {
    const tekst = byggOmslagsPost([{ region: 'Oslo', fra: 62, til: 88 }]);
    expect(tekst).toContain('Oslo');
    expect(tekst).toContain('fra 62 til 88 av 100');
    expect(tekst).toContain('ikke en lovnad');
    expect(vektetLengde(tekst!)).toBeLessThanOrEqual(280);
  });

  it('mange regioner: maks tre navngis, resten telles', () => {
    const omslag = ['Oslo', 'Bergen', 'Trondheim', 'Innlandet', 'Kristiansand'].map((region) => ({
      region,
      fra: 60,
      til: 88
    }));
    const tekst = byggOmslagsPost(omslag)!;
    expect(tekst).toContain('og 2 til');
    expect(tekst).not.toContain('Kristiansand');
    expect(vektetLengde(tekst)).toBeLessThanOrEqual(280);
  });

  it('slipper aldri et år-mot-år-tall fra registreringsdata ut i posten', () => {
    // Rapportpulsen ble trukket 17. september 2026: sammenligningen var
    // misvisende. Funksjonen tar ikke lenger imot noen ekstra linje.
    expect(byggOmslagsPost.length).toBe(1);
    const tekst = byggOmslagsPost([{ region: 'Oslo', fra: 62, til: 88 }])!;
    expect(tekst).not.toMatch(/over vanlig|under vanlig|Artsobservasjoner|GBIF/);
  });

  it('inneholder aldri en URL — det ville 13-doblet prisen per post', () => {
    const tekst = byggOmslagsPost([{ region: 'Oslo', fra: 62, til: 88 }])!;
    expect(tekst).not.toMatch(/https?:\/\//);
    expect(tekst).not.toMatch(/\w\.(com|no|se)\b/);
  });
});

describe('byggUkesPost', () => {
  const topp = [
    { region: 'Trondheim', score: 91 },
    { region: 'Oslo', score: 88 },
    { region: 'Göteborg', score: 86 }
  ];

  it('null uten regioner', () => {
    expect(byggUkesPost([], null)).toBeNull();
  });

  describe('ingenting verdt å si → ingen post', () => {
    const TERSKEL = REGION_CONDITION_THRESHOLDS.moderate;
    const fasit = { region: 'Oslo', dato: '2026-08-18', ukenEtter: 214, ukenFor: 87 };

    it('null når beste område er under regionstigens «moderate» — vintersøndagene', () => {
      const vinter = [
        { region: 'Bergen', score: 4 },
        { region: 'Stavanger', score: 3 },
        { region: 'Kristiansand', score: 3 }
      ];
      expect(byggUkesPost(vinter, null)).toBeNull();
      expect(byggUkesPost([{ region: 'Bergen', score: TERSKEL - 1 }], null)).toBeNull();
    });

    it('en fasit alene bærer ikke posten', () => {
      expect(byggUkesPost([{ region: 'Bergen', score: TERSKEL - 1 }], fasit)).toBeNull();
    });

    it('poster når beste område er nøyaktig på terskelen', () => {
      expect(byggUkesPost([{ region: 'Bergen', score: TERSKEL }], null)).toContain(`Bergen (${TERSKEL} av 100)`);
    });

    it('ser på høyeste tall, ikke på rekkefølgen kalleren sendte', () => {
      const usortert = [
        { region: 'Oslo', score: 20 },
        { region: 'Bergen', score: TERSKEL + 5 }
      ];
      expect(byggUkesPost(usortert, null)).not.toBeNull();
    });
  });

  it('lister toppregionene med score', () => {
    const tekst = byggUkesPost(topp, null)!;
    expect(tekst).toContain('Trondheim (91 av 100)');
    expect(tekst).toContain('Oslo (88)');
    expect(tekst).toContain('Göteborg (86)');
    expect(vektetLengde(tekst)).toBeLessThanOrEqual(280);
  });

  it('bærer fasiten når den finnes', () => {
    const tekst = byggUkesPost(topp, { region: 'Oslo', dato: '2026-08-18', ukenEtter: 214, ukenFor: 87 })!;
    expect(tekst).toContain('Fasit for varselet i Oslo 18. august');
    expect(tekst).toContain('214 funn uken etter, mot 87 uken før');
    expect(vektetLengde(tekst)).toBeLessThanOrEqual(280);
  });

  it('kutter forklaringen — ikke fasiten — når begge ikke får plass', () => {
    const lang = [
      { region: 'Kristiansand og omegn med veldig langt navn', score: 91 },
      { region: 'Enda et usannsynlig langt regionnavn her', score: 88 },
      { region: 'Tredje region med svært mange tegn i seg', score: 86 }
    ];
    const tekst = byggUkesPost(lang, { region: 'Oslo', dato: '2026-08-18', ukenEtter: 214, ukenFor: 87 })!;
    expect(vektetLengde(tekst)).toBeLessThanOrEqual(280);
    expect(tekst).toContain('Fasit');
  });
});

describe('vektetLengde', () => {
  it('teller latin og norske tegn som 1', () => {
    expect(vektetLengde('blåbær')).toBe(6);
  });

  it('teller emoji og piler som 2 — slik X gjør', () => {
    expect(vektetLengde('🍄')).toBe(2);
    expect(vektetLengde('→')).toBe(2);
  });
});
