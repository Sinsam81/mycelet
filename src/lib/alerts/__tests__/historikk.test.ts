import { describe, expect, it } from 'vitest';
import { skalVarsle, VARSEL_KARANTENE_DAGER, VARSEL_MIN_OKNING, VARSEL_MIN_SCORE } from '../decision';
import { HISTORIKK_DAGER, MAKS_HULL_DAGER, forrigeMaalteDag, lesRegionHistorikk, sisteOmslag } from '../historikk';

/**
 * Én natt uten fliser skal ikke svelge et helt omslag.
 *
 * Feilen var summen av to fornuftige regler: uten gårsdagens rad svarte
 * skalVarsle «ingen-gaardag» på omslagsdagen, og dagen etter «var-allerede-bra»
 * — fordi omslaget (D−2 → D) ikke var to NABOdager og derfor ikke fantes. Ingen
 * i regionen fikk varselet for den oppturen.
 *
 * Testene her kjører derfor hele veien: lagrede dagsscorer med hull →
 * lesRegionHistorikk → skalVarsle. Og de er skrevet like mye mot det motsatte:
 * brobyggingen skal aldri gi FLERE e-poster enn en sesong uten hull.
 */

const UNDER = VARSEL_MIN_SCORE - 11;
const OVER = VARSEL_MIN_SCORE + 9;

/** Dag n i testsesongen som ÅÅÅÅ-MM-DD. Dag 0 er 1. august 2026. */
function dato(n: number): string {
  return new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);
}

/** Cronen kjører kl. 05 UTC. */
function morgen(n: number): Date {
  return new Date(`${dato(n)}T05:00:00Z`);
}

function scorer(par: Record<number, number>): Map<string, number> {
  return new Map(Object.entries(par).map(([n, score]) => [dato(Number(n)), score]));
}

describe('forrigeMaalteDag', () => {
  it('gårsdagen når den finnes', () => {
    expect(forrigeMaalteDag(scorer({ 8: 70, 9: 75, 10: 90 }), dato(10))).toEqual({ dato: dato(9), score: 75, hullDager: 0 });
  });

  it('nyeste målte dag når gårsdagen mangler — én eller to umålte dager brobygges', () => {
    expect(forrigeMaalteDag(scorer({ 7: 60, 8: 70, 10: 90 }), dato(10))).toEqual({ dato: dato(8), score: 70, hullDager: 1 });
    expect(forrigeMaalteDag(scorer({ 6: 50, 7: 60, 10: 90 }), dato(10))).toEqual({ dato: dato(7), score: 60, hullDager: 2 });
  });

  it('tre umålte dager er manglende data, ikke «i går»', () => {
    expect(MAKS_HULL_DAGER).toBe(2);
    expect(forrigeMaalteDag(scorer({ 6: 50, 10: 90 }), dato(10))).toBeNull();
    expect(forrigeMaalteDag(scorer({ 10: 90 }), dato(10))).toBeNull();
    expect(forrigeMaalteDag(new Map(), dato(10))).toBeNull();
  });

  it('leser aldri dagens egen rad eller rader etter den', () => {
    expect(forrigeMaalteDag(scorer({ 9: 75, 10: 90, 11: 20 }), dato(10))?.dato).toBe(dato(9));
    expect(forrigeMaalteDag(scorer({ 10: 90, 11: 20 }), dato(10))).toBeNull();
  });

  it('regner dager over måneds- og årsskifter, og tåler rare nøkler', () => {
    const rundtNyttar = new Map([
      ['2026-12-30', 40],
      ['2026-12-31', 45]
    ]);
    expect(forrigeMaalteDag(rundtNyttar, '2027-01-01')).toEqual({ dato: '2026-12-31', score: 45, hullDager: 0 });
    expect(forrigeMaalteDag(new Map([['2026-12-30', 40]]), '2027-01-01')?.hullDager).toBe(1);
    expect(forrigeMaalteDag(new Map([['2027-02-28', 40]]), '2027-03-01')?.hullDager).toBe(0);
    expect(forrigeMaalteDag(new Map([['ikke-en-dato', 99]]), '2027-01-01')).toBeNull();
  });

  it('hulltoleransen kan strammes til null: da gjelder bare gårsdagen', () => {
    expect(forrigeMaalteDag(scorer({ 8: 70, 10: 90 }), dato(10), 0)).toBeNull();
    expect(forrigeMaalteDag(scorer({ 9: 70, 10: 90 }), dato(10), 0)?.score).toBe(70);
  });
});

describe('sisteOmslag', () => {
  it('to nabodager, under så over: datoen er dagen som var over', () => {
    expect(sisteOmslag(scorer({ 4: UNDER, 5: OVER, 6: OVER }))).toBe(dato(5));
  });

  it('nøyaktig på terskelen er over; ett poeng under er under', () => {
    expect(sisteOmslag(scorer({ 4: VARSEL_MIN_SCORE - 1, 5: VARSEL_MIN_SCORE }))).toBe(dato(5));
    expect(sisteOmslag(scorer({ 4: VARSEL_MIN_SCORE, 5: VARSEL_MIN_SCORE + 5 }))).toBeNull();
  });

  it('et omslag over én eller to umålte dager er fortsatt et omslag', () => {
    // Under på D−2 og over på D er en kryssing et sted i det vinduet.
    expect(sisteOmslag(scorer({ 3: UNDER, 5: OVER }))).toBe(dato(5));
    expect(sisteOmslag(scorer({ 2: UNDER, 5: OVER }))).toBe(dato(5));
  });

  it('over tre umålte dager er det manglende data, ikke et omslag', () => {
    expect(sisteOmslag(scorer({ 1: UNDER, 5: OVER }))).toBeNull();
  });

  it('over→over på hver side av et hull er IKKE et omslag — vi gjetter ikke på den umålte dagen', () => {
    expect(sisteOmslag(scorer({ 3: OVER, 5: OVER }))).toBeNull();
    expect(sisteOmslag(scorer({ 3: OVER, 5: UNDER }))).toBeNull();
    expect(sisteOmslag(scorer({ 3: UNDER, 5: UNDER }))).toBeNull();
  });

  it('det SISTE omslaget vinner når vinduet har flere', () => {
    expect(sisteOmslag(scorer({ 1: UNDER, 2: OVER, 3: UNDER, 4: OVER, 5: OVER }))).toBe(dato(4));
  });

  it('terskelen og hulltoleransen kan sendes inn', () => {
    expect(sisteOmslag(scorer({ 4: 40, 5: 60 }), 50)).toBe(dato(5));
    expect(sisteOmslag(scorer({ 3: UNDER, 5: OVER }), VARSEL_MIN_SCORE, 0)).toBeNull();
    expect(sisteOmslag(new Map())).toBeNull();
  });
});

describe('lesRegionHistorikk', () => {
  it('ukas bunn er laveste målte dag i vinduet, i dag medregnet', () => {
    const lest = lesRegionHistorikk(scorer({ 4: 70, 5: 55, 6: 61, 7: 67, 8: 73, 9: 79, 10: 85 }), dato(10));
    expect(lest).toEqual({ scoreIGar: 79, hullDager: 0, lavesteSisteUke: 55, sisteOmslagIso: dato(10) });
    expect(lesRegionHistorikk(scorer({ 9: 90, 10: 40 }), dato(10)).lavesteSisteUke).toBe(40);
  });

  it(`leser bare de ${HISTORIKK_DAGER} siste datoene — eldre rader og rader etter i dag teller ikke`, () => {
    expect(HISTORIKK_DAGER).toBe(7);
    // Dag 3 er åtte datoer tilbake fra dag 10 og ligger utenfor; dag 11 er i morgen.
    const lest = lesRegionHistorikk(scorer({ 2: UNDER, 3: 10, 4: OVER, 9: OVER, 10: OVER, 11: 5 }), dato(10));
    expect(lest.lavesteSisteUke).toBe(OVER);
    // Omslaget dag 3 → 4 ligger på vinduskanten: dag 3 er ute, så det finnes ikke.
    expect(lest.sisteOmslagIso).toBeNull();
  });

  it('tom historikk gir null overalt — da tier skalVarsle', () => {
    expect(lesRegionHistorikk(new Map(), dato(10))).toEqual({
      scoreIGar: null,
      hullDager: 0,
      lavesteSisteUke: null,
      sisteOmslagIso: null
    });
  });

  it('melder fra hvor mange dager «i går» ble hentet over', () => {
    expect(lesRegionHistorikk(scorer({ 8: UNDER, 10: OVER }), dato(10)).hullDager).toBe(1);
    expect(lesRegionHistorikk(scorer({ 7: UNDER, 10: OVER }), dato(10)).hullDager).toBe(2);
  });
});

/** Én morgen: lagrede scorer → historikk → beslutning. */
function vurder(maalt: Map<string, number>, dag: number, sistVarsletIso: string | null = null) {
  const iDag = maalt.get(dato(dag));
  if (iDag === undefined) throw new Error(`testen mangler dagens score for dag ${dag}`);
  const h = lesRegionHistorikk(maalt, dato(dag));
  return skalVarsle({
    scoreIDag: iDag,
    scoreIGar: h.scoreIGar,
    lavesteSisteUke: h.lavesteSisteUke ?? iDag,
    sistVarsletIso,
    naa: morgen(dag),
    sisteOmslagIso: h.sisteOmslagIso
  });
}

describe('skalVarsle over et hull i historikken', () => {
  it('hull på D−1, under på D−2, over på D → varselet går på D', () => {
    // ⚠️ REGRESJONSVAKT. Før: «ingen-gaardag» på D og «var-allerede-bra» på D+1.
    const maalt = scorer({ 5: 60, 6: 64, 7: 68, 8: UNDER, 10: OVER });
    expect(vurder(maalt, 10)).toEqual({ send: true, fra: 60, til: OVER });
  });

  it('gikk e-posten ut på D, er det stille på D+1', () => {
    const maalt = scorer({ 5: 60, 6: 64, 7: 68, 8: UNDER, 10: OVER, 11: OVER + 2 });
    expect(vurder(maalt, 11, morgen(10).toISOString())).toEqual({ send: false, grunn: 'var-allerede-bra' });
  });

  it('feilet utsendingen på D, hentes varselet inn på D+1 — omslaget finnes nå også over hullet', () => {
    const maalt = scorer({ 5: 60, 6: 64, 7: 68, 8: UNDER, 10: OVER, 11: OVER + 2 });
    expect(vurder(maalt, 11, null)).toEqual({ send: true, fra: 60, til: OVER + 2 });
  });

  it('hullet var selve omslagsdagen (lagringen feilet etter at e-posten gikk): karantenen holder', () => {
    // Raden for dag 9 mangler, men abonnenten fikk varselet den morgenen.
    const maalt = scorer({ 5: 60, 6: 64, 7: 68, 8: UNDER, 10: OVER });
    expect(vurder(maalt, 10, morgen(9).toISOString())).toEqual({ send: false, grunn: 'i-karantene' });
  });

  it('tre eller flere umålte dager: fortsatt «ingen-gaardag», og ikke noe omslag å hente inn', () => {
    const maalt = scorer({ 4: 55, 5: 60, 6: UNDER, 10: OVER, 11: OVER });
    expect(vurder(maalt, 10)).toEqual({ send: false, grunn: 'ingen-gaardag' });
    // Grensen er kjent og bevisst: syklusen er tapt, men ingen e-post er gjettet fram.
    expect(vurder(maalt, 11)).toEqual({ send: false, grunn: 'var-allerede-bra' });
  });

  it('over på D−2 og over på D: «var-allerede-bra» — hullet blir aldri et omslag', () => {
    const maalt = scorer({ 2: OVER, 3: OVER, 4: OVER, 5: OVER, 6: OVER, 7: OVER, 8: OVER, 10: OVER + 3 });
    expect(vurder(maalt, 10)).toEqual({ send: false, grunn: 'var-allerede-bra' });
  });

  it('økningskravet mot ukas bunn gjelder like fullt over et hull', () => {
    // 80-81-80-(hull)-81: krysser terskelen, men ingenting har skjedd.
    const flat = VARSEL_MIN_SCORE - 1;
    const maalt = scorer({ 5: flat, 6: VARSEL_MIN_SCORE, 7: flat, 8: flat, 10: VARSEL_MIN_SCORE });
    expect(vurder(maalt, 10)).toEqual({ send: false, grunn: 'for-liten-okning' });
    // Nøyaktig på minstekravet slipper gjennom, som uten hull.
    const bunn = VARSEL_MIN_SCORE - VARSEL_MIN_OKNING;
    expect(vurder(scorer({ 8: bunn, 10: VARSEL_MIN_SCORE }), 10)).toEqual({ send: true, fra: bunn, til: VARSEL_MIN_SCORE });
  });

  it('karantenen gjelder like fullt over et hull', () => {
    const maalt = scorer({ 5: 60, 6: 64, 7: 68, 8: UNDER, 10: OVER });
    expect(vurder(maalt, 10, morgen(7).toISOString())).toEqual({ send: false, grunn: 'i-karantene' });
    expect(vurder(maalt, 10, morgen(10 - VARSEL_KARANTENE_DAGER).toISOString())).toMatchObject({ send: true });
  });

  it('under terskelen er under terskelen, hull eller ikke', () => {
    expect(vurder(scorer({ 8: 20, 10: VARSEL_MIN_SCORE - 1 }), 10)).toEqual({ send: false, grunn: 'under-terskel' });
  });
});

describe('hele sesongen — med netter uten fliser', () => {
  /**
   * Kjører en scoresekvens morgen for morgen, slik cronen gjør: dagens tall
   * lagres, historikken leses, beslutningen tas. En dag i `hull` er en natt
   * uten fliser — ingen rad og ingen vurdering. En dag i `sendingFeiler` er en
   * morgen der e-posten ikke kom ut (raden stemples da ikke).
   */
  function sesong(scorerPerDag: number[], hull: number[] = [], sendingFeiler: number[] = []): number[] {
    const maalt = new Map<string, number>();
    let sist: string | null = null;
    const sendt: number[] = [];
    for (let d = 0; d < scorerPerDag.length; d += 1) {
      if (hull.includes(d)) continue;
      maalt.set(dato(d), scorerPerDag[d]);
      const b = vurder(maalt, d, sist);
      if (b.send && !sendingFeiler.includes(d)) {
        sendt.push(d);
        sist = morgen(d).toISOString();
      }
    }
    return sendt;
  }

  // 60 dager med sagtann, samme som i decision.test.ts: kryper opp, faller
  // brått etter tørke, kryper opp igjen. Fem sykluser à tolv dager, og
  // terskelen krysses på dag 5 i hver.
  const sagtann = Array.from({ length: 60 }, (_, d) => {
    const syklus = d % 12;
    return syklus < 8 ? 55 + syklus * 6 : 95 - (syklus - 8) * 14;
  });

  it('uten hull: ett varsel per syklus, på omslagsdagen', () => {
    expect(sesong(sagtann)).toEqual([5, 17, 29, 41, 53]);
  });

  it('én natt uten fliser — hvilken som helst — koster aldri et varsel og gir aldri et ekstra', () => {
    for (let h = 0; h < sagtann.length; h += 1) {
      const sendt = sesong(sagtann, [h]);
      expect(sendt, `hull på dag ${h}`).toHaveLength(5);
      // Varselet går på omslagsdagen, eller dagen etter når omslagsdagen selv var hullet.
      for (const d of sendt) expect([5, 6], `hull på dag ${h}, sendt dag ${d}`).toContain(d % 12);
    }
  });

  it('to netter på rad uten fliser: fortsatt ett varsel per syklus', () => {
    for (let h = 0; h < sagtann.length - 1; h += 1) {
      const sendt = sesong(sagtann, [h, h + 1]);
      expect(sendt, `hull på dag ${h}–${h + 1}`).toHaveLength(5);
    }
  });

  it('tre netter på rad over et omslag: den syklusen er tapt — men ingen e-post er gjettet fram', () => {
    // Dag 4–6 mangler. Dag 7 har ingen målt dag innenfor toleransen, og fra
    // dag 8 var det «allerede bra». Grensen er bevisst: se historikk.ts.
    expect(sesong(sagtann, [4, 5, 6])).toEqual([17, 29, 41, 53]);
  });

  it('hull OG feilet utsending: varselet hentes inn dagen etter', () => {
    // Dag 4 mangler, e-posten på dag 5 feiler → dag 6 leverer den ene.
    expect(sesong(sagtann, [4], [5])).toEqual([6, 17, 29, 41, 53]);
    // Omslagsdagen selv mangler, og e-posten dagen etter feiler → dag 7.
    expect(sesong(sagtann, [5], [6])).toEqual([7, 17, 29, 41, 53]);
  });

  it('en sammenhengende god periode med hull i: fortsatt bare det ene varselet', () => {
    const god = [50, ...Array.from({ length: 30 }, () => 92)];
    expect(sesong(god)).toEqual([1]);
    expect(sesong(god, [3, 10, 11, 20])).toEqual([1]);
    // Omslagsdagen selv mangler → varselet kommer dagen etter, og bare da.
    expect(sesong(god, [1])).toEqual([2]);
    expect(sesong(god, [1, 2])).toEqual([3]);
  });

  it('en uke som vipper rundt terskelen blir ikke til e-post av at dager mangler', () => {
    const vipper = Array.from({ length: 40 }, (_, d) => (d % 2 === 0 ? VARSEL_MIN_SCORE - 1 : VARSEL_MIN_SCORE));
    expect(sesong(vipper)).toEqual([]);
    for (let h = 0; h < vipper.length; h += 1) expect(sesong(vipper, [h]), `hull på dag ${h}`).toEqual([]);
  });

  it('tier gjennom en hel tørkesesong, med og uten hull', () => {
    const tork = Array.from({ length: 60 }, (_, d) => 40 + (d % 5) * 3);
    expect(sesong(tork)).toEqual([]);
    expect(sesong(tork, [7, 8, 30])).toEqual([]);
  });
});
