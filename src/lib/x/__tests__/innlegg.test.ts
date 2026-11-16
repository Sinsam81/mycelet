import { describe, expect, it } from 'vitest';
import { skalVarsle, VARSEL_MIN_OKNING, VARSEL_MIN_SCORE } from '@/lib/alerts/decision';
import { MAKS_HULL_DAGER, lesRegionHistorikk } from '@/lib/alerts/historikk';
import { REGION_CONDITION_THRESHOLDS } from '@/lib/prediction/region-score';
import { byggOmslagsPost, byggUkesPost, finnOmslag, lesOmslagsgrunnlag, vektetLengde } from '../innlegg';

const OVER = VARSEL_MIN_SCORE + VARSEL_MIN_OKNING; // kvalifiserer alltid
const UNDER = VARSEL_MIN_SCORE - 10;

/** Dag n i testsesongen som ÅÅÅÅ-MM-DD. Dag 0 er 1. august 2026. */
function dato(n: number): string {
  return new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);
}

/** Lagrede dagsscorer for én region: dagnummer → score. */
function scorer(par: Record<number, number>): Map<string, number> {
  return new Map(Object.entries(par).map(([n, score]) => [dato(Number(n)), score]));
}

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

  it('merker omslaget brobygd når «i går» ble hentet over et hull — og bare da', () => {
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
      ]),
      brobygde: new Set(['Oslo'])
    });
    expect(omslag).toEqual([
      { region: 'Bergen', fra: UNDER, til: OVER + 2 },
      { region: 'Oslo', fra: UNDER, til: OVER, brobygd: true }
    ]);
    expect(omslag[0]).not.toHaveProperty('brobygd');
  });
});

describe('lesOmslagsgrunnlag — X-posten leser historikken som e-postvarselet', () => {
  /** Én morgen i X-posteren: lagrede scorer per region → grunnlag → omslag. */
  const omslagPaaDag = (perRegion: Record<string, Map<string, number>>, dag: number) =>
    finnOmslag(lesOmslagsgrunnlag(new Map(Object.entries(perRegion)), dato(dag)));

  it('uten hull: «i går» er gårsdagen, bunnen er ukas laveste, ingenting er brobygd', () => {
    const g = lesOmslagsgrunnlag(new Map([['Oslo', scorer({ 4: 70, 5: 55, 6: 61, 7: 67, 8: 73, 9: 79, 10: 90 })]]), dato(10));
    expect([...g.iDag]).toEqual([['Oslo', 90]]);
    expect([...g.iGar]).toEqual([['Oslo', 79]]);
    expect([...g.lavesteUke]).toEqual([['Oslo', 55]]);
    expect(g.brobygde.size).toBe(0);
  });

  it('én natt uten lagrede scorer: omslaget postes på D, merket brobygd — og ikke en gang til på D+1', () => {
    // ⚠️ REGRESJONSVAKT. X-posteren leste bare raden for nøyaktig datoen før.
    // Uten rad for D−1 fantes ingen «i går» på D, og på D+1 var det «allerede
    // bra» — mens e-posten, som brobygger hullet, gikk ut på D. Kanalene var
    // uenige om et omslag e-posten selv sier publiseres åpent på X.
    const oslo = scorer({ 5: 60, 6: 64, 7: 68, 8: UNDER, 10: OVER });
    expect(omslagPaaDag({ Oslo: oslo }, 10)).toEqual([{ region: 'Oslo', fra: 60, til: OVER, brobygd: true }]);
    oslo.set(dato(11), OVER + 2);
    expect(omslagPaaDag({ Oslo: oslo }, 11)).toEqual([]);
  });

  it(`brobygger høyst ${MAKS_HULL_DAGER} umålte dager — et lengre hull er manglende data`, () => {
    expect(omslagPaaDag({ Oslo: scorer({ 7: UNDER, 10: OVER }) }, 10)).toEqual([
      { region: 'Oslo', fra: UNDER, til: OVER, brobygd: true }
    ]);
    expect(omslagPaaDag({ Oslo: scorer({ 6: UNDER, 10: OVER }) }, 10)).toEqual([]);
  });

  it('over på begge sider av hullet er ikke et omslag — den umålte dagen gjettes ikke', () => {
    expect(omslagPaaDag({ Oslo: scorer({ 7: UNDER, 8: OVER, 10: OVER + 3 }) }, 10)).toEqual([]);
  });

  it('hullet gjelder regionen det står i: en nabo med målt gårsdag er ikke brobygd, og uten dagens tall vurderes ingenting', () => {
    const perRegion = new Map([
      ['Oslo', scorer({ 8: UNDER, 10: OVER })], // mangler dag 9
      ['Bergen', scorer({ 8: UNDER, 9: UNDER, 10: OVER + 2 })], // hel
      ['Trondheim', scorer({ 8: UNDER, 9: OVER })] // mangler i dag
    ]);
    const g = lesOmslagsgrunnlag(perRegion, dato(10));
    expect([...g.brobygde]).toEqual(['Oslo']);
    expect([...g.iDag.keys()].sort()).toEqual(['Bergen', 'Oslo']);
    expect(finnOmslag(g)).toEqual([
      { region: 'Bergen', fra: UNDER, til: OVER + 2 },
      { region: 'Oslo', fra: UNDER, til: OVER, brobygd: true }
    ]);
  });

  describe('slår ut de samme morgenene som e-postvarselet — hull eller ikke', () => {
    // 60 dager med sagtann, samme sesong som i historikk.test.ts: terskelen
    // krysses på dag 5 i hver tolvdagerssyklus.
    const sagtann = Array.from({ length: 60 }, (_, d) => {
      const syklus = d % 12;
      return syklus < 8 ? 55 + syklus * 6 : 95 - (syklus - 8) * 14;
    });

    /** Morgenene e-postvarselet går ut: lagrede scorer → lesRegionHistorikk → skalVarsle. */
    function epostDager(hull: number[]): number[] {
      const maalt = new Map<string, number>();
      let sist: string | null = null;
      const sendt: number[] = [];
      for (let d = 0; d < sagtann.length; d += 1) {
        if (hull.includes(d)) continue;
        maalt.set(dato(d), sagtann[d]);
        const h = lesRegionHistorikk(maalt, dato(d));
        const naa = new Date(`${dato(d)}T05:00:00Z`);
        const beslutning = skalVarsle({
          scoreIDag: sagtann[d],
          scoreIGar: h.scoreIGar,
          lavesteSisteUke: h.lavesteSisteUke ?? sagtann[d],
          sistVarsletIso: sist,
          naa,
          sisteOmslagIso: h.sisteOmslagIso
        });
        if (beslutning.send) {
          sendt.push(d);
          sist = naa.toISOString();
        }
      }
      return sendt;
    }

    /** Morgenene X-posteren finner et omslag, med de samme lagrede scorene. */
    function xDager(hull: number[]): number[] {
      const maalt = new Map<string, number>();
      const postet: number[] = [];
      for (let d = 0; d < sagtann.length; d += 1) {
        if (hull.includes(d)) continue;
        maalt.set(dato(d), sagtann[d]);
        if (finnOmslag(lesOmslagsgrunnlag(new Map([['Oslo', maalt]]), dato(d))).length > 0) postet.push(d);
      }
      return postet;
    }

    it('uten hull: omslagsdagen i hver syklus', () => {
      expect(xDager([])).toEqual([5, 17, 29, 41, 53]);
      expect(xDager([])).toEqual(epostDager([]));
    });

    it('én natt uten scorer — hvilken som helst: samme morgener som e-posten, og aldri en ekstra post', () => {
      for (let h = 0; h < sagtann.length; h += 1) {
        expect(xDager([h]), `hull på dag ${h}`).toEqual(epostDager([h]));
        expect(xDager([h]), `hull på dag ${h}`).toHaveLength(5);
      }
    });

    it('to netter på rad uten scorer: fortsatt samme morgener som e-posten', () => {
      for (let h = 0; h < sagtann.length - 1; h += 1) {
        expect(xDager([h, h + 1]), `hull på dag ${h}–${h + 1}`).toEqual(epostDager([h, h + 1]));
      }
    });

    it('tre netter på rad over et omslag: begge kanalene tier om den syklusen', () => {
      expect(xDager([4, 5, 6])).toEqual([17, 29, 41, 53]);
      expect(epostDager([4, 5, 6])).toEqual([17, 29, 41, 53]);
    });
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

  it('brobygd omslag: posten sier at varselet slo ut, men ikke «i natt»', () => {
    // Over en natt uten måling vet vi AT det snudde, ikke hvilken natt.
    const vanlig = byggOmslagsPost([{ region: 'Oslo', fra: 62, til: 88 }])!;
    expect(vanlig).toContain('Soppvarselet slo ut i natt: forholdene i Oslo snudde — fra 62 til 88 av 100 siste uka.');
    const brobygd = byggOmslagsPost([{ region: 'Oslo', fra: 62, til: 88, brobygd: true }])!;
    expect(brobygd).toContain('Soppvarselet slo ut: forholdene i Oslo snudde — fra 62 til 88 av 100 siste uka.');
    expect(brobygd).not.toContain('i natt');
    // Bare de to ordene er borte: tallene, forbeholdet og fasitløftet står.
    expect(brobygd).toBe(vanlig.replace(' i natt', ''));
  });

  it('flere regioner: ett brobygd omslag er nok til at hele posten tier om «i natt»', () => {
    const omslag = [
      { region: 'Oslo', fra: 60, til: 88 },
      { region: 'Bergen', fra: 61, til: 87 },
      { region: 'Trondheim', fra: 62, til: 86 },
      // Navngis ikke — den er «og 1 til» — men påstanden gjelder den også.
      { region: 'Innlandet', fra: 63, til: 85, brobygd: true }
    ];
    expect(byggOmslagsPost(omslag.slice(0, 3))).toContain(
      'Soppvarselet slo ut i natt: Oslo (60→88 av 100), Bergen (61→87) og Trondheim (62→86).'
    );
    const tekst = byggOmslagsPost(omslag)!;
    expect(tekst).toContain('Soppvarselet slo ut: Oslo (60→88 av 100), Bergen (61→87) og Trondheim (62→86), og 1 til.');
    expect(tekst).not.toContain('i natt');
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
