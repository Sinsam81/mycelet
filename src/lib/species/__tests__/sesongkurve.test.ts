import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { PHENOLOGY, PHENOLOGY_META } from '@/lib/prediction/phenology-data';
import { monthMask } from '@/lib/utils/season-region';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { langeManedsnavn } from '../manedsnavn';
import {
  SESONGKURVE_FUNN,
  byggSesongkurve,
  dagensAndel,
  datodelForUke,
  hentSesongkurve,
  sesongkurveTekster,
  sesongkurveVisning,
  toppPeriode,
  ukeTilAndel,
  type Maalevindu,
  type Sesongkurve,
  type SesongkurveOversetter
} from '../sesongkurve';

/**
 * Sesongkurven viser NÅR arten er registrert. Testene låser tre ting:
 *   1. kurven vises aldri når den ville løyet (vinterarter, kuttede kurver,
 *      masseregistreringer som ser ut som en sesong);
 *   2. regnestykket fra uke til plass på aksen, og fra dato til «i dag»-strek;
 *   3. teksten rundt — «registrerte funn», aldri et løfte om funn.
 *
 * Ingen test leser klokka: datoen sendes inn.
 */

/** Det målte vinduet i dag: 1. april – 30. november. */
const APRIL_NOVEMBER: Maalevindu = { forsteDag: 91, sisteDag: 334 };
const HELE_AARET: Maalevindu = { forsteDag: 1, sisteDag: 365 };

const JUN_OKT = monthMask(6, 10);

/** 52 uker med en trekant rundt `topp`: 1 i toppuka, ned med `fall` per uke. */
function trekant(topp: number, fall = 0.1): number[] {
  return Array.from({ length: 52 }, (_, uke) => Math.max(0, Math.round((1 - Math.abs(uke - topp) * fall) * 1000) / 1000));
}

/** 52 uker med null overalt unntatt ukene som er oppgitt. */
function medVerdier(verdier: Record<number, number>): number[] {
  return Array.from({ length: 52 }, (_, uke) => verdier[uke] ?? 0);
}

/** En smal sesong: bare toppuka selv holder 80 % av toppen. */
function spiss(topp: number): number[] {
  const side = [0.7, 0.3, 0.12, 0.05];
  const verdier: Record<number, number> = { [topp]: 1 };
  side.forEach((verdi, i) => {
    verdier[topp - 1 - i] = verdi;
    verdier[topp + 1 + i] = verdi;
  });
  return medVerdier(verdier);
}

/**
 * Tre kurver ordrett fra phenology-data.ts 16. november 2026 (`all`, uke 0–51).
 * De står her som tall, så testene sier det samme etter neste regenerering.
 */
const TRAKTKANTARELL = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0, 0, 0, 0.001, 0.004, 0.005,
  0.007, 0.014, 0.027, 0.047, 0.115, 0.175, 0.293, 0.441, 0.619, 0.775, 0.933, 1, 0.988, 0.913, 0.797, 0.666, 0.556,
  0.465, 0.362, 0.272, 0.182, 0.102, 0.041, 0.017, 0, 0
];
const STORKREMLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.002, 0.002, 0.002, 0.002, 0.008, 0.006, 0.006, 0.007, 0.015, 0.202,
  0.23, 0.275, 0.378, 0.484, 0.428, 0.608, 0.775, 0.906, 0.989, 1, 0.906, 0.77, 0.573, 0.393, 0.25, 0.14, 0.066, 0.03,
  0.015, 0.009, 0.005, 0.003, 0.001, 0, 0, 0, 0
];
const SPISS_MORKEL = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.018, 0.073, 0.164, 0.409, 0.618, 0.909, 1, 0.964, 0.764, 0.6, 0.309,
  0.173, 0.127, 0.091, 0.045, 0.027, 0.018, 0.009, 0, 0.009, 0.009, 0.009, 0.009, 0.009, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0
];

function kurve(alleUker: number[], maske = JUN_OKT, vindu = APRIL_NOVEMBER): Sesongkurve {
  const resultat = byggSesongkurve(alleUker, vindu, maske);
  if (!resultat) throw new Error('ventet en kurve');
  return resultat;
}

describe('kurven tegnes bare over det som er målt', () => {
  it('tar med ukene som har midten sin i april–november', () => {
    const k = kurve(trekant(36));
    // Uke 12 er 25.–31. mars pluss 1. april: ett døgn med data, ikke en måling.
    expect(k.startUke).toBe(13);
    expect(k.sluttUke).toBe(47);
    expect(k.uker).toHaveLength(35);
    expect(k.forsteManed).toBe(4);
    expect(k.sisteManed).toBe(11);
    expect([k.forsteDag, k.sisteDag]).toEqual([91, 334]);
  });

  it('finner toppuka og perioden rundt med minst 80 % av toppen', () => {
    // 1 – 0,9 – 0,8 – 0,7 …: toppuka og to uker på hver side holder 80 %.
    const k = kurve(trekant(36));
    expect(k.toppUke).toBe(36);
    expect(k.toppFraUke).toBe(34);
    expect(k.toppTilUke).toBe(38);
  });

  it('gir en topperiode på én uke når kurven er spiss', () => {
    const k = kurve(spiss(28));
    expect([k.toppFraUke, k.toppUke, k.toppTilUke]).toEqual([28, 28, 28]);
  });

  it('følger vinduet hvis porten i phenology.ts en dag fjernes', () => {
    const k = kurve(trekant(26), monthMask(1, 12), HELE_AARET);
    expect(k.startUke).toBe(0);
    expect(k.sluttUke).toBe(51);
    expect(k.forsteManed).toBe(1);
    expect(k.sisteManed).toBe(12);
  });
});

describe('ingen kurve er bedre enn en kurve som lyver', () => {
  it('viser ingen kurve når sesongraden over nevner en måned som ikke er målt', () => {
    // Vintersopp: «okt – mar». Kurven er en hardkodet null i desember–mars, og
    // ville stått flat der raden over sier «i sesong».
    expect(byggSesongkurve(trekant(36), APRIL_NOVEMBER, monthMask(10, 3))).toBeNull();
    expect(byggSesongkurve(trekant(36), APRIL_NOVEMBER, monthMask(9, 12))).toBeNull();
    expect(byggSesongkurve(trekant(36), APRIL_NOVEMBER, monthMask(3, 5))).toBeNull();
    expect(byggSesongkurve(trekant(36), APRIL_NOVEMBER, monthMask(4, 11))).not.toBeNull();
  });

  it('viser ingen kurve når sesongen begynte før vinduet', () => {
    // Sandmorkel står på 24 % av toppen første uka i april.
    const tidlig = trekant(18, 0.15);
    expect(tidlig[13]).toBeGreaterThan(0.15);
    expect(byggSesongkurve(tidlig, APRIL_NOVEMBER, monthMask(4, 6))).toBeNull();
  });

  it('viser ingen kurve når sesongen fortsetter etter vinduet', () => {
    const sen = trekant(44, 0.2);
    expect(sen[47]).toBeGreaterThan(0.15);
    expect(byggSesongkurve(sen, APRIL_NOVEMBER, monthMask(9, 11))).toBeNull();
  });

  it('godtar en hale på inntil 15 % i kanten', () => {
    // Traktkantarell står på 10 % siste uka i november og skal med.
    expect(TRAKTKANTARELL[47]).toBe(0.102);
    expect(byggSesongkurve(TRAKTKANTARELL, APRIL_NOVEMBER, monthMask(8, 11))).not.toBeNull();
    const hale = [...TRAKTKANTARELL];
    hale[47] = 0.15;
    expect(byggSesongkurve(hale, APRIL_NOVEMBER, monthMask(8, 11))).not.toBeNull();
    hale[47] = 0.151;
    expect(byggSesongkurve(hale, APRIL_NOVEMBER, monthMask(8, 11))).toBeNull();
  });

  it('viser ingen kurve når selve toppen ligger utenfor vinduet', () => {
    const vintertopp = trekant(2, 0.02).map((verdi, uke) => (uke >= 13 && uke <= 47 ? Math.min(verdi, 0.1) : verdi));
    expect(byggSesongkurve(vintertopp, APRIL_NOVEMBER, JUN_OKT)).toBeNull();
  });

  it('viser ingen kurve når en masseregistrering har lagt et platå i den', () => {
    // Storkremle: 657 funn i uka 2.–8. juli (ført på fire enkeltdager) mot 29 uka før.
    // Glattingen over fem uker har gjort dem til et platå som begynner med et
    // trinn fra 0,015 til 0,202 — midt i juni, for en art som kommer i
    // slutten av juli.
    expect([STORKREMLE[23], STORKREMLE[24]]).toEqual([0.015, 0.202]);
    expect(byggSesongkurve(STORKREMLE, APRIL_NOVEMBER, monthMask(7, 10))).toBeNull();

    // Samme art uten opphopningen: en jevn stigning gjennom juni og juli.
    const uten = [...STORKREMLE];
    [0.03, 0.06, 0.11, 0.19, 0.3, 0.44].forEach((verdi, i) => {
      uten[24 + i] = verdi;
    });
    expect(byggSesongkurve(uten, APRIL_NOVEMBER, monthMask(7, 10))).not.toBeNull();
  });

  it('skiller et brått trinn fra en sesong som bare er kort og bratt', () => {
    // Spiss morkel stiger 0,29 på én uke, men fra et nivå som allerede er
    // høyt. Det er en kort vårsesong, ikke en opphopning.
    expect(SPISS_MORKEL[19] - SPISS_MORKEL[18]).toBeCloseTo(0.291, 3);
    expect(byggSesongkurve(SPISS_MORKEL, APRIL_NOVEMBER, monthMask(4, 6))).not.toBeNull();

    // Grensen: et trinn på 15 % av toppen der den laveste uka er under en
    // tredel av den høyeste.
    const trinn = (fra: number, til: number) =>
      byggSesongkurve(
        medVerdier({ 29: fra, 30: til, 31: 0.3, 32: 0.5, 33: 0.75, 34: 1, 35: 0.75, 36: 0.5, 37: 0.3, 38: 0.15, 39: 0.06 }),
        APRIL_NOVEMBER,
        JUN_OKT
      );
    expect(trinn(0.01, 0.17)).toBeNull(); // opp fra nesten ingenting
    expect(trinn(0.01, 0.14)).not.toBeNull(); // for lite til å være et trinn
    expect(trinn(0.1, 0.26)).not.toBeNull(); // stort nok, men fra et reelt nivå
  });

  it('ser trinnet på vei ned også', () => {
    const jevn = { 28: 0.05, 29: 0.12, 30: 0.3, 31: 0.6, 32: 1, 33: 0.7, 34: 0.4, 35: 0.3, 36: 0.25 };
    // Fra et platå på 25 % rett ned til nesten ingenting.
    expect(byggSesongkurve(medVerdier({ ...jevn, 37: 0.02 }), APRIL_NOVEMBER, JUN_OKT)).toBeNull();
    expect(byggSesongkurve(medVerdier({ ...jevn, 37: 0.15, 38: 0.07, 39: 0.02 }), APRIL_NOVEMBER, JUN_OKT)).not.toBeNull();
  });

  it('viser ingen kurve når dataene ikke har formen vi venter', () => {
    expect(byggSesongkurve(null, APRIL_NOVEMBER, JUN_OKT)).toBeNull();
    expect(byggSesongkurve(trekant(36).slice(0, 51), APRIL_NOVEMBER, JUN_OKT)).toBeNull();
    const hull = trekant(36);
    hull[30] = Number.NaN;
    expect(byggSesongkurve(hull, APRIL_NOVEMBER, JUN_OKT)).toBeNull();
    expect(byggSesongkurve(trekant(36), { forsteDag: 200, sisteDag: 200 }, JUN_OKT)).toBeNull();
  });
});

describe('hentSesongkurve mot de ekte kurvene', () => {
  it('gir null for en art uten kurve', () => {
    expect(hentSesongkurve(null, JUN_OKT)).toBeNull();
    expect(hentSesongkurve(undefined, JUN_OKT)).toBeNull();
    expect(hentSesongkurve(999_999, JUN_OKT)).toBeNull();
    expect(PHENOLOGY['999999']).toBeUndefined();
  });

  it('gir kantarell en kurve med toppen på sensommeren', () => {
    // Den ene testen som er bundet til innholdet i phenology-data.ts: arten
    // med flest funn, og en topp som ikke flytter seg med en ny import.
    const k = hentSesongkurve(1, JUN_OKT);
    expect(k).not.toBeNull();
    expect([7, 8, 9]).toContain(datodelForUke(k!.toppUke).maaned);
    expect(k!.uker).toHaveLength(35);
  });

  it('gir vinterartene ingen kurve, hva kurven deres enn inneholder', () => {
    // Vintersopp (77) og judasøre (76) har sesong i måneder som ikke er målt.
    // Sesongraden stopper dem, uavhengig av tallene i kurven.
    expect(hentSesongkurve(77, monthMask(10, 3))).toBeNull();
    expect(hentSesongkurve(76, monthMask(1, 12))).toBeNull();
    expect(hentSesongkurve(1, monthMask(6, 12))).toBeNull();
  });

  it('holder løftene sine for hver eneste art i datasettet', () => {
    // Uansett hvordan phenology-data.ts ser ut etter neste regenerering: en
    // kurve som slipper gjennom har toppen sin inne i vinduet, er nede i begge
    // kanter og har ingen brå trinn.
    const heleVinduet = monthMask(4, 11);
    let medKurve = 0;
    for (const id of Object.keys(PHENOLOGY)) {
      const k = hentSesongkurve(Number(id), heleVinduet);
      if (!k) continue;
      medKurve++;
      expect(Math.max(...k.uker), id).toBe(1);
      expect(k.uker[0], id).toBeLessThanOrEqual(0.15);
      expect(k.uker[k.uker.length - 1], id).toBeLessThanOrEqual(0.15);
      expect(k.toppFraUke, id).toBeLessThanOrEqual(k.toppUke);
      expect(k.toppTilUke, id).toBeGreaterThanOrEqual(k.toppUke);
      expect(k.uker[k.toppUke - k.startUke], id).toBe(1);
      for (let i = 1; i < k.uker.length; i++) {
        const hoy = Math.max(k.uker[i], k.uker[i - 1]);
        const lav = Math.min(k.uker[i], k.uker[i - 1]);
        expect(hoy - lav >= 0.15 && lav <= hoy / 3, `${id} uke ${k.startUke + i}`).toBe(false);
      }
    }
    expect(medKurve).toBeGreaterThan(40);
  });
});

describe('fra uke og dato til plass på aksen', () => {
  const k = kurve(trekant(36));

  it('legger hver uke midt i uka, på en akse fra 1. april til 30. november', () => {
    // Uke 13 er 2.–8. april: midten er 4,5 døgn inn på en akse på 244 døgn.
    expect(ukeTilAndel(k, 13)).toBeCloseTo(4.5 / 244, 6);
    expect(ukeTilAndel(k, 47)).toBeCloseTo(242.5 / 244, 6);
    const andeler = Array.from({ length: 35 }, (_, i) => ukeTilAndel(k, 13 + i));
    for (let i = 1; i < andeler.length; i++) expect(andeler[i]).toBeGreaterThan(andeler[i - 1]);
    expect(andeler[0]).toBeGreaterThan(0);
    expect(andeler[andeler.length - 1]).toBeLessThan(1);
  });

  it('setter «i dag» der datoen er, innenfor vinduet', () => {
    expect(dagensAndel(k, '2026-04-01')).toBeCloseTo(0.5 / 244, 6);
    expect(dagensAndel(k, '2026-11-30')).toBeCloseTo(243.5 / 244, 6);
    // 13. september er dag 256.
    expect(dagensAndel(k, '2026-09-13')).toBeCloseTo((256.5 - 91) / 244, 6);
  });

  it('tegner ingen «i dag» utenfor det målte vinduet', () => {
    for (const dato of ['2026-03-31', '2026-12-01', '2026-01-15', '2027-02-28']) {
      expect(dagensAndel(k, dato), dato).toBeNull();
    }
  });

  it('tegner ingen «i dag» for en dato den ikke forstår', () => {
    for (const dato of ['', 'i dag', '2026-13-01', '2026-00-10', '2026-09-32', '16.11.2026']) {
      expect(dagensAndel(k, dato), dato).toBeNull();
    }
  });

  it('teller dager som generatoren: uten skuddår', () => {
    expect(dagensAndel(k, '2028-09-13')).toBe(dagensAndel(k, '2026-09-13'));
  });

  it('sier hvilken tredel av måneden en uke faller i', () => {
    expect(datodelForUke(31)).toEqual({ maaned: 8, del: 'start' }); // 9. august
    expect(datodelForUke(36)).toEqual({ maaned: 9, del: 'midt' }); // 13. september
    expect(datodelForUke(34)).toEqual({ maaned: 8, del: 'slutt' }); // 30. august
    expect(datodelForUke(13)).toEqual({ maaned: 4, del: 'start' }); // 5. april
    expect(toppPeriode(k)).toEqual({ fra: { maaned: 8, del: 'slutt' }, til: { maaned: 9, del: 'slutt' } });
  });
});

describe('det komponenten får å tegne', () => {
  const k = kurve(trekant(36));
  const visning = sesongkurveVisning(k, '2026-09-13');

  it('har ett punkt per uke, med kurvens egne verdier', () => {
    expect(visning.punkter).toHaveLength(35);
    expect(visning.punkter.map((p) => p.verdi)).toEqual(k.uker);
    expect(visning.punkter[36 - 13]).toEqual({ x: ukeTilAndel(k, 36), verdi: 1 });
  });

  it('har åtte måneder, april først uten skillestrek', () => {
    expect(visning.maneder.map((m) => m.maaned)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(visning.maneder[0].skille).toBeNull();
    // 1. mai er 30 døgn inn på aksen.
    expect(visning.maneder[1].skille).toBeCloseTo(30 / 244, 6);
    for (const maaned of visning.maneder) {
      expect(maaned.etikett).not.toBeNull();
      expect(maaned.etikett!).toBeGreaterThan(0);
      expect(maaned.etikett!).toBeLessThan(1);
    }
    // April-etiketten står midt i april: 15 døgn inn.
    expect(visning.maneder[0].etikett).toBeCloseTo(15 / 244, 6);
  });

  it('har tolv måneder når hele året er målt', () => {
    const helaar = sesongkurveVisning(kurve(trekant(26), monthMask(1, 12), HELE_AARET), '2026-01-15');
    expect(helaar.maneder.map((m) => m.maaned)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(helaar.iDag).not.toBeNull();
  });

  it('markerer perioden med flest funn fra starten av første til slutten av siste toppuke', () => {
    // Uke 34–38: 27. august (dag 239) til og med 30. september (dag 273).
    const { topp } = visning;
    expect(topp[0].x).toBeCloseTo((239 - 91) / 244, 6);
    expect(topp[topp.length - 1].x).toBeCloseTo((274 - 91) / 244, 6);
    for (let i = 1; i < topp.length; i++) expect(topp[i].x).toBeGreaterThan(topp[i - 1].x);
    // Kantene ligger midt mellom to ukepunkter: uke 33 (0,7) og 34 (0,8).
    expect(topp[0].verdi).toBeCloseTo(0.75, 6);
    expect(topp[topp.length - 1].verdi).toBeCloseTo(0.75, 6);
    // De fem toppukene selv er med, uendret.
    expect(topp.slice(1, -1).map((p) => p.verdi)).toEqual([0.8, 0.9, 1, 0.9, 0.8]);
  });

  it('holder toppfeltet inne på aksen også når toppen ligger nær kanten', () => {
    // Nærmere kommer den ikke: kanten selv må være nede, og veien opp fra den
    // kan ikke være et brått trinn.
    const tidlig = sesongkurveVisning(
      kurve(medVerdier({ 13: 0.15, 14: 0.44, 15: 1, 16: 0.44, 17: 0.15, 18: 0.06, 19: 0.02 }), monthMask(4, 6)),
      '2026-01-01'
    );
    expect(tidlig.topp[0].x).toBeCloseTo(15 / 244, 6);
    expect(tidlig.topp[0].x).toBeGreaterThanOrEqual(0);
    const sent = sesongkurveVisning(
      kurve(medVerdier({ 41: 0.02, 42: 0.06, 43: 0.15, 44: 0.44, 45: 1, 46: 0.44, 47: 0.15 }), monthMask(9, 11)),
      '2026-01-01'
    );
    expect(sent.topp[sent.topp.length - 1].x).toBeCloseTo(232 / 244, 6);
    expect(sent.topp[sent.topp.length - 1].x).toBeLessThanOrEqual(1);
  });

  it('sender med dagens dato bare når den er i vinduet', () => {
    expect(visning.iDag).toBeCloseTo((256.5 - 91) / 244, 6);
    expect(sesongkurveVisning(k, '2026-12-24').iDag).toBeNull();
  });
});

describe('teksten rundt kurven', () => {
  function oversetter(locale: 'nb' | 'sv'): SesongkurveOversetter {
    const messages = (locale === 'nb' ? nb : sv) as unknown as Record<string, unknown>;
    return createTranslator({ locale, messages, namespace: 'SpeciesDetail' }) as unknown as SesongkurveOversetter;
  }

  function tekster(k: Sesongkurve, locale: 'nb' | 'sv', navn = 'Kantarell') {
    return sesongkurveTekster({ kurve: k, navn, t: oversetter(locale), langeManeder: langeManedsnavn(locale) });
  }

  // Som kantarell i dag: uke 31–37 holder 80 % av toppen.
  const spenn = kurve(
    medVerdier({
      25: 0.04, 26: 0.09, 27: 0.18, 28: 0.34, 29: 0.55, 30: 0.7, 31: 0.8, 32: 0.9, 33: 0.95, 34: 1, 35: 0.95, 36: 0.9,
      37: 0.8, 38: 0.6, 39: 0.4, 40: 0.25, 41: 0.15, 42: 0.08, 43: 0.03
    })
  );
  // Som vanlig morkel i dag: uke 18–20, begynnelsen til slutten av mai.
  const sammeManed = kurve(trekant(19, 0.15), monthMask(4, 6));
  // Én tredel av én måned.
  const ettPunkt = kurve(spiss(28));

  it('sier perioden over to måneder', () => {
    expect([spenn.toppFraUke, spenn.toppTilUke]).toEqual([31, 37]);
    expect(tekster(spenn, 'nb').topp).toBe(
      'Flest registrerte funn fra begynnelsen av august til midten av september.'
    );
    expect(tekster(spenn, 'sv').topp).toBe('Flest registrerade fynd från början av augusti till mitten av september.');
  });

  it('sier perioden innenfor én måned uten å gjenta måneden', () => {
    expect(toppPeriode(sammeManed)).toEqual({ fra: { maaned: 5, del: 'start' }, til: { maaned: 5, del: 'slutt' } });
    expect(tekster(sammeManed, 'nb').topp).toBe('Flest registrerte funn fra begynnelsen til slutten av mai.');
    expect(tekster(sammeManed, 'sv').topp).toBe('Flest registrerade fynd från början till slutet av maj.');
  });

  it('sier ett tidspunkt når toppen er smal', () => {
    expect(tekster(ettPunkt, 'nb').topp).toBe('Flest registrerte funn i midten av juli.');
    expect(tekster(ettPunkt, 'sv').topp).toBe('Flest registrerade fynd i mitten av juli.');
  });

  it('dekker alle tre tredeler på begge språk', () => {
    // «slutten»/«slutet» er other-grenen i select-uttrykket.
    const sent = kurve(spiss(34));
    expect(tekster(sent, 'nb').topp).toBe('Flest registrerte funn i slutten av august.');
    expect(tekster(sent, 'sv').topp).toBe('Flest registrerade fynd i slutet av augusti.');
    const tidlig = kurve(spiss(31));
    expect(tekster(tidlig, 'nb').topp).toBe('Flest registrerte funn i begynnelsen av august.');
    expect(tekster(tidlig, 'sv').topp).toBe('Flest registrerade fynd i början av augusti.');
  });

  it('sier hva kurven bygger på, med tallet fra datasettet', () => {
    expect(SESONGKURVE_FUNN).toBe(PHENOLOGY_META.d);
    const norsk = tekster(spenn, 'nb').bildetekst;
    const svensk = tekster(spenn, 'sv').bildetekst;
    // Tallet formateres med tusenskille; sammenlign sifrene.
    const sifre = String(PHENOLOGY_META.d);
    expect(norsk.replace(/\s/g, '')).toContain(sifre);
    expect(svensk.replace(/\s/g, '')).toContain(sifre);
    expect(norsk).toContain('fra april til november');
    expect(svensk).toContain('från april till november');
    // Tallet gjelder alle artene til sammen — ikke denne arten.
    expect(norsk).toContain('for alle artene til sammen');
    expect(svensk).toContain('för alla arter tillsammans');
  });

  it('sier hva kurven IKKE viser', () => {
    expect(tekster(spenn, 'nb').bildetekst).toContain('ikke hvor mye som finnes, og ikke hvor');
    expect(tekster(spenn, 'sv').bildetekst).toContain('inte hur mycket som finns, och inte var');
  });

  it('gir figuren et navn som sier toppen i ord', () => {
    const norsk = tekster(spenn, 'nb');
    expect(norsk.ariaLabel).toBe(
      'Kantarell: registrerte funn uke for uke, fra april til november. Flest registrerte funn fra begynnelsen av august til midten av september.'
    );
    const svensk = tekster(spenn, 'sv');
    expect(svensk.ariaLabel).toBe(
      'Kantarell: registrerade fynd vecka för vecka, från april till november. Flest registrerade fynd från början av augusti till mitten av september.'
    );
    expect(norsk.iDag).toBe('i dag');
    expect(svensk.iDag).toBe('i dag');
  });

  it('lover aldri funn, og sier ingenting om spiselighet eller sted', () => {
    // Samme tekst for kantarell og grønn fluesopp. «Når», aldri «nå» eller «her».
    const forbudt =
      /plukk|plock|i sesong nå|i säsong nu|finner du|hittar du|spiselig|ätlig|trygg|säker|\bher\b|\bhär\b|nær deg|nära dig/i;
    for (const locale of ['nb', 'sv'] as const) {
      for (const k of [spenn, sammeManed, ettPunkt]) {
        const alle = tekster(k, locale, 'Grønn fluesopp');
        for (const tekst of [alle.topp, alle.bildetekst, alle.ariaLabel, alle.iDag]) {
          expect(tekst, tekst).not.toMatch(forbudt);
          expect(tekst.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('bruker tallet som sendes inn, ikke et tall skrevet inn i teksten', () => {
    const tekst = sesongkurveTekster({
      kurve: spenn,
      navn: 'Kantarell',
      t: oversetter('nb'),
      langeManeder: langeManedsnavn('nb'),
      antallFunn: 1234
    }).bildetekst;
    expect(tekst.replace(/\s/g, '')).toContain('1234');
    expect(tekst.replace(/\s/g, '')).not.toContain(String(PHENOLOGY_META.d));
  });
});
