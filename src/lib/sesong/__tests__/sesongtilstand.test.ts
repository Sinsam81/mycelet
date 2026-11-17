import { describe, expect, it } from 'vitest';
import { isInMushroomSeason, seasonWeight } from '@/lib/prediction/mushroom-day';
import {
  HOVEDSESONG_SLUTTMANED,
  HOVEDSESONG_STARTMANED,
  erUtenomHovedsesong,
  sesongfaseForManed,
  sesongtilstand
} from '../sesongtilstand';

/** Midt på dagen i Oslo, så tidssonen ikke spiller inn. */
const dato = (iso: string) => new Date(`${iso}T11:00:00Z`);

describe('sesongfaseForManed', () => {
  it('gir riktig fase for alle tolv måneder', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(sesongfaseForManed)).toEqual([
      'vinter',
      'vinter',
      'vinter',
      'var',
      'var',
      'forsesong',
      'forsesong',
      'hoysesong',
      'hoysesong',
      'hoysesong',
      'ettersesong',
      'vinter'
    ]);
  });

  it('klemmer ugyldige måneder inn i stedet for å kaste', () => {
    expect(sesongfaseForManed(0)).toBe('vinter');
    expect(sesongfaseForManed(13)).toBe('vinter');
  });
});

describe('låst til vekttabellen i mushroom-day.ts', () => {
  // Hele poenget: en tredje sesongport som glir fra de to andre er feilklassen
  // isInMushroomSeason ble laget for å fjerne.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('måned %i', (maaned) => {
    const t = sesongtilstand(dato(`2026-${String(maaned).padStart(2, '0')}-15`));
    expect(t.maaned).toBe(maaned);
    expect(t.iHovedsesong).toBe(isInMushroomSeason(maaned));
    expect(t.erHoysesong).toBe(seasonWeight(maaned) === 35);
  });

  it('start- og sluttmåned er første og siste måned med vekt over null', () => {
    const iSesong = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(isInMushroomSeason);
    expect(HOVEDSESONG_STARTMANED).toBe(iSesong[0]);
    expect(HOVEDSESONG_SLUTTMANED).toBe(iSesong[iSesong.length - 1]);
  });
});

describe('sesongtilstand', () => {
  it('bruker Oslo-tid, ikke UTC, ved månedsskiftet', () => {
    // 30. november 23:30 UTC er 1. desember 00:30 i Oslo.
    const sent = sesongtilstand(new Date('2026-11-30T23:30:00Z'));
    expect(sent.osloDato).toBe('2026-12-01');
    expect(sent.fase).toBe('vinter');
    // 31. mai 21:30 UTC er fortsatt 31. mai i Oslo (sommertid, UTC+2).
    expect(sesongtilstand(new Date('2026-05-31T21:30:00Z')).fase).toBe('var');
    // 31. mai 22:30 UTC er 1. juni 00:30 i Oslo.
    expect(sesongtilstand(new Date('2026-05-31T22:30:00Z')).fase).toBe('forsesong');
  });

  it('teller ingenting ned inne i hovedsesongen', () => {
    for (const iso of ['2026-06-01', '2026-09-15', '2026-11-30']) {
      const t = sesongtilstand(dato(iso));
      expect(t.iHovedsesong).toBe(true);
      expect(t.manederTilHovedsesong).toBe(0);
      expect(t.dagerTilHovedsesong).toBe(0);
    }
  });

  it('teller måneder og dager til neste 1. juni, også over nyttår', () => {
    expect(sesongtilstand(dato('2026-12-01'))).toMatchObject({
      fase: 'vinter',
      manederTilHovedsesong: 6,
      dagerTilHovedsesong: 182
    });
    expect(sesongtilstand(dato('2027-01-15'))).toMatchObject({
      manederTilHovedsesong: 5,
      dagerTilHovedsesong: 137
    });
    expect(sesongtilstand(dato('2027-05-31'))).toMatchObject({
      fase: 'var',
      manederTilHovedsesong: 1,
      dagerTilHovedsesong: 1
    });
  });

  it('erUtenomHovedsesong er sann desember–mai', () => {
    expect(erUtenomHovedsesong(dato('2026-11-10'))).toBe(false);
    expect(erUtenomHovedsesong(dato('2026-12-10'))).toBe(true);
    expect(erUtenomHovedsesong(dato('2027-04-10'))).toBe(true);
    expect(erUtenomHovedsesong(dato('2027-06-10'))).toBe(false);
  });
});
