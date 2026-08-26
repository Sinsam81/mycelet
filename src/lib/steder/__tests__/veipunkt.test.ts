import { describe, it, expect } from 'vitest';
import {
  renseTekst,
  gyldigKoordinat,
  gyldigTid,
  validerVeipunkt,
  skillDuplikater,
  avstandMeter,
  MAKS_NAVN
} from '../veipunkt';
import { lagGpx } from '@/lib/gpx/lag-gpx';

describe('renseTekst', () => {
  it('fjerner kontrolltegn og klemmer sammen mellomrom', () => {
    expect(renseTekst('Kantarellskogen\n  ved  bekken', 120)).toBe('Kantarellskogen ved bekken');
  });

  /**
   * Kappingen må telle KODEPUNKTER. En naiv slice på UTF-16-enheter kan dele en
   * emoji i to og etterlate et enslig surrogat — som er ulovlig i XML, og som
   * derfor ville kommet tilbake som en ødelagt fil i VÅR egen eksport, lenge
   * etter importen. Testen går derfor helt ut til eksporten.
   */
  it('kapper uten å dele en emoji i to', () => {
    const navn = '🍄'.repeat(MAKS_NAVN + 10);
    const kappet = renseTekst(navn, MAKS_NAVN)!;

    expect([...kappet]).toHaveLength(MAKS_NAVN);
    // Et ENSLIG surrogat — halve emojien — er det ulovlige. Hele par er greit.
    expect(kappet).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(lagGpx([{ latitude: 59.9, longitude: 10.7, name: kappet }])).toContain(kappet);
  });

  it('gir null for tomt, blankt og ikke-tekst', () => {
    expect(renseTekst('   ', 120)).toBeNull();
    expect(renseTekst(null, 120)).toBeNull();
    expect(renseTekst(42, 120)).toBeNull();
  });
});

describe('gyldigKoordinat', () => {
  it('avviser manglende, tomme og ikke-numeriske verdier', () => {
    // Number(null) og Number('') er begge 0 — uten en egen sjekk blir et
    // veipunkt uten lat til et gyldig punkt på ekvator.
    expect(gyldigKoordinat(null, 10.7)).toBeNull();
    expect(gyldigKoordinat('', 10.7)).toBeNull();
    expect(gyldigKoordinat(undefined, 10.7)).toBeNull();
    expect(gyldigKoordinat('nord', 10.7)).toBeNull();
    expect(gyldigKoordinat(true, 10.7)).toBeNull();
  });

  it('avviser koordinater utenfor kloden og Null Island', () => {
    expect(gyldigKoordinat(91, 10)).toBeNull();
    expect(gyldigKoordinat(59.9, 181)).toBeNull();
    expect(gyldigKoordinat(0, 0)).toBeNull();
  });

  it('godtar tall og tallstrenger', () => {
    expect(gyldigKoordinat('59.9', '10.7')).toEqual({ latitude: 59.9, longitude: 10.7 });
    expect(gyldigKoordinat(-33.9, 151.2)).toEqual({ latitude: -33.9, longitude: 151.2 });
  });
});

describe('gyldigTid', () => {
  it('normaliserer til ISO og forkaster søppel uten å kaste', () => {
    expect(gyldigTid('2025-09-14T08:30:00Z')).toBe('2025-09-14T08:30:00.000Z');
    expect(gyldigTid('i fjor høst')).toBeNull();
    expect(gyldigTid(null)).toBeNull();
  });
});

describe('validerVeipunkt', () => {
  it('bruker reservenavnet når kilden ikke ga stedet noe navn', () => {
    const punkt = validerVeipunkt({ name: null, latitude: 59.9, longitude: 10.7 }, 'Sted 3');
    expect(punkt?.name).toBe('Sted 3');
  });

  /**
   * Ruta får JSON, ikke en GPX-fil. Klienten er ikke en del av
   * sikkerhetsmodellen: den samme lista kan sendes rett til endepunktet med
   * hvilke som helst verdier.
   */
  it('avviser rader fra en klient som ikke har vært i nærheten av en GPX-fil', () => {
    expect(validerVeipunkt(null, 'Sted')).toBeNull();
    expect(validerVeipunkt('bare en streng', 'Sted')).toBeNull();
    expect(validerVeipunkt({ latitude: 'nord', longitude: 10.7 }, 'Sted')).toBeNull();
    expect(validerVeipunkt({ latitude: 59.9, longitude: 10.7 }, '   ')).toBeNull();
  });

  it('kapper og renser tekstfeltene, og ignorerer felt vi ikke ber om', () => {
    const punkt = validerVeipunkt(
      {
        name: 'x'.repeat(300),
        note: 'y'.repeat(900),
        latitude: 59.9,
        longitude: 10.7,
        waypointTime: 'tull',
        user_id: 'en-annen-bruker',
        source: 'manual'
      },
      'Sted'
    )!;

    expect(punkt.name).toHaveLength(120);
    expect(punkt.note).toHaveLength(500);
    expect(punkt.waypointTime).toBeNull();
    expect(punkt).not.toHaveProperty('user_id');
    expect(punkt).not.toHaveProperty('source');
  });
});

describe('skillDuplikater', () => {
  const oslo = { latitude: 59.911491, longitude: 10.757933 };

  it('kjenner igjen et sted brukeren har fra før', () => {
    // ~11 m nord for oslo.
    const nesten = { latitude: 59.911591, longitude: 10.757933 };
    expect(avstandMeter(oslo.latitude, oslo.longitude, nesten.latitude, nesten.longitude)).toBeLessThan(25);

    const { nye, duplikater } = skillDuplikater([nesten], [oslo]);
    expect(nye).toHaveLength(0);
    expect(duplikater).toHaveLength(1);
  });

  it('slipper gjennom nåler brukeren har satt bevisst ved siden av hverandre', () => {
    // ~110 m unna — to nabosteder, ikke ett.
    const naboen = { latitude: 59.912491, longitude: 10.757933 };
    expect(skillDuplikater([naboen], [oslo]).nye).toHaveLength(1);
  });

  /**
   * En fil eksportert fra to apper kan inneholde det samme stedet to ganger.
   * Da skal det bli ett sted — ikke to som ligger tre meter fra hverandre.
   */
  it('luker også ut duplikater inne i samme fil', () => {
    const { nye, duplikater } = skillDuplikater([oslo, { ...oslo, longitude: 10.75794 }], []);
    expect(nye).toHaveLength(1);
    expect(duplikater).toHaveLength(1);
  });
});
