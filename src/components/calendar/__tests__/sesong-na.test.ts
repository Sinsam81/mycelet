import { describe, expect, it } from 'vitest';
import { ARTSKATALOG, type KatalogArt } from '@/lib/species/__tests__/artskatalog-fixture';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import { isMonthInMask, peakMask, seasonMask, type LatitudeBand } from '@/lib/utils/season-region';
import { compareSpeciesByDisplayName } from '@/lib/utils/species-name';
import { sesongNa } from '../sesong-na';

/**
 * Kalenderens øverste del, regnet ut mot hele den ekte katalogen (80 arter) og
 * de ekte sesongvinduene.
 *
 * To ting holdes fast:
 *  1. en giftig eller dødelig art står ALDRI i lista «i sesong nå» sammen med
 *     matsoppene — den har sin egen blokk, uten toppsesong-løft, og
 *  2. siden har noe å si om hva som kommer også fra november til februar, da
 *     «Kommer snart» før var borte.
 */

/** Slik siden sender lista inn: sortert på navnet leseren ser. */
const KATALOG = [...ARTSKATALOG].sort((a, b) => compareSpeciesByDisplayName(a, b, 'nb'));
const navn = (arter: readonly KatalogArt[]) => arter.map((art) => art.norwegian_name);
const MANEDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const BAND: Array<LatitudeBand | null> = [null, 'south', 'central', 'north'];

describe('giftige og dødelige arter står aldri blant matsoppene', () => {
  it('ingen farlig art i «i sesong nå», for noen måned eller noe breddegradsbånd', () => {
    for (const band of BAND) {
      for (const maaned of MANEDER) {
        const { iSesong, farligeISesong } = sesongNa(KATALOG, maaned, band);
        expect(iSesong.filter((art) => isDangerousEdibility(art.edibility)), `måned ${maaned}, ${band}`).toEqual([]);
        expect(farligeISesong.every((art) => isDangerousEdibility(art.edibility)), `måned ${maaned}, ${band}`).toBe(true);
      }
    }
  });

  it('de to blokkene er til sammen nøyaktig artene som er i sesong — ingen forsvinner i delingen', () => {
    for (const band of BAND) {
      for (const maaned of MANEDER) {
        const { iSesong, farligeISesong } = sesongNa(KATALOG, maaned, band);
        const ute = KATALOG.filter((art) => isMonthInMask(seasonMask(art, band), maaned));
        expect(new Set([...iSesong, ...farligeISesong])).toEqual(new Set(ute));
        expect(iSesong.length + farligeISesong.length).toBe(ute.length);
      }
    }
  });

  it('november: tjue arter i hovedlista, og de fire giftige for seg', () => {
    const { iSesong, farligeISesong } = sesongNa(KATALOG, 11, null);
    expect(iSesong).toHaveLength(20);
    expect(navn(farligeISesong)).toEqual(['Flatklokkehatt', 'Pantermusserong', 'Potetrøyksopp', 'Svovelsopp']);
  });

  it('september: sytten farlige arter er ute samtidig med matsoppene — alle i egen blokk', () => {
    const { iSesong, farligeISesong } = sesongNa(KATALOG, 9, null);
    expect(farligeISesong).toHaveLength(17);
    expect(navn(farligeISesong)).toContain('Hvit fluesopp');
    expect(navn(farligeISesong)).toContain('Grønn fluesopp');
    expect(navn(iSesong)).not.toContain('Hvit fluesopp');
    expect(navn(iSesong)).toContain('Kantarell');
  });

  it('ukjent spiselighet havner på den farlige siden', () => {
    const ukjent = { ...KATALOG.find((art) => art.norwegian_name === 'Kantarell')!, edibility: 'unknown' as const };
    const { iSesong, farligeISesong } = sesongNa([ukjent], 8, null);
    expect(iSesong).toEqual([]);
    expect(farligeISesong).toEqual([ukjent]);
  });

  it('den farlige blokka står i rekkefølgen den kom inn — aldri sortert på toppsesong', () => {
    for (const maaned of MANEDER) {
      const { farligeISesong } = sesongNa(KATALOG, maaned, null);
      expect(navn(farligeISesong)).toEqual(navn(KATALOG.filter((art) => farligeISesong.includes(art))));
    }
  });
});

describe('hovedlista: toppsesong først', () => {
  it('november løfter de sju i toppsesong, og lar resten stå alfabetisk', () => {
    const { iSesong } = sesongNa(KATALOG, 11, null);
    expect(navn(iSesong).slice(0, 7)).toEqual([
      'Blå ridderhatt',
      'Frostvokssopp',
      'Gråmusserong',
      'Judasøre',
      'Piggsopp',
      'Vintersopp',
      'Østerssopp'
    ]);
    expect(navn(iSesong).slice(7, 10)).toEqual(['Ametystsopp', 'Blomkålsopp', 'Falsk kantarell']);
  });

  it('holder for hver måned: alle i toppsesong før alle andre, og hver gruppe i innkommende rekkefølge', () => {
    for (const maaned of MANEDER) {
      const { iSesong } = sesongNa(KATALOG, maaned, null);
      const iTopp = iSesong.filter((art) => isMonthInMask(peakMask(art), maaned));
      const resten = iSesong.filter((art) => !isMonthInMask(peakMask(art), maaned));
      expect(iSesong).toEqual([...iTopp, ...resten]);
      expect(navn(iTopp)).toEqual(navn(KATALOG.filter((art) => iTopp.includes(art))));
      expect(navn(resten)).toEqual(navn(KATALOG.filter((art) => resten.includes(art))));
    }
  });
});

describe('neste ut', () => {
  const MORKLENE = ['Spiss morkel', 'Stankmorkel', 'Vanlig morkel', 'Sandmorkel'];

  it('desember: april er neste — fire måneder fram, over nyttår', () => {
    const { nesteUt } = sesongNa(KATALOG, 12, null);
    expect(nesteUt?.maaned).toBe(4);
    expect(nesteUt?.manederFram).toBe(4);
    expect(navn(nesteUt!.arter)).toEqual(MORKLENE);
  });

  it('den dødelige sandmorkelen står SIST, etter morklene den ligner', () => {
    const { nesteUt } = sesongNa(KATALOG, 12, null);
    const arter = nesteUt!.arter;
    expect(arter.at(-1)?.norwegian_name).toBe('Sandmorkel');
    expect(arter.at(-1)?.edibility).toBe('deadly');
    const forsteFarlige = arter.findIndex((art) => isDangerousEdibility(art.edibility));
    expect(arter.slice(forsteFarlige).every((art) => isDangerousEdibility(art.edibility))).toBe(true);
  });

  it('november, januar og februar peker også på april', () => {
    expect(sesongNa(KATALOG, 11, null).nesteUt).toMatchObject({ maaned: 4, manederFram: 5 });
    expect(sesongNa(KATALOG, 1, null).nesteUt).toMatchObject({ maaned: 4, manederFram: 3 });
    expect(sesongNa(KATALOG, 2, null).nesteUt).toMatchObject({ maaned: 4, manederFram: 2 });
  });

  it('mars: april er neste måned — den gamle «Kommer snart», med samme arter', () => {
    const { nesteUt } = sesongNa(KATALOG, 3, null);
    expect(nesteUt).toMatchObject({ maaned: 4, manederFram: 1 });
    expect(navn(nesteUt!.arter)).toEqual(MORKLENE);
  });

  it('august: det som kommer i september vises, selv om det er høysesong', () => {
    const { nesteUt } = sesongNa(KATALOG, 8, null);
    expect(nesteUt).toMatchObject({ maaned: 9, manederFram: 1 });
    expect(navn(nesteUt!.arter)).toEqual(['Blå ridderhatt', 'Frostvokssopp', 'Gråmusserong', 'Vintersopp']);
  });

  it('september og oktober: ingenting — «neste ut: april» midt i høysesongen er bare støy', () => {
    expect(sesongNa(KATALOG, 9, null).nesteUt).toBeNull();
    expect(sesongNa(KATALOG, 10, null).nesteUt).toBeNull();
  });

  it('artene i «neste ut» er aldri i sesong nå, og alltid i sesong i måneden de loves', () => {
    for (const band of BAND) {
      for (const maaned of MANEDER) {
        const { nesteUt } = sesongNa(KATALOG, maaned, band);
        if (!nesteUt) continue;
        expect(nesteUt.arter.length).toBeGreaterThan(0);
        expect(nesteUt.manederFram).toBe((nesteUt.maaned - maaned + 12) % 12);
        for (const art of nesteUt.arter) {
          expect(isMonthInMask(seasonMask(art, band), maaned), `${art.norwegian_name} nå`).toBe(false);
          expect(isMonthInMask(seasonMask(art, band), nesteUt.maaned), `${art.norwegian_name} da`).toBe(true);
        }
      }
    }
  });

  it('ingen art kommer i sesong i en måned mellom nå og «neste ut»', () => {
    for (const maaned of [11, 12, 1, 2]) {
      const { nesteUt } = sesongNa(KATALOG, maaned, null);
      let mellom = maaned === 12 ? 1 : maaned + 1;
      while (mellom !== nesteUt!.maaned) {
        const m = mellom;
        const nye = KATALOG.filter(
          (art) => !isMonthInMask(seasonMask(art, null), maaned) && isMonthInMask(seasonMask(art, null), m)
        );
        expect(navn(nye), `måned ${m}`).toEqual([]);
        mellom = mellom === 12 ? 1 : mellom + 1;
      }
    }
  });

  it('en posisjon i sør trekker ikke den dødelige sandmorkelen fram til mars', () => {
    // Funnene i sør gir sandmorkel fra mars, men farlige arter får aldri
    // regionjustering (sperre B i season-region.ts) — heller ikke framover.
    expect(sesongNa(KATALOG, 2, 'south').nesteUt).toMatchObject({ maaned: 4, manederFram: 2 });
    expect(navn(sesongNa(KATALOG, 3, 'south').farligeISesong)).not.toContain('Sandmorkel');
  });

  it('en helårsart alene gir ingen «neste ut»', () => {
    const judasore = KATALOG.filter((art) => art.norwegian_name === 'Judasøre');
    for (const maaned of MANEDER) {
      expect(sesongNa(judasore, maaned, null).nesteUt).toBeNull();
    }
  });
});

describe('kanttilfeller', () => {
  it('uten arter er alt tomt', () => {
    expect(sesongNa([], 12, null)).toEqual({ iSesong: [], farligeISesong: [], nesteUt: null });
  });

  it('en måned utenfor 1–12 klemmes inn som i maskene — 13 er desember, 0 er januar', () => {
    expect(sesongNa(KATALOG, 13, null)).toEqual(sesongNa(KATALOG, 12, null));
    expect(sesongNa(KATALOG, 0, null)).toEqual(sesongNa(KATALOG, 1, null));
  });

  it('en måned som ikke er et tall gir ingenting, ikke januar', () => {
    expect(sesongNa(KATALOG, Number.NaN, null)).toEqual({ iSesong: [], farligeISesong: [], nesteUt: null });
  });

  it('endrer ikke lista som kom inn', () => {
    const inn = [...KATALOG];
    sesongNa(inn, 11, 'north');
    expect(inn).toEqual(KATALOG);
  });
});
