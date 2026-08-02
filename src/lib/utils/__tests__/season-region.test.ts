import { describe, expect, it } from 'vitest';
import {
  baseSeasonMask,
  isMonthInMask,
  latitudeBand,
  monthMask,
  monthsInMask,
  nextMonth,
  peakMask,
  seasonMask,
  seasonMonthRanges,
  type LatitudeBand,
  type SeasonSpecies
} from '@/lib/utils/season-region';
import { SEASON_WINDOWS } from '@/lib/utils/season-window-data';

/**
 * Bakgrunn: kalenderen forskjøv hele sesongvinduet «4 dager senere per
 * breddegrad nord for 60°N», opptil 35 døgn. I august i Nord-Norge ga det to
 * feil på én gang — den DØDELIGE steinmorkelen ble merket «i sesong nå», mens
 * kantarell og steinsopp forsvant fra listen. I tillegg var katalogvinduene
 * systematisk for smale målt mot de daterte funnene i basen.
 *
 * Artene under er ekte rader fra mushroom_species (id-ene matcher de empiriske
 * vinduene i season-window-data.ts), med katalogvinduene slik de står i
 * migrasjonene.
 */
const AUGUST = 8;

const steinmorkel: SeasonSpecies = { id: 57, edibility: 'deadly', season_start: 4, season_end: 6 };
const kantarell: SeasonSpecies = { id: 1, edibility: 'edible', season_start: 7, season_end: 9 };
const steinsopp: SeasonSpecies = { id: 2, edibility: 'edible', season_start: 7, season_end: 10 };
const piggsopp: SeasonSpecies = { id: 7, edibility: 'edible', season_start: 9, season_end: 11 };
const flatklokkehatt: SeasonSpecies = { id: 56, edibility: 'deadly', season_start: 8, season_end: 11 };

/** Tromsø ≈ 69,6°N — det var her august-feilen ble sett. */
const NORD = latitudeBand(69.6);
const BANDS: LatitudeBand[] = ['south', 'central', 'north'];

describe('august i Nord-Norge — den rapporterte feilen', () => {
  it('den dødelige steinmorkelen er IKKE i sesong i august, heller ikke i nord', () => {
    expect(isMonthInMask(seasonMask(steinmorkel, NORD), AUGUST)).toBe(false);
    for (const band of [null, ...BANDS]) {
      expect(isMonthInMask(seasonMask(steinmorkel, band), AUGUST)).toBe(false);
    }
  });

  it('steinmorkelen står i sesong om våren, der den hører hjemme', () => {
    const mask = seasonMask(steinmorkel, NORD);
    expect(monthsInMask(mask)).toEqual([4, 5, 6]);
  });

  it('kantarell og steinsopp forsvinner ikke fra august i nord', () => {
    expect(isMonthInMask(seasonMask(kantarell, NORD), AUGUST)).toBe(true);
    expect(isMonthInMask(seasonMask(steinsopp, NORD), AUGUST)).toBe(true);
  });
});

describe('sperre A — en posisjon kan bare utvide vinduet, aldri fjerne en art', () => {
  it('holder for hver art og hvert bånd i det empiriske datasettet', () => {
    for (const id of Object.keys(SEASON_WINDOWS)) {
      const species: SeasonSpecies = { id: Number(id), edibility: 'edible', season_start: 7, season_end: 9 };
      const base = baseSeasonMask(species);
      for (const band of BANDS) {
        const adjusted = seasonMask(species, band);
        // Alle månedene i base må fortsatt være med.
        expect((adjusted & base) === base).toBe(true);
      }
    }
  });

  it('gjelder også arter uten empirisk vindu i det hele tatt', () => {
    const ukjentArt: SeasonSpecies = { id: 999999, edibility: 'edible', season_start: 7, season_end: 9 };
    for (const band of BANDS) {
      expect(seasonMask(ukjentArt, band)).toBe(monthMask(7, 9));
    }
  });
});

describe('sperre B — en farlig art blir aldri løftet fram av en regionjustering', () => {
  it('dødelig art får nøyaktig samme vindu i alle bånd', () => {
    for (const id of Object.keys(SEASON_WINDOWS)) {
      const species: SeasonSpecies = { id: Number(id), edibility: 'deadly', season_start: 8, season_end: 10 };
      const base = baseSeasonMask(species);
      for (const band of BANDS) {
        expect(seasonMask(species, band)).toBe(base);
      }
    }
  });

  it('gjelder også giftig og ukjent spiselighet', () => {
    for (const edibility of ['toxic', 'unknown', null, undefined]) {
      const species: SeasonSpecies = { id: 57, edibility, season_start: 4, season_end: 6 };
      for (const band of BANDS) {
        expect(seasonMask(species, band)).toBe(baseSeasonMask(species));
      }
    }
  });

  it('blokkerer de konkrete tilfellene der båndet ellers ville utvidet', () => {
    // Funnene i sør gir steinmorkel mars–mai, og funnene i midten gir
    // flatklokkehatt juli. Begge er dødelige, så ingen av månedene skal inn.
    expect(SEASON_WINDOWS['57'].south).toBeDefined();
    expect(isMonthInMask(SEASON_WINDOWS['57'].south!, 3)).toBe(true);
    expect(isMonthInMask(seasonMask(steinmorkel, 'south'), 3)).toBe(false);

    expect(SEASON_WINDOWS['56'].central).toBeDefined();
    expect(isMonthInMask(SEASON_WINDOWS['56'].central!, 7)).toBe(true);
    expect(isMonthInMask(seasonMask(flatklokkehatt, 'central'), 7)).toBe(false);
  });

  it('en spiselig art med samme id-data ville fått månedene — det er spiselighet, ikke id, som stopper det', () => {
    const spiselig: SeasonSpecies = { ...flatklokkehatt, edibility: 'edible' };
    expect(isMonthInMask(seasonMask(spiselig, 'central'), 7)).toBe(true);
  });
});

describe('sesongvinduene er kalibrert mot de daterte funnene', () => {
  it('piggsopp er i sesong i august — katalogen sa sep–nov, men 37,5 % av funnene lå utenfor', () => {
    expect(isMonthInMask(monthMask(piggsopp.season_start, piggsopp.season_end), AUGUST)).toBe(false);
    expect(isMonthInMask(baseSeasonMask(piggsopp), AUGUST)).toBe(true);
  });

  it('kantarell er i sesong allerede i juni', () => {
    expect(isMonthInMask(baseSeasonMask(kantarell), 6)).toBe(true);
  });

  it('utvider ikke vinduet for arter med kort, skarp sesong', () => {
    // Steinmorkelen har 3809 daterte funn og et smalt vindu — kalibreringen
    // skal ikke gjøre «i sesong» meningsløst ved å blåse opp alle vinduene.
    expect(monthsInMask(baseSeasonMask(steinmorkel))).toEqual([4, 5, 6]);
  });

  it('katalogvinduet er alltid med i det kalibrerte vinduet', () => {
    for (const id of Object.keys(SEASON_WINDOWS)) {
      const species: SeasonSpecies = { id: Number(id), edibility: 'edible', season_start: 9, season_end: 11 };
      const katalog = monthMask(9, 11);
      expect((baseSeasonMask(species) & katalog) === katalog).toBe(true);
    }
  });
});

describe('månedsmasker', () => {
  it('dekker et vanlig intervall', () => {
    expect(monthsInMask(monthMask(7, 9))).toEqual([7, 8, 9]);
  });

  it('wrapper rundt nyttår', () => {
    expect(monthsInMask(monthMask(11, 2))).toEqual([1, 2, 11, 12]);
  });

  it('ett enkelt månedsvindu er én måned, ikke hele året', () => {
    expect(monthsInMask(monthMask(5, 5))).toEqual([5]);
  });

  it('nextMonth wrapper fra desember til januar', () => {
    expect(nextMonth(12)).toBe(1);
    expect(nextMonth(8)).toBe(9);
  });

  it('toppsesong er tom når arten ikke har noen', () => {
    expect(peakMask({ peak_season_start: null, peak_season_end: null })).toBe(0);
    expect(monthsInMask(peakMask({ peak_season_start: 8, peak_season_end: 9 }))).toEqual([8, 9]);
  });
});

describe('seasonMonthRanges — vinduet som tekst på artssiden', () => {
  it('et sammenhengende vindu blir ett intervall', () => {
    expect(seasonMonthRanges(monthMask(7, 10))).toEqual([[7, 10]]);
  });

  it('vinduet over nyttår blir ETT intervall, ikke to', () => {
    // Vintersopp: okt–mars. Uten sammenslåingen ville siden skrevet
    // «jan – mar, okt – des», som ser ut som to adskilte sesonger.
    expect(seasonMonthRanges(monthMask(10, 3))).toEqual([[10, 3]]);
  });

  it('én måned blir et intervall med samme start og slutt', () => {
    expect(seasonMonthRanges(monthMask(9, 9))).toEqual([[9, 9]]);
  });

  it('hele året blir jan – des', () => {
    expect(seasonMonthRanges(monthMask(1, 12))).toEqual([[1, 12]]);
  });

  it('en tom maske gir ingen intervaller', () => {
    expect(seasonMonthRanges(0)).toEqual([]);
  });

  it('to adskilte perioder holdes fra hverandre', () => {
    const mask = monthMask(3, 3) | monthMask(7, 8);
    expect(seasonMonthRanges(mask)).toEqual([
      [3, 3],
      [7, 8]
    ]);
  });

  it('dekker nøyaktig de samme månedene som masken, for alle ekte vinduer', () => {
    for (const id of Object.keys(SEASON_WINDOWS)) {
      const mask = SEASON_WINDOWS[id].all;
      const fromRanges = new Set<number>();
      for (const [start, end] of seasonMonthRanges(mask)) {
        let month = start;
        for (let i = 0; i < 12; i++) {
          fromRanges.add(month);
          if (month === end) break;
          month = month === 12 ? 1 : month + 1;
        }
      }
      expect([...fromRanges].sort((a, b) => a - b)).toEqual(monthsInMask(mask));
    }
  });
});

describe('breddegradsbånd', () => {
  it('deler Norden i tre', () => {
    expect(latitudeBand(59.9)).toBe('south'); // Oslo
    expect(latitudeBand(63.4)).toBe('central'); // Trondheim
    expect(latitudeBand(69.6)).toBe('north'); // Tromsø
  });

  it('er null når posisjonen mangler', () => {
    expect(latitudeBand(null)).toBeNull();
    expect(latitudeBand(undefined)).toBeNull();
    expect(latitudeBand(NaN)).toBeNull();
  });
});
