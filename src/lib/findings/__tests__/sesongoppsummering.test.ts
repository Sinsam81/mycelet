import { describe, expect, it } from 'vitest';
import {
  erOppsummeringstid,
  sesongaar,
  sesongaarForDato,
  sesongoppsummering,
  type FunnForOppsummering
} from '../sesongoppsummering';

/**
 * «Sesongen din 2026» på forsiden. Alle datoer sendes inn — testene avhenger
 * aldri av dagens dato.
 */

const funn = (found_at: string | null, species_id: number | null = 1): FunnForOppsummering => ({ found_at, species_id });

const NOVEMBER = new Date('2026-11-16T12:00:00Z');
const JANUAR = new Date('2027-01-20T12:00:00Z');

describe('sesongåret går fra april til mars', () => {
  it.each([
    ['2026-04-01', 2026],
    ['2026-08-14', 2026],
    ['2026-12-31', 2026],
    ['2027-01-01', 2026],
    ['2027-03-31', 2026],
    ['2027-04-01', 2027]
  ])('%s hører til sesongen %i', (dato, aar) => {
    expect(sesongaarForDato(dato)).toBe(aar);
  });

  it('1. januar er fortsatt forrige sesong — ellers ble kortet tomt midt i vinteren', () => {
    expect(sesongaar(new Date('2026-12-31T12:00:00Z'))).toBe(2026);
    expect(sesongaar(new Date('2027-01-01T12:00:00Z'))).toBe(2026);
  });

  it('regnes i Oslo-tid: 31. mars 23:30 UTC er april i Oslo, altså ny sesong', () => {
    expect(sesongaar(new Date('2027-03-31T21:30:00Z'))).toBe(2026); // 23:30 i Oslo (sommertid)
    expect(sesongaar(new Date('2027-03-31T22:30:00Z'))).toBe(2027); // 00:30 i Oslo 1. april
  });
});

describe('når oppsummeringen vises', () => {
  it.each([
    ['2026-11-01T12:00:00Z', true],
    ['2026-12-15T12:00:00Z', true],
    ['2027-01-15T12:00:00Z', true],
    ['2027-02-15T12:00:00Z', true],
    ['2027-03-31T12:00:00Z', true],
    ['2027-04-01T12:00:00Z', false],
    ['2026-05-15T12:00:00Z', false],
    ['2026-06-15T12:00:00Z', false],
    ['2026-08-15T12:00:00Z', false],
    ['2026-10-31T12:00:00Z', false]
  ])('%s → %s', (naa, vises) => {
    expect(erOppsummeringstid(new Date(naa))).toBe(vises);
  });

  it('følger Oslo-måneden: 31. oktober 23:30 UTC er november i Oslo', () => {
    expect(erOppsummeringstid(new Date('2026-10-31T22:30:00Z'))).toBe(false); // 23:30 i Oslo
    expect(erOppsummeringstid(new Date('2026-10-31T23:30:00Z'))).toBe(true); // 00:30 i Oslo 1. november
  });
});

describe('sesongoppsummering', () => {
  it('teller funn, arter, første og siste registrering i sesongåret', () => {
    const rader = [
      funn('2026-11-02T09:00:00Z', 7),
      funn('2026-09-20T15:00:00Z', 1),
      funn('2026-09-05T10:00:00Z', 1),
      funn('2026-08-14T08:00:00Z', 1),
      funn('2026-08-14T07:00:00Z', 3)
    ];
    expect(sesongoppsummering(rader, NOVEMBER)).toEqual({
      aar: 2026,
      funn: 5,
      arter: 3,
      forste: '2026-08-14',
      siste: '2026-11-02',
      oftest: { speciesId: 1, antall: 3 }
    });
  });

  it('rekkefølgen på radene spiller ingen rolle', () => {
    const rader = [funn('2026-09-05T10:00:00Z'), funn('2026-11-02T09:00:00Z'), funn('2026-08-14T08:00:00Z')];
    const svar = sesongoppsummering(rader, NOVEMBER);
    expect(svar?.forste).toBe('2026-08-14');
    expect(svar?.siste).toBe('2026-11-02');
  });

  it('i januar gjelder fortsatt sesongen som begynte året før — og vinterfunnene hører med', () => {
    const rader = [
      funn('2027-01-10T11:00:00Z', 40), // vintersopp i januar: samme sesong
      funn('2026-09-05T10:00:00Z', 1),
      funn('2026-03-20T10:00:00Z', 1) // mars 2026: sesongen 2025
    ];
    expect(sesongoppsummering(rader, JANUAR)).toMatchObject({
      aar: 2026,
      funn: 2,
      arter: 2,
      forste: '2026-09-05',
      siste: '2027-01-10'
    });
  });

  it('funn fra tidligere sesonger teller ikke', () => {
    const rader = [funn('2025-09-01T10:00:00Z'), funn('2025-10-01T10:00:00Z')];
    expect(sesongoppsummering(rader, NOVEMBER)).toBeNull();
  });

  it('ingen funn i det hele tatt: ingen oppsummering — et «0 funn»-kort er verre enn ikke noe', () => {
    expect(sesongoppsummering([], NOVEMBER)).toBeNull();
  });

  it('datoen er Oslo-datoen, ikke UTC-datoen', () => {
    // 14. august 22:30 UTC er 15. august 00:30 i Oslo.
    const svar = sesongoppsummering([funn('2026-08-14T22:30:00Z')], NOVEMBER);
    expect(svar?.forste).toBe('2026-08-15');
    expect(svar?.siste).toBe('2026-08-15');
  });

  it('funn uten art fra katalogen teller som funn, ikke som art', () => {
    const rader = [funn('2026-09-01T10:00:00Z', null), funn('2026-09-02T10:00:00Z', null), funn('2026-09-03T10:00:00Z', 5)];
    expect(sesongoppsummering(rader, NOVEMBER)).toMatchObject({ funn: 3, arter: 1, oftest: null });
  });

  it('rader uten lesbar dato hoppes over i stedet for å velte siden', () => {
    const rader = [funn(null), funn('ikke en dato'), funn('2026-09-03T10:00:00Z')];
    expect(sesongoppsummering(rader, NOVEMBER)).toMatchObject({ funn: 1, forste: '2026-09-03' });
  });

  describe('«oftest» sies bare når det er sant', () => {
    it('én art alene øverst med minst to funn', () => {
      const rader = [funn('2026-09-01T10:00:00Z', 1), funn('2026-09-02T10:00:00Z', 1), funn('2026-09-03T10:00:00Z', 2)];
      expect(sesongoppsummering(rader, NOVEMBER)?.oftest).toEqual({ speciesId: 1, antall: 2 });
    });

    it('to arter står likt: ingen «oftest»', () => {
      const rader = [
        funn('2026-09-01T10:00:00Z', 1),
        funn('2026-09-02T10:00:00Z', 1),
        funn('2026-09-03T10:00:00Z', 2),
        funn('2026-09-04T10:00:00Z', 2),
        funn('2026-09-05T10:00:00Z', 3)
      ];
      expect(sesongoppsummering(rader, NOVEMBER)?.oftest).toBeNull();
    });

    it('likt i toppen, men oppdaget sent i lista: fortsatt ingen', () => {
      // Rekkefølgen artene telles i skal ikke avgjøre svaret.
      const rader = [
        funn('2026-09-01T10:00:00Z', 3),
        funn('2026-09-02T10:00:00Z', 2),
        funn('2026-09-03T10:00:00Z', 2),
        funn('2026-09-04T10:00:00Z', 1),
        funn('2026-09-05T10:00:00Z', 1)
      ];
      expect(sesongoppsummering(rader, NOVEMBER)?.oftest).toBeNull();
    });

    it('en ny topp etter et likt par er en ekte topp', () => {
      const rader = [
        funn('2026-09-01T10:00:00Z', 1),
        funn('2026-09-02T10:00:00Z', 2),
        funn('2026-09-03T10:00:00Z', 3),
        funn('2026-09-04T10:00:00Z', 3),
        funn('2026-09-05T10:00:00Z', 3)
      ];
      expect(sesongoppsummering(rader, NOVEMBER)?.oftest).toEqual({ speciesId: 3, antall: 3 });
    });

    it('alle arter ett funn hver: ingen «oftest»', () => {
      const rader = [funn('2026-09-01T10:00:00Z', 1), funn('2026-09-02T10:00:00Z', 2)];
      expect(sesongoppsummering(rader, NOVEMBER)?.oftest).toBeNull();
    });
  });

  describe('en avkortet liste gir aldri en oppsummering som ser hel ut', () => {
    const iSesong = [funn('2026-11-02T09:00:00Z'), funn('2026-09-05T10:00:00Z')];

    it('radtaket traff inne i sesongen: ingen oppsummering', () => {
      expect(sesongoppsummering(iSesong, NOVEMBER, { avkortet: true })).toBeNull();
    });

    it('radtaket traff, men lista rekker tilbake til en tidligere sesong: sesongen er hel', () => {
      const rader = [...iSesong, funn('2025-10-01T10:00:00Z')];
      expect(sesongoppsummering(rader, NOVEMBER, { avkortet: true })).toMatchObject({ funn: 2, forste: '2026-09-05' });
    });

    it('uten radtak er lista hel uansett', () => {
      expect(sesongoppsummering(iSesong, NOVEMBER)).toMatchObject({ funn: 2 });
      expect(sesongoppsummering(iSesong, NOVEMBER, { avkortet: false })).toMatchObject({ funn: 2 });
    });
  });
});
