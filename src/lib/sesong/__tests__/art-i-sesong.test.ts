import { describe, expect, it } from 'vitest';
import { baseSeasonMask, isMonthInMask, monthMask } from '@/lib/utils/season-region';
import { erArtISesong, type ArtMedSesong } from '../art-i-sesong';

/**
 * Ekte rader fra mushroom_species: id-ene matcher de empiriske vinduene i
 * season-window-data.ts, og katalogmånedene står slik migrasjon 009 skrev dem.
 */
const kantarell = { id: 1, edibility: 'edible', season_start: 7, season_end: 9 };
const svartTrompetsopp = { id: 4, edibility: 'edible', season_start: 9, season_end: 10 };
const piggsopp = { id: 7, edibility: 'edible', season_start: 9, season_end: 11 };
/** Ingen empirisk kurve for denne id-en: da er katalogvinduet hele vinduet. */
const vinterart = { id: 999999, edibility: 'edible', season_start: 10, season_end: 3 };

const MANEDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const iKatalogen = (art: { season_start: number; season_end: number }, maaned: number) =>
  isMonthInMask(monthMask(art.season_start, art.season_end), maaned);

describe('erArtISesong', () => {
  it('piggsopp er i sesong i august, selv om katalogen sier sep–nov', () => {
    // Feilen: /api/prediction/regions spurte katalogen og fikk «nei», mens
    // rasteret satte piggsopp øverst og kalenderen viste den som i sesong.
    expect(iKatalogen(piggsopp, 8)).toBe(false);
    expect(erArtISesong(piggsopp, 8)).toBe(true);
  });

  it('svart trompetsopp i august og kantarell i juni og oktober er i sesong', () => {
    expect(iKatalogen(svartTrompetsopp, 8)).toBe(false);
    expect(erArtISesong(svartTrompetsopp, 8)).toBe(true);
    for (const maaned of [6, 10]) {
      expect(iKatalogen(kantarell, maaned)).toBe(false);
      expect(erArtISesong(kantarell, maaned)).toBe(true);
    }
  });

  it('kantarell er utenfor sesong i januar — vinduet er utvidet, ikke åpnet', () => {
    expect(erArtISesong(kantarell, 1)).toBe(false);
    expect(erArtISesong(kantarell, 5)).toBe(false);
    expect(erArtISesong(kantarell, 12)).toBe(false);
    expect(erArtISesong(piggsopp, 12)).toBe(false);
    expect(erArtISesong(svartTrompetsopp, 6)).toBe(false);
  });

  it('svarer som kalenderens vindu, måned for måned', () => {
    // Én regel for «i sesong» i hele appen: kalenderen, artssidene og dette.
    for (const art of [kantarell, svartTrompetsopp, piggsopp, vinterart]) {
      for (const maaned of MANEDER) {
        expect(erArtISesong(art, maaned), `art ${art.id}, måned ${maaned}`).toBe(
          isMonthInMask(baseSeasonMask(art), maaned)
        );
      }
    }
  });

  it('er aldri smalere enn katalogen', () => {
    for (const art of [kantarell, svartTrompetsopp, piggsopp, vinterart]) {
      for (const maaned of MANEDER) {
        if (iKatalogen(art, maaned)) expect(erArtISesong(art, maaned)).toBe(true);
      }
    }
  });

  it('følger katalogvinduet over nyttår når arten ikke har empirisk vindu', () => {
    expect(MANEDER.filter((m) => erArtISesong(vinterart, m))).toEqual([1, 2, 3, 10, 11, 12]);
  });

  it('er ukjent (null), ikke «utenfor», når arten eller månedene mangler', () => {
    expect(erArtISesong(null, 8)).toBeNull();
    expect(erArtISesong(undefined, 8)).toBeNull();
    const utenStart: ArtMedSesong = { ...piggsopp, season_start: null };
    const utenSlutt: ArtMedSesong = { ...piggsopp, season_end: undefined };
    expect(erArtISesong(utenStart, 8)).toBeNull();
    expect(erArtISesong(utenSlutt, 8)).toBeNull();
  });

  it('gjør ikke en ugyldig måned om til en annen måned', () => {
    // isMonthInMask klemmer 13 → desember og 0 → januar. Vinterarten er i
    // sesong begge de månedene, så uten sperren ville svaret blitt `true`.
    for (const ugyldig of [0, 13, -1, 8.5, Number.NaN]) {
      expect(erArtISesong(vinterart, ugyldig)).toBeNull();
    }
  });

  it('trenger ikke spiselighet for å svare — vinduet er det samme for farlige arter', () => {
    // baseSeasonMask er vinduet uten regionjustering, og det eneste farlige
    // arter noen gang får (sperre B i season-region.ts).
    for (const edibility of ['deadly', 'toxic', null, undefined]) {
      expect(erArtISesong({ ...piggsopp, edibility }, 8)).toBe(true);
      expect(erArtISesong({ ...piggsopp, edibility }, 1)).toBe(false);
    }
  });
});
